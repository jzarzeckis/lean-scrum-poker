import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const SUIT_SYMBOLS = ["\u2660", "\u2665", "\u2666", "\u2663"];

function FloatingCard({ value, suit, style }: { value: string; suit: string; style: React.CSSProperties }) {
  return (
    <div
      className="absolute pointer-events-none select-none opacity-[0.07] text-foreground"
      style={style}
    >
      <div className="w-14 h-20 rounded-lg border-2 border-current flex flex-col items-center justify-between py-1.5 px-1 text-xs font-bold">
        <span>{value}</span>
        <span className="text-base">{suit}</span>
      </div>
    </div>
  );
}

function BackgroundCards() {
  const cards = [
    { value: "1", suit: SUIT_SYMBOLS[0], style: { top: "8%", left: "5%", transform: "rotate(-15deg)" } },
    { value: "3", suit: SUIT_SYMBOLS[1], style: { top: "15%", right: "8%", transform: "rotate(12deg)" } },
    { value: "5", suit: SUIT_SYMBOLS[2], style: { top: "45%", left: "3%", transform: "rotate(-8deg)" } },
    { value: "8", suit: SUIT_SYMBOLS[3], style: { bottom: "20%", right: "5%", transform: "rotate(18deg)" } },
    { value: "13", suit: SUIT_SYMBOLS[0], style: { bottom: "10%", left: "10%", transform: "rotate(6deg)" } },
    { value: "21", suit: SUIT_SYMBOLS[1], style: { top: "5%", left: "45%", transform: "rotate(-4deg)" } },
    { value: "?", suit: SUIT_SYMBOLS[2], style: { bottom: "35%", right: "12%", transform: "rotate(-12deg)" } },
    { value: "2", suit: SUIT_SYMBOLS[3], style: { top: "60%", right: "25%", transform: "rotate(9deg)" } },
  ] as const;

  return (
    <>
      {cards.map((card, i) => (
        <FloatingCard key={i} {...card} />
      ))}
    </>
  );
}

export function HomePage({ onCreateRoom }: { onCreateRoom: (slug: string, displayName: string) => void }) {
  const [roomName, setRoomName] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const slug = slugify(roomName);
    if (!slug) return;

    const stored = localStorage.getItem("displayName");
    if (stored) {
      onCreateRoom(slug, stored);
      return;
    }

    const name = prompt("Enter your display name:");
    if (!name?.trim()) return;
    localStorage.setItem("displayName", name.trim());
    onCreateRoom(slug, name.trim());
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <BackgroundCards />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 text-5xl font-bold tracking-tight">
            <span>{SUIT_SYMBOLS[0]}</span>
            <span>{SUIT_SYMBOLS[1]}</span>
            <span>{SUIT_SYMBOLS[2]}</span>
            <span>{SUIT_SYMBOLS[3]}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Scrum Poker
          </h1>
          <p className="text-muted-foreground text-sm max-w-xs">
            Free, real-time planning poker for agile teams. Create a room and start estimating.
          </p>
        </div>

        {/* Form Card */}
        <Card className="w-full shadow-lg">
          <CardHeader>
            <h2 className="text-lg font-semibold text-center">Create or Join a Room</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="e.g. sprint-42"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" disabled={!roomName.trim()}>
                Deal Me In
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          Simple. Free. No sign-up required.
        </p>
      </div>
    </div>
  );
}
