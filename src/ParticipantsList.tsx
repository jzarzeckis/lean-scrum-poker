import { useStore, useYjsSnapshot } from "./store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";

export function ParticipantsList() {
  const { doc, localPeerId } = useStore();
  useYjsSnapshot();

  const participants = doc.getMap("participants");
  const votes = doc.getMap("votes");
  const meta = doc.getMap("meta");
  const revealed = meta.get("revealed") === true;

  const entries: { peerId: string; name: string; vote: string | undefined }[] = [];
  participants.forEach((name, peerId) => {
    entries.push({
      peerId,
      name: name as string,
      vote: votes.get(peerId) as string | undefined,
    });
  });

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Participants</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.map(({ peerId, name, vote }) => {
          const hasVoted = vote !== undefined;
          const isCurrentUser = peerId === localPeerId;

          return (
            <div
              key={peerId}
              className={`flex items-center justify-between py-1.5 px-2 rounded ${isCurrentUser ? "bg-muted font-bold" : ""}`}
            >
              <span className="truncate">{name}</span>
              <span className="flex items-center gap-2">
                {revealed && hasVoted ? (
                  <span className="text-sm font-medium">{vote}</span>
                ) : revealed && !hasVoted ? (
                  <span className="text-sm text-muted-foreground">-</span>
                ) : hasVoted ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                )}
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
