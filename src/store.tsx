/**
 * React context managing Yjs document, WebRTC peer connections, and session lifecycle
 * for the scrum poker app.
 *
 * Architecture: Star topology. The host maintains a data channel to each joiner
 * and relays Yjs updates between them. Joiners only connect to the host.
 *
 * Yjs shared state:
 *   - doc.getMap("participants")  → Y.Map<string>  (peerId → displayName)
 *   - doc.getMap("votes")         → Y.Map<string>  (peerId → card value)
 *   - doc.getMap("meta")          → Y.Map          (roomName: string, revealed: boolean)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { createOffer, acceptOffer, acceptAnswer } from "./webrtc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionState =
  | "idle"
  | "connecting"
  | "hosting"
  | "connected"
  | "error";

export type PeerStatus = "connecting" | "connected" | "disconnected";

export interface PeerInfo {
  peerId: string;
  status: PeerStatus;
}

interface PeerEntry {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  status: PeerStatus;
  disconnectedAt?: number;
  participantKey?: string;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface StoreCtx {
  doc: Y.Doc;

  sessionState: SessionState;
  sessionName: string | null;
  localPeerId: string | null;
  peerCount: number;
  peers: PeerInfo[];
  errorMessage: string | null;

  connectToSession: (name: string, displayName: string) => void;
  leaveSession: () => void;
}

const Ctx = createContext<StoreCtx>(null!);

export function useStore() {
  return useContext(Ctx);
}

/**
 * Hook that triggers a React re-render whenever the Yjs document is updated.
 * Call this at the top of any component that reads from the Y.Doc.
 */
