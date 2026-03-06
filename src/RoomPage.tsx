import { useState, useEffect, useRef, type FormEvent } from "react";
import { useStore, useYjsSnapshot } from "./store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CardDeck } from "./CardDeck";
import { ParticipantsList } from "./ParticipantsList";

function RoomContent() {
  const { doc } = useStore();
  useYjsSnapshot();

  const meta = doc.getMap("meta");
  const revealed = meta.get("revealed") === true;

  const handleReveal = () => {
    meta.set("revealed", true);
  };

  const handleNewRound = () => {
    const votes = doc.getMap("votes");
    doc.transact(() => {
      votes.forEach((_value, key) => {
        votes.delete(key);
      });
      meta.set("revealed", false);
    });
  };

  return (
    <>
      <CardDeck />
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={handleReveal} disabled={revealed}>
          Reveal
        </Button>
        {revealed && (
          <Button variant="outline" onClick={handleNewRound}>
            New Round
          </Button>
        )}
      </div>
      <div className="mt-6">
        <ParticipantsList />
      </div>
    </>
  );
}

export function RoomPage({ slug }: { slug: string }) {
  const { connectToSession, sessionState } = useStore();
  useYjsSnapshot();

  const [needsName, setNeedsName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const joinedRef = useRef(false);

  useEffect(() => {
    if (joinedRef.current) return;

    const stored = localStorage.getItem("displayName");
    if (stored) {
      joinedRef.current = true;
      connectToSession(slug, stored);
    } else {
      setNeedsName(true);
    }
  }, [slug, connectToSession]);

  const handleNameSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    localStorage.setItem("displayName", trimmed);
    setNeedsName(false);
    joinedRef.current = true;
    connectToSession(slug, trimmed);
  };

  return (
    <div className="container mx-auto p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Room: {slug}</h1>
      <p className="text-muted-foreground mb-6">
        {sessionState === "hosting"
          ? "Hosting — waiting for participants..."
          : sessionState === "connected"
            ? "Connected"
            : sessionState === "connecting"
              ? "Connecting..."
              : sessionState === "error"
                ? "Connection error"
                : ""}
      </p>

      {(sessionState === "hosting" || sessionState === "connected") && (
        <RoomContent />
      )}

      <Dialog open={needsName} onOpenChange={(open) => { if (!open && !joinedRef.current) return; setNeedsName(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your display name</DialogTitle>
            <DialogDescription>
              Choose a name that your teammates will see during the poker session.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNameSubmit}>
            <div className="flex flex-col gap-2 py-4">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!displayName.trim()}>
                Join Room
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
