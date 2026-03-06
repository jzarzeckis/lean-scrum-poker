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
