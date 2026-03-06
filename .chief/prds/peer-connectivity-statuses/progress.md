## Codebase Patterns
- Yjs participants map keys: "host" for the host, "joiner-xxxx" for joiners
- PeerEntry.participantKey maps internal peer IDs to Yjs participant keys (host only tracks this)
- For joiners, the only peer connection is to "host" — other participants' status mirrors host connection
- Store exposes `participantStatusMap: Map<string, PeerStatus>` for UI to look up status per participant key
- The local user (localPeerId) is always "connected" — no need to look up in the map
- lucide-react Circle icon with `fill-*` and `text-*` classes for colored dots
- Pre-existing TS error in HomePage.tsx (suit type) — not related to connectivity work

## 2026-03-06 - US-001
- What was implemented: Colored connectivity dots next to each participant name in ParticipantsList
- Files changed:
  - `src/store.tsx` — Added `participantStatusMap` state, computed in `updatePeersState`, exposed via context
  - `src/ParticipantsList.tsx` — Added `ConnectivityDot` component using lucide Circle icon (green=connected, amber+pulse=connecting, gray=disconnected), integrated into participant rows
- **Learnings for future iterations:**
  - The store's `peersRef` has internal PeerEntry objects with `participantKey` that map to Yjs participant map keys
  - Host tracks participantKey per peer; joiners see all remote participants via host connection
  - `updatePeersState()` is called whenever peer status changes — good place to compute derived maps
---

## 2026-03-06 - US-002
- What was implemented: Host badge next to host's name in ParticipantsList, using a subtle muted chip style
- Files changed:
  - `src/ParticipantsList.tsx` — Added "Host" badge chip next to participant name when `peerId === "host"`
- **Learnings for future iterations:**
  - The host participant key is always `"host"` — this is set in store.tsx line 424, so checking `peerId === "host"` reliably identifies the host in both host and joiner views
  - Room header already showed "Hosting" vs "Connected" text in RoomPage.tsx (lines 121-129), so no changes needed there
  - No shadcn Badge component installed — used inline Tailwind classes for the chip instead
---
