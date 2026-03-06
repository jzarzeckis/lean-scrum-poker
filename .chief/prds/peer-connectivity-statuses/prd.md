# PRD: Peer Connectivity Statuses & WebRTC Robustness

## Introduction

The scrum poker app uses WebRTC with a star topology (host relays Yjs updates to joiners). While the basic connectivity works, there are critical bugs and missing UI feedback around peer connection status. The most severe issue: when the host refreshes their browser, joiners are stranded in a permanent "Connecting..." state with no recovery. This PRD addresses all connectivity edge cases, adds visual status indicators, and brings the implementation up to the quality level of the reference app.

## Goals

- Show real-time connectivity status for each participant (connecting/connected/disconnected) with colored dot indicators
- Fix host-refresh bug where joiners get permanently stuck in "Connecting..."
- Fix joiner-refresh so they cleanly reconnect without leaving ghost participants
- Handle network loss gracefully for both host and joiners with automatic reconnection
- Ensure the host knows they are the host via clear UI labeling
- Clean up disconnected participants after 30 seconds with a fade-out animation
- Cap rooms at 12 participants maximum
- Adopt pre-created offer pattern from reference app (host always has an offer ready before any joiner connects)

## User Stories

### US-001: Show colored connectivity dot next to each participant
**Priority:** 1
**Description:** As a participant, I want to see a colored dot next to each person's name so I know who is actively connected.

**Acceptance Criteria:**
- [ ] Each participant row in the ParticipantsList shows a small colored dot to the left of their name
- [ ] Green dot (emerald-500) = connected
- [ ] Amber dot with pulse animation = connecting
- [ ] Gray dot = disconnected
- [ ] Icons use lucide-react icons available in the project (Circle or similar)
- [ ] The dot updates in real-time as peer status changes
- [ ] Typecheck passes (`bunx tsc --noEmit`)

### US-002: Show host badge and role indicator
**Priority:** 1
**Description:** As a host, I want to see that I am the host so I understand my special role in the session.

**Acceptance Criteria:**
- [ ] The host's own row in the participants list shows a "Host" badge (small chip/tag)
- [ ] The room header text shows "Hosting" when the user is the host, "Connected" when a joiner
- [ ] The host badge uses a distinct but subtle style (e.g., muted background chip)
- [ ] Joiners see the host labeled as "Host" in the participants list too
- [ ] Typecheck passes

### US-003: Show peer connection summary in room header
**Priority:** 2
**Description:** As a participant, I want to see a summary of connection status in the room header so I have a quick overview.

**Acceptance Criteria:**
- [ ] Room header shows connected peer count (e.g., "3 connected" or "3/4 participants")
- [ ] The count updates in real-time as peers connect/disconnect
- [ ] When in "connecting" state, show "Connecting..." with a pulsing animation
- [ ] When connection errors occur, show the error message
- [ ] Typecheck passes

### US-004: Fade out and remove disconnected participants after 30s
**Priority:** 2
**Description:** As a participant, I want disconnected users to fade out and disappear after 30 seconds so the list stays clean.

**Acceptance Criteria:**
- [ ] When a participant disconnects, their row shows the gray dot immediately
- [ ] After ~25 seconds, the row begins a fade-out animation (opacity transition over ~5 seconds)
- [ ] After 30 seconds total, the participant is removed from the Yjs participants map (host only) and their vote is cleared
- [ ] The existing 10-second cleanup interval properly removes stale peer entries
- [ ] Typecheck passes

### US-005: Fix host refresh stranding joiners
**Priority:** 1
**Description:** As a joiner, when the host refreshes their browser I want to automatically detect the disconnection and reconnect, rather than being stuck forever.

**Acceptance Criteria:**
- [ ] When host refreshes, joiner detects disconnect within 5 seconds (via RTCPeerConnection state change or data channel close)
- [ ] Joiner transitions to "Connecting..." state and begins retry loop (3-second intervals)
- [ ] The refreshed host re-creates the session and becomes host again
- [ ] Joiner successfully reconnects to the new host session
- [ ] Joiner's display name is preserved across reconnection (from localStorage)
- [ ] Yjs state is synced from the new host on reconnection
- [ ] Verified via Playwright: open two browser tabs, host refreshes, joiner reconnects within 15 seconds
- [ ] Typecheck passes

### US-006: Fix joiner refresh leaving ghost participants
**Priority:** 1
**Description:** As a host, when a joiner refreshes their browser I want their old entry to be cleaned up and the joiner to rejoin cleanly.

**Acceptance Criteria:**
- [ ] When a joiner refreshes, the host detects the peer disconnect (RTCPeerConnection state change)
- [ ] Host marks the disconnected peer entry and begins the 30-second cleanup timer
- [ ] The refreshed joiner connects as a new participant (new peer ID, same display name from localStorage)
- [ ] After 30 seconds, the old ghost participant entry is removed from Yjs
- [ ] No duplicate participant names appear (old entry shows disconnected dot, new entry shows connected dot)
- [ ] Verified via Playwright: host + joiner tabs, joiner refreshes, ghost cleans up within 35 seconds
- [ ] Typecheck passes

