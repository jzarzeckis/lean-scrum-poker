## Codebase Patterns
- MUST clear Yjs maps (participants, votes, meta) before reconnecting — CRDT merge won't replace old data
- `beforeunload` + `sendBeacon` for best-effort session cleanup on tab close/refresh
- Yjs participants map keys: "host" for the host, "joiner-xxxx" for joiners
- PeerEntry.participantKey maps internal peer IDs to Yjs participant keys (host only tracks this)
- Joiner MUST send `Y.encodeStateAsUpdate(doc)` to host on DC open — Yjs updates set before the DC opens are silently dropped (peersRef is empty)
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

## 2026-03-06 - US-005
- What was implemented: Fix host refresh stranding joiners by adding beforeunload cleanup and Yjs doc reset on retry
- Files changed:
  - `src/store.tsx` — Added `beforeunload` event listener using `navigator.sendBeacon` to delete the signaling session when host closes/refreshes. Added Yjs doc reset (clear participants, votes, meta maps) at the start of each retry loop iteration to prevent stale CRDT data from merging with the new host's state.
- **Learnings for future iterations:**
  - The joiner retry loop (while loop in `connectToSession`) already handles reconnection — it detects disconnect via `connectionstatechange` and data channel close, then retries after 3s
  - `navigator.sendBeacon` is more reliable than `fetch` during `beforeunload` for best-effort cleanup
  - Yjs CRDT merge semantics mean you MUST clear maps before reconnecting, otherwise old entries persist even when the new host sends fresh state
  - The signaling server's `STALE_HOST_THRESHOLD_MS` (10s) acts as a fallback when `beforeunload` beacon fails — session auto-expires and can be taken over
  - `localPeerId` gets a new key on each retry (new `joiner-xxxx` or `"host"`), which is correct for fresh reconnection
---

## 2026-03-06 - US-006
- What was implemented: Fixed joiner refresh leaving ghost participants by ensuring the host knows about joiner's participant key
- Files changed:
  - `src/store.tsx` — Added `Y.encodeStateAsUpdate(doc)` send from joiner to host in the `onOpen` callback, so the host receives the joiner's participant key that was set before the data channel was open
- **Learnings for future iterations:**
  - Root cause: joiner sets `participants.set(localKey, displayName)` BEFORE any peer entry exists in `peersRef`, so the Yjs `doc.on("update")` handler broadcasts to zero peers — the update is silently lost
  - The host's Yjs observer assigns `participantKey` to peer entries when new keys appear in the participants map. Without the joiner's state sync, `participantKey` was never set, and the 30s cleanup couldn't delete the ghost from Yjs
  - Promise `.then` microtasks (DC assignment) run before `onopen` macrotasks, so `hostEntry.dc` is guaranteed to be set when `onOpen` fires
  - The existing 10s cleanup interval + 30s threshold in store.tsx already handles ghost removal — it just needed `participantKey` to be set correctly
---

## 2026-03-06 - US-007
- What was implemented: Leave button in room UI + Yjs doc cleanup on leave
- Files changed:
  - `src/RoomPage.tsx` — Added Leave button (LogOut icon + "Leave" text) visible when hosting or connected. Button calls `leaveSession()` and navigates back to home page via `pushState` + `popstate` event.
  - `src/store.tsx` — Enhanced `leaveSession()` to clear Yjs doc state (participants, votes, meta maps) and reset `participantStatusMap`.
- **Learnings for future iterations:**
  - Most of US-007's infrastructure was already in place from US-005/US-006: `beforeunload` handler, `monitorPcDisconnect`, joiner retry loop, host cleanup timer
  - Navigation uses `window.history.pushState` + dispatching `PopStateEvent` since App.tsx Router listens for `popstate` events
  - `leaveSession` must clear Yjs maps in addition to closing PCs — otherwise stale CRDT state persists in the doc
  - `joinedRef.current` must be reset to `false` on leave so the name dialog shows again on rejoin
---

## 2026-03-06 - US-003
- What was implemented: Peer connection summary in room header showing connected/total count
- Files changed:
  - `src/RoomPage.tsx` — Updated header to show "Hosting — X/Y connected" or "Connected — X/Y connected" with counts from store's `peerCount` and Yjs participants map size. Added pulsing amber dot during "Connecting..." state. Error state now shows `errorMessage` from store.
- **Learnings for future iterations:**
  - Host's connected count = `peerCount + 1` (peerCount only counts remote peers, +1 for self)
  - Joiner sees all participants through the host connection, so total == connected when host link is up
  - `doc.getMap("participants").size` gives total participant count (reactive via `useYjsSnapshot`)
  - Pre-existing TS error in HomePage.tsx (suit type) is unrelated — only that one error in typecheck output
---

## 2026-03-06 - US-004
- What was implemented: Fade-out animation for disconnected participants, removing them after 30s
- Files changed:
  - `src/store.tsx` — Added `peerDisconnectedAtMap` state (Map<string, number>) that maps participant keys to their disconnect timestamps. Computed in `updatePeersState()`, exposed via context, reset in `leaveSession()`.
  - `src/ParticipantsList.tsx` — Added `disconnectOpacity()` helper that computes opacity (1→0 between 25s–30s after disconnect). Added 1s interval timer when disconnected peers exist to drive the fade animation. Applied opacity via inline style + CSS transition on each participant row.
- **Learnings for future iterations:**
  - The existing 10s cleanup interval in store.tsx (lines 616-638) already handles Yjs removal at 30s — no changes needed there
  - For time-based UI animations, a 1s `setInterval` + computed opacity is simpler than CSS-only approaches since React needs to re-render to update the value
  - The `transition-opacity duration-[5000ms]` Tailwind class provides smooth CSS transition between the discrete opacity steps from the 1s timer
---
