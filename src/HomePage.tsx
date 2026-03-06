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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">Simple Free Scrum Poker</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="room-name">Room Name</Label>
              <Input
                id="room-name"
                placeholder="Enter room name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!roomName.trim()}>
              Create Room
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