### US-007: Handle intentional disconnect (leave button / tab close)
**Priority:** 1
**Description:** As a participant, when I click "Leave" or close the tab, my peers should be notified promptly.

**Acceptance Criteria:**
- [ ] Clicking the Leave button: closes all RTCPeerConnections, host deletes session from signaling server
- [ ] Closing the tab: peers detect disconnect via RTCPeerConnection state change within 5 seconds
- [ ] Host closing tab: joiners detect disconnect and enter reconnection loop (will become new host if session is stale)
- [ ] Joiner closing tab: host marks peer as disconnected, cleanup timer starts
- [ ] Use `beforeunload` event to attempt graceful cleanup (close PCs) on tab close
- [ ] Typecheck passes

### US-008: Handle network loss and recovery
**Priority:** 2
**Description:** As a participant, if my network drops temporarily I want the app to detect it and try to reconnect automatically.

**Acceptance Criteria:**
- [ ] Network loss detected via RTCPeerConnection entering "disconnected" or "failed" state
- [ ] UI shows "Connecting..." status during reconnection attempts
- [ ] Retry loop attempts reconnection every 3 seconds
- [ ] When network recovers, participant reconnects automatically
- [ ] If reconnection succeeds, full Yjs state is re-synced
- [ ] If host's network drops: joiners detect within 10 seconds and start retry loop
- [ ] Typecheck passes

### US-009: Pre-create offers for instant joiner connection
**Priority:** 2
**Description:** As a developer, I want the host to always have a pre-created WebRTC offer ready on the server so joiners can connect instantly without waiting.

**Acceptance Criteria:**
- [ ] When host creates a session, the first offer is created and posted before any joiner arrives
- [ ] After each successful joiner handshake, host immediately creates and posts the next offer
- [ ] Joiners calling `join-session` receive the pre-created offer instantly (no polling needed on joiner side)
- [ ] Only the host polls (for answers), joiners never poll
- [ ] This is already the current architecture - verify it works correctly and fix any race conditions
- [ ] Typecheck passes

### US-010: Cap room at 12 participants
**Priority:** 3
**Description:** As a host, I want the room capped at 12 participants to keep the session manageable.

**Acceptance Criteria:**
- [ ] Host stops creating new offers once 12 participants are in the Yjs participants map
- [ ] New joiners attempting to join a full room receive a clear error message ("Room is full")
- [ ] When a participant disconnects and is cleaned up, the slot opens for a new joiner
- [ ] The signaling server returns an appropriate error for full rooms
- [ ] Typecheck passes

### US-011: Add data channel open timeout
**Priority:** 2
**Description:** As a developer, I want a timeout on data channel establishment so connections don't hang forever if the handshake partially fails.

**Acceptance Criteria:**
- [ ] After WebRTC handshake completes, if the data channel doesn't open within 10 seconds, the connection is considered failed
- [ ] Failed connections trigger the standard disconnect/retry flow
- [ ] The timeout is applied for both host-side (incoming data channel) and joiner-side (outgoing data channel)
- [ ] Typecheck passes

### US-012: Add error handling around SDP operations
**Priority:** 2
**Description:** As a developer, I want try/catch around all SDP operations so malformed signaling data doesn't crash the app.

**Acceptance Criteria:**
- [ ] `acceptOffer()` wraps `setRemoteDescription()` and `addIceCandidate()` in try/catch
- [ ] `acceptAnswer()` wraps `setRemoteDescription()` and `addIceCandidate()` in try/catch
- [ ] Errors are caught and surfaced as connection failures (triggering retry), not uncaught exceptions
- [ ] Console warning is logged with the error details
- [ ] Typecheck passes

### US-013: Playwright E2E test for basic connectivity flow
**Priority:** 3
**Description:** As a developer, I want an E2E test that verifies the basic host-joiner connectivity flow works end-to-end.

**Acceptance Criteria:**
- [ ] Test opens two browser contexts (host and joiner) against the running dev server at localhost:3000
- [ ] Host navigates to a room URL and enters display name
- [ ] Host sees "Hosting" status
- [ ] Joiner navigates to the same room URL and enters display name
- [ ] Joiner sees "Connected" status within 15 seconds
- [ ] Both participants appear in the participants list for both users
- [ ] Test uses real Vercel signaling functions as backend
- [ ] Test passes reliably

### US-014: Playwright E2E test for host refresh recovery
**Priority:** 3
**Description:** As a developer, I want an E2E test that verifies joiners recover when the host refreshes.

**Acceptance Criteria:**
- [ ] Test establishes a connected session between host and joiner
- [ ] Host page is refreshed (page.reload())
- [ ] Joiner detects disconnect and shows "Connecting..." state
- [ ] Host re-enters room and becomes host again
- [ ] Joiner reconnects to the new host within 20 seconds
- [ ] Both participants see each other in the participants list again
- [ ] Test passes reliably

