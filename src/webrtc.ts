/**
 * WebRTC primitives for peer-to-peer connections.
 *
 * In the star topology:
 *   - Joiner calls createOffer() -> produces offer string
 *   - Host calls acceptOffer() -> produces answer string
 *   - Joiner calls acceptAnswer() -> connection complete
 *
 * The data channel carries binary Yjs updates (Uint8Array).
 */

export type OnBinaryMessage = (data: Uint8Array) => void;
export type OnOpen = () => void;
export type OnClose = () => void;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ---------------------------------------------------------------------------
// Joiner: create offer (initiates connection + data channel)
// ---------------------------------------------------------------------------

export async function createOffer(
  onMessage: OnBinaryMessage,
  onOpen: OnOpen,
  onClose: OnClose,
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel; offerString: string }> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const candidates: RTCIceCandidateInit[] = [];

  const dc = pc.createDataChannel("yjs", { ordered: true });
  dc.binaryType = "arraybuffer";
  setupDataChannel(dc, onMessage, onOpen, onClose, pc);

  pc.onicecandidate = (e) => {
    if (e.candidate) candidates.push(e.candidate.toJSON());
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const blob = { sdp: pc.localDescription!.toJSON(), candidates };
  return { pc, dc, offerString: encode(blob) };
}

// ---------------------------------------------------------------------------
// Host: accept offer -> produce answer (receives data channel)
// ---------------------------------------------------------------------------

export async function acceptOffer(
  offerString: string,
  onMessage: OnBinaryMessage,
  onOpen: OnOpen,
  onClose: OnClose,
): Promise<{
  pc: RTCPeerConnection;
  dc: Promise<RTCDataChannel>;
  answerString: string;
}> {
  const { sdp: remoteSdp, candidates: remoteCandidates } = decode(offerString);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const localCandidates: RTCIceCandidateInit[] = [];

  const dcPromise = new Promise<RTCDataChannel>((resolve) => {
    pc.ondatachannel = (e) => {
      e.channel.binaryType = "arraybuffer";
      setupDataChannel(e.channel, onMessage, onOpen, onClose);
      resolve(e.channel);
    };
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) localCandidates.push(e.candidate.toJSON());
  };

  try {
    await pc.setRemoteDescription(remoteSdp);
    for (const c of remoteCandidates) await pc.addIceCandidate(c);
  } catch (err) {
    console.warn("acceptOffer: SDP operation failed", err);
    pc.close();
    throw new Error("SDP operation failed in acceptOffer");
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  const blob = {
    sdp: pc.localDescription!.toJSON(),
    candidates: localCandidates,
  };
  return { pc, dc: dcPromise, answerString: encode(blob) };
}

// ---------------------------------------------------------------------------
// Joiner: complete connection with host's answer
// ---------------------------------------------------------------------------

export async function acceptAnswer(
  pc: RTCPeerConnection,
  answerString: string,
) {
  const { sdp, candidates } = decode(answerString);
  try {
    await pc.setRemoteDescription(sdp);
    for (const c of candidates) await pc.addIceCandidate(c);
  } catch (err) {
    console.warn("acceptAnswer: SDP operation failed", err);
    pc.close();
    throw new Error("SDP operation failed in acceptAnswer");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SignalBlob {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
}

export function encode(blob: SignalBlob): string {
  return btoa(JSON.stringify(blob));
}

export function decode(str: string): SignalBlob {
  try {
    return JSON.parse(atob(str)) as SignalBlob;
  } catch {
    throw new Error("Invalid signaling data");
  }
}

function setupDataChannel(
  dc: RTCDataChannel,
  onMessage: OnBinaryMessage,
  onOpen: OnOpen,
  onClose: OnClose,
  pc?: RTCPeerConnection,
) {
  let opened = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const startTimeout = () => {
    timeout = setTimeout(() => {
      if (!opened) {
        console.warn("Data channel open timeout (10s)");
        dc.close();
        onClose();
      }
    }, 10_000);
  };

  // If a PC is provided and it's still in "new" state (pre-created offer),
  // defer the timeout until ICE negotiation actually starts.
  if (pc && pc.connectionState === "new") {
    const handler = () => {
      const state = pc.connectionState;
      if (state === "connecting" || state === "connected") {
        startTimeout();
        pc.removeEventListener("connectionstatechange", handler);
      } else if (state === "failed" || state === "closed") {
        pc.removeEventListener("connectionstatechange", handler);
      }
    };
    pc.addEventListener("connectionstatechange", handler);
  } else {
    startTimeout();
  }

  dc.onopen = () => {
    opened = true;
    if (timeout) clearTimeout(timeout);
    onOpen();
  };
  dc.onclose = () => {
    if (timeout) clearTimeout(timeout);
    onClose();
  };
  dc.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      onMessage(new Uint8Array(e.data));
    }
  };
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 3000);
  });
}
