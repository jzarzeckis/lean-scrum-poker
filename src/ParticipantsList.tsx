import { useStore, useYjsSnapshot, type PeerStatus } from "./store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Minus, Circle } from "lucide-react";

function ConnectivityDot({ status }: { status: PeerStatus }) {
  if (status === "connected") {
    return <Circle className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500 shrink-0" />;
  }
  if (status === "connecting") {
    return <Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500 animate-pulse shrink-0" />;
  }
  return <Circle className="h-2.5 w-2.5 fill-gray-400 text-gray-400 shrink-0" />;
}

export function ParticipantsList() {
  const { doc, localPeerId, participantStatusMap } = useStore();
  useYjsSnapshot();

  const participants = doc.getMap("participants");
  const votes = doc.getMap("votes");
  const meta = doc.getMap("meta");
  const revealed = meta.get("revealed") === true;

  const entries: { peerId: string; name: string; vote: string | undefined; status: PeerStatus }[] = [];
  participants.forEach((name, peerId) => {
    const isLocal = peerId === localPeerId;
    entries.push({
      peerId,
      name: name as string,
      vote: votes.get(peerId) as string | undefined,
      status: isLocal ? "connected" : (participantStatusMap.get(peerId) ?? "connecting"),
    });
  });

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Participants</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.map(({ peerId, name, vote, status }) => {
          const hasVoted = vote !== undefined;
          const isCurrentUser = peerId === localPeerId;

          return (
            <div
              key={peerId}
              className={`flex items-center justify-between py-1.5 px-2 rounded ${isCurrentUser ? "bg-muted font-bold" : ""}`}
            >
              <span className="flex items-center gap-2 truncate">
                <ConnectivityDot status={status} />
                <span className="truncate">{name}</span>
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