### US-015: Playwright E2E test for joiner refresh recovery
**Priority:** 3
**Description:** As a developer, I want an E2E test that verifies joiner refresh works cleanly without leaving ghost participants.

**Acceptance Criteria:**
- [ ] Test establishes a connected session between host and joiner
- [ ] Joiner page is refreshed
- [ ] Joiner reconnects within 15 seconds
- [ ] Old ghost participant entry eventually disappears (within 35 seconds)
- [ ] No permanent duplicate names in the participants list
- [ ] Test passes reliably

## Functional Requirements

- FR-1: Add a colored status dot (green/amber-pulse/gray) to the left of each participant name in ParticipantsList
- FR-2: Add a "Host" badge chip next to the host's name in the participants list, visible to all participants
- FR-3: Display connected participant count in the room header area
- FR-4: Apply CSS opacity fade-out transition to participant rows during the last 5 seconds before cleanup
- FR-5: Detect host disconnect on joiner side via RTCPeerConnection `connectionstatechange` and data channel `close` events
- FR-6: Implement joiner retry loop: on disconnect, wait 3 seconds, call `join-session` again, reconnect
- FR-7: Detect joiner disconnect on host side via RTCPeerConnection `connectionstatechange` event
- FR-8: Clean up disconnected peer's Yjs participant and vote entries after 30 seconds (host only)
- FR-9: Use `beforeunload` event to close RTCPeerConnections on tab close for faster peer notification
- FR-10: Add 10-second timeout on data channel open; treat timeout as connection failure
- FR-11: Wrap all `setRemoteDescription()` and `addIceCandidate()` calls in try/catch blocks
- FR-12: Enforce 12-participant maximum: host stops creating offers when at capacity, signaling returns error to new joiners
- FR-13: Maintain the pre-created offer pattern: host always has one offer posted to the server for instant joiner pickup
- FR-14: Store `isHost` flag in Yjs meta map so all participants know who the host is

## Non-Goals

- No TURN server support (STUN only, same as current implementation)
- No graceful host migration (if host leaves permanently, session ends; joiners must create a new room)
- No audio/video channels (data channel only for Yjs updates)
- No persistence of connection history or analytics
- No custom reconnection strategy beyond the 3-second retry loop
- No WebSocket fallback if WebRTC fails entirely
- No end-to-end encryption beyond what WebRTC DTLS provides

## Design Considerations

- Reuse existing shadcn components: Badge for "Host" chip, existing Card/CardContent for participants list
- Use lucide-react icons (already in the project) for status dots: use simple colored `<span>` circles with Tailwind classes
- Status dot colors: `bg-emerald-500` (connected), `bg-amber-400 animate-pulse` (connecting), `bg-gray-400` (disconnected)
- Fade-out animation: CSS `transition-opacity duration-[5000ms]` with conditional `opacity-0` class
- Keep the participants list layout simple - dot on left, name in middle, vote indicator on right

## Technical Considerations

- The app uses a star topology: host is the central relay node. All Yjs updates flow through the host.
- Signaling is server-assisted via Vercel serverless functions (in-memory store with 30-minute TTL)
- The signaling server has a 10-second stale host threshold - if a new joiner arrives and the host hasn't polled in 10s, the joiner becomes the new host. This enables recovery after host disappears.
- RTCPeerConnection `connectionstatechange` is the primary disconnect detection mechanism. The `disconnected` state may be transient (brief network blip), while `failed` is terminal.
- The data channel `close` event is a secondary disconnect signal and should also trigger reconnection.
- ICE gathering uses a 3-second timeout fallback if gathering doesn't complete naturally.
- Current webrtc.ts uses a note about the star topology having the "Joiner" create offers and the "Host" accept them - but in the store.tsx the roles are actually reversed (host creates offers). The webrtc.ts comments are misleading but the actual flow matches the reference app: host creates offers, joiner accepts and produces answer.
- The `beforeunload` event is best-effort - browsers may not execute async work during unload. Closing RTCPeerConnections synchronously is the best we can do.
- Yjs participant/vote cleanup must only happen on the host side to avoid split-brain conflicts.

## Success Metrics

- Host refresh recovery: joiner reconnects within 15 seconds (verified by Playwright test)
- Joiner refresh recovery: joiner reconnects within 15 seconds, ghost cleaned up within 35 seconds
- Tab close detection: remaining peers detect disconnect within 10 seconds
- No permanently stuck "Connecting..." states for any participant under any scenario
- All 3 Playwright E2E tests pass reliably (basic flow, host refresh, joiner refresh)
- Zero TypeScript errors (`bunx tsc --noEmit` passes)

## Open Questions

- Should we attempt host migration (a joiner takes over as host) when the host disappears, rather than requiring all joiners to reconnect? (Currently: no, out of scope)
- Should the signaling server persist sessions to a database/KV store instead of in-memory? (Currently: no, in-memory is fine for the scale)
- Should we add a heartbeat message on the data channel to detect silent connection death faster than RTCPeerConnection state changes? (Recommendation: defer unless testing shows state changes are too slow)
