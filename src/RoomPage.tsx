import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
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
import { Copy, Check, Link, LogOut } from "lucide-react";

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${slug}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <div className="mb-6 mx-auto max-w-md">
      <div className="flex items-center gap-2 mb-2 justify-center text-sm text-muted-foreground">
        <Link className="h-4 w-4" />
        <span>Share this link with your team to join</span>
      </div>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly className="font-mono text-sm" />
        <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy link">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

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
  const { connectToSession, leaveSession, sessionState, doc, peerCount, errorMessage } = useStore();
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

  const handleLeave = useCallback(() => {
    leaveSession();
    joinedRef.current = false;
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [leaveSession]);

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
      <div className="flex items-center justify-center gap-3 mb-6">
        <p className="text-muted-foreground">
          {sessionState === "hosting" || sessionState === "connected"
            ? (() => {
                const totalParticipants = doc.getMap("participants").size;
                const connectedCount = sessionState === "hosting"
                  ? peerCount + 1 // +1 for host (self)
                  : totalParticipants; // joiner sees all via host
                return `${sessionState === "hosting" ? "Hosting" : "Connected"} — ${connectedCount}/${totalParticipants} connected`;
              })()
            : sessionState === "connecting"
              ? "Connecting..."
              : sessionState === "error"
                ? errorMessage || "Connection error"
                : ""}
        </p>
        {sessionState === "connecting" && (
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
        {(sessionState === "hosting" || sessionState === "connected") && (
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-1" />
            Leave
          </Button>
        )}
      </div>

      {(sessionState === "hosting" || sessionState === "connected") && (
        <>
          <ShareLink slug={slug} />
          <RoomContent />
        </>
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
