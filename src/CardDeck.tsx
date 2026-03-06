import { useStore, useYjsSnapshot } from "./store";
import { Button } from "@/components/ui/button";
import { Coffee } from "lucide-react";

const CARDS: { value: string; label: React.ReactNode }[] = [
  { value: "?", label: "?" },
  { value: "coffee", label: <Coffee className="h-5 w-5" /> },
  { value: "0", label: "0" },
  { value: "0.5", label: "0.5" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "5", label: "5" },
  { value: "8", label: "8" },
  { value: "13", label: "13" },
  { value: "20", label: "20" },
  { value: "40", label: "40" },
  { value: "100", label: "100" },
];

export function CardDeck() {
  const { doc, localPeerId } = useStore();
  useYjsSnapshot();

  const votes = doc.getMap("votes");
  const currentVote = localPeerId ? (votes.get(localPeerId) as string | undefined) : undefined;

  const handleSelect = (value: string) => {
    if (!localPeerId) return;
    if (currentVote === value) {
      votes.delete(localPeerId);
    } else {
      votes.set(localPeerId, value);
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {CARDS.map((card) => {
        const isSelected = currentVote === card.value;
        return (
          <Button
            key={card.value}
            variant={isSelected ? "default" : "outline"}
            className={`h-16 w-14 text-lg ${isSelected ? "ring-2 ring-primary shadow-lg" : ""}`}
            onClick={() => handleSelect(card.value)}
          >
            {card.label}
          </Button>
        );
      })}
    </div>
  );
}
