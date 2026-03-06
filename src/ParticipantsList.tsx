import { useEffect, useState, useRef, type FormEvent } from "react";
import { useStore, useYjsSnapshot, type PeerStatus } from "./store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, Minus, Circle, Pencil } from "lucide-react";

function ConnectivityDot({ status }: { status: PeerStatus }) {
  if (status === "connected") {
    return <Circle className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500 shrink-0" />;
  }
  if (status === "connecting") {
    return <Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500 animate-pulse shrink-0" />;
  }
  return <Circle className="h-2.5 w-2.5 fill-gray-400 text-gray-400 shrink-0" />;
}

/** Compute opacity for a disconnected participant (fade from 1→0 between 25s–30s). */
function disconnectOpacity(disconnectedAt: number | undefined, now: number): number {
  if (!disconnectedAt) return 1;
  const elapsed = now - disconnectedAt;
  if (elapsed < 25_000) return 1;
  if (elapsed >= 30_000) return 0;
  return 1 - (elapsed - 25_000) / 5_000;
}

function EditableName({ name, onSave }: { name: string; onSave: (newName: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onSave(trimmed);
    } else {
      setDraft(name);
    }
    setEditing(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    commit();
  };

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-1 min-w-0">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className="h-6 text-sm px-1 py-0 w-24"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(name); setEditing(true); }}
      className="flex items-center gap-1 truncate group cursor-pointer"
    >
      <span className="truncate">{name}</span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

export function ParticipantsList() {
  const { doc, localPeerId, participantStatusMap, peerDisconnectedAtMap } = useStore();
  useYjsSnapshot();

  // Tick every second to drive fade-out animations for disconnected peers
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (peerDisconnectedAtMap.size === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [peerDisconnectedAtMap.size]);

  const participants = doc.getMap("participants");
  const votes = doc.getMap("votes");
  const meta = doc.getMap("meta");
  const revealed = meta.get("revealed") === true;

  const handleNameChange = (newName: string) => {
    if (!localPeerId) return;
    participants.set(localPeerId, newName);
    localStorage.setItem("displayName", newName);
  };

  const entries: { peerId: string; name: string; vote: string | undefined; status: PeerStatus; opacity: number }[] = [];
  participants.forEach((name, peerId) => {
    const isLocal = peerId === localPeerId;
    const status = isLocal ? "connected" : (participantStatusMap.get(peerId) ?? "connecting");
    entries.push({
      peerId,
      name: name as string,
      vote: votes.get(peerId) as string | undefined,
      status,
      opacity: status === "disconnected" ? disconnectOpacity(peerDisconnectedAtMap.get(peerId), now) : 1,
    });
  });

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Participants</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.map(({ peerId, name, vote, status, opacity }) => {
          const hasVoted = vote !== undefined;
          const isCurrentUser = peerId === localPeerId;

          return (
            <div
              key={peerId}
              className={`flex items-center justify-between py-1.5 px-2 rounded transition-opacity duration-[5000ms] ${isCurrentUser ? "bg-muted font-bold" : ""}`}
              style={opacity < 1 ? { opacity } : undefined}
            >
              <span className="flex items-center gap-2 truncate">
                <ConnectivityDot status={status} />
                {isCurrentUser ? (
                  <EditableName name={name} onSave={handleNameChange} />
                ) : (
                  <span className="truncate">{name}</span>
                )}
                {peerId === "host" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    Host
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-8 h-8"
                  style={{
                    perspective: "200px",
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-full h-full transition-transform duration-300"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
                    }}
                  >
                    {/* Front face (hidden status) */}
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      {hasVoted ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    {/* Back face (revealed value) */}
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      {hasVoted ? (
                        <span className="text-sm font-medium">{vote}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </span>
                  </span>
                </span>
              </span>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">No participants yet</p>
        )}
      </CardContent>
    </Card>
  );
}
