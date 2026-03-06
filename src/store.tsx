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
// Constants
// ---------------------------------------------------------------------------

const MAX_PARTICIPANTS = 12;

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
  participantStatusMap: Map<string, PeerStatus>;
  peerDisconnectedAtMap: Map<string, number>;
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
  const [participantStatusMap, setParticipantStatusMap] = useState<Map<string, PeerStatus>>(new Map());
  const [peerDisconnectedAtMap, setPeerDisconnectedAtMap] = useState<Map<string, number>>(new Map());
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

  // -- Peer state tracking --------------------------------------------------

  const updatePeersState = useCallback(() => {
    const list: PeerInfo[] = [];
    let count = 0;
    const statusMap = new Map<string, PeerStatus>();
    const dcAtMap = new Map<string, number>();
    for (const entry of peersRef.current.values()) {
      list.push({ peerId: entry.peerId, status: entry.status });
      if (entry.status === "connected") count++;
      if (entry.participantKey) {
        statusMap.set(entry.participantKey, entry.status);
        if (entry.status === "disconnected" && entry.disconnectedAt) {
          dcAtMap.set(entry.participantKey, entry.disconnectedAt);
        }
      }
    }
    // For joiners: map "host" participant key to the host peer status
    const hostEntry = peersRef.current.get("host");
    if (hostEntry) {
      statusMap.set("host", hostEntry.status);
      // Other participants seen through host inherit host's connection status
      const participants = doc.getMap("participants");
      participants.forEach((_name, key) => {
        if (!statusMap.has(key)) {
          statusMap.set(key, hostEntry.status === "connected" ? "connected" : "disconnected");
        }
      });
    }
    setPeers(list);
    setPeerCount(count);
    setParticipantStatusMap(statusMap);
    setPeerDisconnectedAtMap(dcAtMap);
  }, [doc]);

  // Track participant keys for connected peers (host only)
  // Also refresh joiner status map when participants change
  useEffect(() => {
    const participants = doc.getMap("participants");
    const handler = (event: Y.YMapEvent<unknown>) => {
      // For joiners: re-derive status map when participants change
      if (!isHostRef.current) {
        updatePeersState();
        return;
      }

      // For host: assign participant keys to connected peers
      let changed = false;
      for (const [key, change] of event.changes.keys) {
        if (change.action === "delete") continue;

        // Check if this key is already assigned to a connected peer
        let ownedByConnected = false;
        let disconnectedOwner: PeerEntry | undefined;
        for (const entry of peersRef.current.values()) {
          if (entry.participantKey === key) {
            if (entry.status === "connected") {
              ownedByConnected = true;
            } else if (entry.status === "disconnected") {
              disconnectedOwner = entry;
            }
            break;
          }
        }
        if (key === "host") ownedByConnected = true;

        if (!ownedByConnected) {
          // Assign to a connected peer without a participantKey
          for (const entry of peersRef.current.values()) {
            if (entry.status === "connected" && !entry.participantKey) {
              entry.participantKey = key;
              if (disconnectedOwner) disconnectedOwner.participantKey = undefined;
              changed = true;
              break;
            }
          }
        }
      }
      if (changed) updatePeersState();
    };
    participants.observe(handler);
    return () => participants.unobserve(handler);
  }, [doc, updatePeersState]);

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
      const participantCount = doc.getMap("participants").size;
      const isFirst = !hostIdRef.current;
      if (isFirst) {
        hostIdRef.current = hostId;
        const res = await fetch("/api/signaling?action=create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, hostId, offer: offerString, participantCount }),
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
          body: JSON.stringify({ session: name, hostId, offer: offerString, participantCount }),
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
      let currentPeerId: string | null = firstPeerId;
      let currentPc: RTCPeerConnection | null = firstPc;

      while (!signal.aborted) {
        try {
          const participantCount = doc.getMap("participants").size;

          // If no offer is pending and room has capacity, create one
          if (!currentPc && participantCount < MAX_PARTICIPANTS) {
            const next = await createAndPostOffer(name, hostId);
            if (next) {
              currentPeerId = next.peerId;
              currentPc = next.pc;
            }
          }

          const r = await fetch(
            `/api/signaling?action=poll-answer&session=${encodeURIComponent(name)}&hostId=${encodeURIComponent(hostId)}&participantCount=${participantCount}`,
            { signal },
          );
          const d = await r.json();

          if (d.ok && d.peerId && d.answer) {
            // Complete handshake — wrap in try/catch so a failed answer
            // doesn't prevent creating the next offer (race condition fix)
            if (currentPeerId && currentPc) {
              const peer = peersRef.current.get(currentPeerId);
              if (peer && peer.pc === currentPc) {
                try {
                  await acceptAnswer(currentPc, d.answer);
                } catch (err) {
                  console.warn("Failed to accept answer:", err);
                  markDisconnected(currentPeerId);
                }
              }
            }
            // Create next offer if room has capacity
            const newCount = doc.getMap("participants").size;
            if (newCount < MAX_PARTICIPANTS) {
              const next = await createAndPostOffer(name, hostId);
              if (next) {
                currentPeerId = next.peerId;
                currentPc = next.pc;
              } else {
                currentPeerId = null;
                currentPc = null;
              }
            } else {
              currentPeerId = null;
              currentPc = null;
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
    [doc, createAndPostOffer, markDisconnected],
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
            // Reset Yjs doc state on retry to prevent stale CRDT data merging
            const participants = doc.getMap("participants");
            const votes = doc.getMap("votes");
            const meta = doc.getMap("meta");
            doc.transact(() => {
              participants.forEach((_v, k) => participants.delete(k));
              votes.forEach((_v, k) => votes.delete(k));
              meta.forEach((_v, k) => meta.delete(k));
            });

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
              if (data.error === "Room is full") {
                setSessionState("error");
                setErrorMessage("Room is full (max 12 participants)");
                return;
              }
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
            let localKey = sessionStorage.getItem("localPeerId");
            if (!localKey) {
              localKey = "joiner-" + crypto.randomUUID().slice(0, 8);
              sessionStorage.setItem("localPeerId", localKey);
            }
            setLocalPeerId(localKey);
            participants.set(localKey, displayName);

            const peerId = crypto.randomUUID();
            const result = await acceptOffer(
              data.offer,
              (msg: Uint8Array) => Y.applyUpdate(doc, msg, "remote"),
              () => {
                const hostEntry = peersRef.current.get("host");
                if (hostEntry) {
                  hostEntry.status = "connected";
                  // Send our full state to the host (includes participant key
                  // that was set before the DC was open and thus never broadcast)
                  if (hostEntry.dc && hostEntry.dc.readyState === "open") {
                    hostEntry.dc.send(
                      Y.encodeStateAsUpdate(doc) as Uint8Array<ArrayBuffer>,
                    );
                  }
                }
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
              let resolved = false;
              const done = () => { if (!resolved) { resolved = true; resolve(); } };
              const checkDisconnect = () => {
                const state = result.pc.connectionState;
                if (state === "disconnected" || state === "failed") {
                  result.pc.removeEventListener(
                    "connectionstatechange",
                    checkDisconnect,
                  );
                  done();
                }
              };
              result.pc.addEventListener(
                "connectionstatechange",
                checkDisconnect,
              );
              result.dc.then((dc) => {
                dc.addEventListener("close", () => done());
              });
              // Detect network loss instantly via offline event
              const offlineHandler = () => done();
              window.addEventListener("offline", offlineHandler, { once: true });
              // Also resolve if aborted
              ac.signal.addEventListener("abort", () => {
                window.removeEventListener("offline", offlineHandler);
                done();
              });
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

    // Clear Yjs doc state
    const participants = doc.getMap("participants");
    const votes = doc.getMap("votes");
    const meta = doc.getMap("meta");
    doc.transact(() => {
      participants.forEach((_v, k) => participants.delete(k));
      votes.forEach((_v, k) => votes.delete(k));
      meta.forEach((_v, k) => meta.delete(k));
    });

    hostIdRef.current = null;
    sessionNameRef.current = null;
    isHostRef.current = false;
    setSessionState("idle");
    setSessionName(null);
    setLocalPeerId(null);
    setPeerCount(0);
    setPeers([]);
    setParticipantStatusMap(new Map());
    setPeerDisconnectedAtMap(new Map());
    setErrorMessage(null);
  }, [doc]);

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

  // Detect network loss/recovery via browser online/offline events
  useEffect(() => {
    const onOffline = () => {
      // Immediately mark all peers as disconnected for faster UI feedback
      for (const [pid, entry] of peersRef.current) {
        if (entry.status !== "disconnected") {
          entry.status = "disconnected";
          entry.disconnectedAt = Date.now();
        }
      }
      updatePeersState();
      // For joiners, transition to "connecting" state
      if (!isHostRef.current && peersRef.current.has("host")) {
        setSessionState("connecting");
      }
    };
    const onOnline = () => {
      // Network recovered — close stale PCs so the retry loop picks up faster
      for (const entry of peersRef.current.values()) {
        if (entry.status === "disconnected") {
          try { entry.pc.close(); } catch {}
        }
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [updatePeersState]);

  // Graceful cleanup on tab close / refresh (best-effort via sendBeacon)
  useEffect(() => {
    const handler = () => {
      if (isHostRef.current && sessionNameRef.current && hostIdRef.current) {
        // Use sendBeacon for reliable delivery during unload
        const payload = JSON.stringify({
          name: sessionNameRef.current,
          hostId: hostIdRef.current,
        });
        navigator.sendBeacon(
          "/api/signaling?action=delete-session",
          new Blob([payload], { type: "application/json" }),
        );
      }
      // Close all peer connections
      for (const peer of peersRef.current.values()) {
        try { peer.pc.close(); } catch {}
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
        participantStatusMap,
        peerDisconnectedAtMap,
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