export function useYjsSnapshot() {
  const { doc } = useStore();
  const versionRef = useRef(0);
  return useSyncExternalStore(
    (cb) => {
      const handler = () => {
        versionRef.current++;
        cb();
      };
      doc.on("update", handler);
      return () => doc.off("update", handler);
    },
    () => versionRef.current,
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StoreProvider({ children }: { children: ReactNode }) {
  const docRef = useRef(new Y.Doc());
  const doc = docRef.current;

  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const isHostRef = useRef(false);
  const hostIdRef = useRef<string | null>(null);
  const sessionNameRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // -- Broadcast Yjs updates to peers --------------------------------------

  const broadcastUpdate = useCallback(
    (update: Uint8Array, excludePeerId?: string) => {
      for (const [pid, peer] of peersRef.current) {
        if (pid === excludePeerId) continue;
        if (peer.dc && peer.dc.readyState === "open") {
          peer.dc.send(update as Uint8Array<ArrayBuffer>);
        }
      }
    },
    [],
  );

  // Forward local Yjs mutations to all peers
  useEffect(() => {
    const handler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      broadcastUpdate(update);
    };
    doc.on("update", handler);
    return () => doc.off("update", handler);
  }, [doc, broadcastUpdate]);

  // Track participant keys for connected peers (host only)
  useEffect(() => {
    const participants = doc.getMap("participants");
    const handler = (event: Y.YMapEvent<unknown>) => {
      if (!isHostRef.current) return;
      // Find newly added keys
      const knownKeys = new Set<string>();
      for (const entry of peersRef.current.values()) {
        if (entry.participantKey) knownKeys.add(entry.participantKey);
      }
      knownKeys.add("host");

      for (const [key, change] of event.changes.keys) {
        if (change.action === "add" && !knownKeys.has(key)) {
          // Assign to the most recently connected peer without a participantKey
          for (const entry of peersRef.current.values()) {
            if (entry.status === "connected" && !entry.participantKey) {
              entry.participantKey = key;
              break;
            }
          }
        }
      }
    };
    participants.observe(handler);
    return () => participants.unobserve(handler);
  }, [doc]);

  // -- Peer state tracking --------------------------------------------------

  const updatePeersState = useCallback(() => {
    const list: PeerInfo[] = [];
    let count = 0;
    for (const entry of peersRef.current.values()) {
      list.push({ peerId: entry.peerId, status: entry.status });
      if (entry.status === "connected") count++;
    }
    setPeers(list);
    setPeerCount(count);
  }, []);

  const markDisconnected = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (peer && peer.status !== "disconnected") {
        peer.pc.close();
        peer.status = "disconnected";
        peer.disconnectedAt = Date.now();
        updatePeersState();
      }
    },
    [updatePeersState],
  );

  // -- Host: handle incoming Yjs update from a specific peer ----------------

  const makeHostOnMessage = useCallback(
    (fromPeerId: string) => (data: Uint8Array) => {
      Y.applyUpdate(doc, data, "remote");
      broadcastUpdate(data, fromPeerId);
    },
    [doc, broadcastUpdate],
  );

  // -- Monitor RTCPeerConnection for disconnect -----------------------------

  const monitorPcDisconnect = useCallback(
    (pc: RTCPeerConnection, peerId: string) => {
      const handler = () => {
        const state = pc.connectionState;
        if (state === "disconnected" || state === "failed") {
          markDisconnected(peerId);
          pc.removeEventListener("connectionstatechange", handler);
        }
      };
      pc.addEventListener("connectionstatechange", handler);
      handler(); // check immediately
    },
    [markDisconnected],
  );

  // -- Host: create a new offer and post it to the server -------------------

  const createAndPostOffer = useCallback(
    async (
      name: string,
      hostId: string,
    ): Promise<{
      pc: RTCPeerConnection;
      dc: RTCDataChannel;
      peerId: string;
    } | null> => {
      const peerId = crypto.randomUUID();

      const entry: PeerEntry = {
        peerId,
        pc: null!,
        dc: null,
        status: "connecting",
      };
      peersRef.current.set(peerId, entry);
      updatePeersState();

      let pc: RTCPeerConnection;
      let dc: RTCDataChannel;
      let offerString: string;
      try {
        const result = await createOffer(
          makeHostOnMessage(peerId),
          () => {
            // onOpen — send full state snapshot to new peer
            const peer = peersRef.current.get(peerId);
            if (peer) {
              peer.status = "connected";
              if (peer.dc && peer.dc.readyState === "open") {
                peer.dc.send(Y.encodeStateAsUpdate(doc) as Uint8Array<ArrayBuffer>);
              }
            }
            updatePeersState();
          },
          () => markDisconnected(peerId),
        );
        pc = result.pc;
        dc = result.dc;
        offerString = result.offerString;
      } catch {
        peersRef.current.delete(peerId);
        updatePeersState();
        return null;
      }

      entry.pc = pc;
      entry.dc = dc;

      monitorPcDisconnect(pc, peerId);

      // Post offer to server
      const isFirst = !hostIdRef.current;
      if (isFirst) {
        hostIdRef.current = hostId;
        const res = await fetch("/api/signaling?action=create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, hostId, offer: offerString }),
        });
        const data = await res.json();
        if (!data.ok) {
          pc.close();
          peersRef.current.delete(peerId);
          updatePeersState();
          return null;
        }
      } else {
        await fetch("/api/signaling?action=replace-offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: name, hostId, offer: offerString }),
        });
      }

      return { pc, dc, peerId };
    },
    [doc, makeHostOnMessage, updatePeersState, markDisconnected, monitorPcDisconnect],
  );

  // -- Host flow: poll for answers ------------------------------------------

  const runHostPolling = useCallback(
    async (
      name: string,
      hostId: string,
      firstPeerId: string,
      firstPc: RTCPeerConnection,
      signal: AbortSignal,
    ) => {
      let currentPeerId = firstPeerId;
      let currentPc = firstPc;

      while (!signal.aborted) {
        try {
          const r = await fetch(
            `/api/signaling?action=poll-answer&session=${encodeURIComponent(name)}&hostId=${encodeURIComponent(hostId)}`,
            { signal },
          );
          const d = await r.json();

          if (d.ok && d.peerId && d.answer) {
            // Complete handshake
            const peer = peersRef.current.get(currentPeerId);
            if (peer && peer.pc === currentPc) {
              await acceptAnswer(currentPc, d.answer);
            }
            // Create next offer for the next joiner
            const next = await createAndPostOffer(name, hostId);
            if (next) {
              currentPeerId = next.peerId;
              currentPc = next.pc;
            }
          } else {
            // No answer yet — wait before polling again
            await sleep(1000, signal);
          }
        } catch (err) {
          if (signal.aborted) return;
          console.warn("Host poll error:", err);
          await sleep(1000, signal);
        }
      }
    },
    [createAndPostOffer],
  );

  // -- Connect to session ---------------------------------------------------

  const connectToSession = useCallback(
    (name: string, displayName: string) => {
      // Tear down any previous session
      abortRef.current?.abort();
      for (const peer of peersRef.current.values()) peer.pc.close();
      peersRef.current.clear();

      const ac = new AbortController();
      abortRef.current = ac;

      setSessionState("connecting");
      setErrorMessage(null);
      setSessionName(name);
      sessionNameRef.current = name;
      isHostRef.current = false;
      hostIdRef.current = null;

      const run = async () => {
        while (!ac.signal.aborted) {
          try {
            // Reset Yjs doc on first attempt / retry
            const participants = doc.getMap("participants");
            const meta = doc.getMap("meta");

            // Clean up old connections on retry
            for (const peer of peersRef.current.values()) peer.pc.close();
            peersRef.current.clear();
            updatePeersState();

            // Ask server for role
            const res = await fetch("/api/signaling?action=join-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
              signal: ac.signal,
            });
            const data = await res.json();

            if (!data.ok) {
              throw new Error(data.error || "Session busy");
            }

            if (data.role === "host") {
              // -- Become host --
              isHostRef.current = true;
              const hostId = crypto.randomUUID();

              // Add self to participants and set room metadata
              const localKey = "host";
              setLocalPeerId(localKey);
              participants.set(localKey, displayName);
              meta.set("roomName", name);
              meta.set("revealed", false);

              const result = await createAndPostOffer(name, hostId);
              if (!result) throw new Error("Failed to create session");

              setSessionState("hosting");

              // Poll forever (until aborted)
              await runHostPolling(
                name,
                hostId,
                result.peerId,
                result.pc,
                ac.signal,
              );
              return; // aborted
            }

            // -- Become joiner --
            if (!data.offer) throw new Error("No offer from host");
            const localKey = "joiner-" + crypto.randomUUID().slice(0, 8);
            setLocalPeerId(localKey);
            participants.set(localKey, displayName);

            const peerId = crypto.randomUUID();
            const result = await acceptOffer(
              data.offer,
              (msg: Uint8Array) => Y.applyUpdate(doc, msg, "remote"),
              () => {
                const hostEntry = peersRef.current.get("host");
                if (hostEntry) hostEntry.status = "connected";
                setSessionState("connected");
                updatePeersState();
              },
              () => {
                markDisconnected("host");
                setSessionState("connecting");
              },
            );

            peersRef.current.set("host", {
              peerId: "host",
              pc: result.pc,
              dc: null,
              status: "connecting",
            });
            updatePeersState();

            monitorPcDisconnect(result.pc, "host");

            result.dc.then((dc) => {
              const entry = peersRef.current.get("host");
              if (entry) entry.dc = dc;
            });

            // Submit answer
            await fetch("/api/signaling?action=submit-answer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session: name,
                peerId,
                answer: result.answerString,
              }),
              signal: ac.signal,
            });

            // Wait for disconnect, then retry
            await new Promise<void>((resolve) => {
              const checkDisconnect = () => {
                const state = result.pc.connectionState;
                if (state === "disconnected" || state === "failed") {
                  result.pc.removeEventListener(
                    "connectionstatechange",
                    checkDisconnect,
                  );
                  resolve();
                }
              };
              result.pc.addEventListener(
                "connectionstatechange",
                checkDisconnect,
              );
              result.dc.then((dc) => {
                dc.addEventListener("close", () => resolve());
              });
              // Also resolve if aborted
              ac.signal.addEventListener("abort", () => resolve());
            });

            if (ac.signal.aborted) return;

            // Clean up and retry
            result.pc.close();
            peersRef.current.delete("host");
            updatePeersState();
            setSessionState("connecting");
            isHostRef.current = false;
            hostIdRef.current = null;
            await sleep(3000, ac.signal);
          } catch (err) {
            if (ac.signal.aborted) return;
            console.warn("Session error, retrying:", (err as Error)?.message);
            setSessionState("connecting");
            isHostRef.current = false;
            hostIdRef.current = null;
            await sleep(3000, ac.signal);
          }
        }
      };

      run().catch((err) => {
        if (ac.signal.aborted) return;
        console.error("Session stream error:", err);
        setSessionState("error");
        setErrorMessage(err?.message || "Connection failed");
      });
    },
    [
      doc,
      createAndPostOffer,
      runHostPolling,
      updatePeersState,
      markDisconnected,
      monitorPcDisconnect,
    ],
  );

  // -- Leave session --------------------------------------------------------

  const leaveSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const wasHost = isHostRef.current;
    const name = sessionNameRef.current;
    const hostId = hostIdRef.current;

    // Clean up all peer connections
    for (const peer of peersRef.current.values()) peer.pc.close();
    peersRef.current.clear();

    if (wasHost && name && hostId) {
      fetch("/api/signaling?action=delete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hostId }),
      }).catch(() => {});
    }

    hostIdRef.current = null;
    sessionNameRef.current = null;
    isHostRef.current = false;
    setSessionState("idle");
    setSessionName(null);
    setLocalPeerId(null);
    setPeerCount(0);
    setPeers([]);
    setErrorMessage(null);
  }, []);

  // Auto-cleanup stale disconnected peers every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      let changed = false;
      const now = Date.now();
      for (const [pid, entry] of peersRef.current) {
        if (
          entry.status === "disconnected" &&
          entry.disconnectedAt &&
          now - entry.disconnectedAt > 30_000
        ) {
          // Remove participant and vote entries from Yjs
          if (isHostRef.current && entry.participantKey) {
            doc.getMap("participants").delete(entry.participantKey);
            doc.getMap("votes").delete(entry.participantKey);
          }
          peersRef.current.delete(pid);
          changed = true;
        }
      }
      if (changed) updatePeersState();
    }, 10_000);
    return () => clearInterval(interval);
  }, [doc, updatePeersState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        doc,
        sessionState,
        sessionName,
        localPeerId,
        peerCount,
        peers,
        errorMessage,
        connectToSession,
        leaveSession,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
