# PRD: Simple Free Scrum Poker

## Introduction

A free, real-time scrum poker (planning poker) web app for agile teams to estimate story points collaboratively. The host creates a named room, shares the URL with teammates, and everyone votes simultaneously using card selections. Votes are hidden until any participant reveals them, then cleared for the next round.

The app uses peer-to-peer WebRTC connections (star topology, host relays) for real-time communication, with Vercel serverless functions handling only the initial signaling handshake. No persistent backend or database is needed — all state lives in-memory across connected peers via Yjs CRDTs.

The architecture, signaling protocol, build system, and deployment config are directly adapted from the reference app at `reference-similar-sample-app/`.

## Goals

- Allow a host to create a named poker room in under 5 seconds
- Generate a shareable URL from the slugified room name (e.g. `/sprint-42-planning`)
- Allow teammates to join via the shared link and only enter their display name once (persisted in localStorage)
- Provide the standard Fibonacci-like card deck: ?, coffee, 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100
- Show real-time participant list with vote status (voted / not yet voted)
- Allow any participant to reveal all votes or clear for the next round
- Include minimal card flip animation on reveal
- Deploy to Vercel as a static SPA + serverless signaling function

## User Stories

### US-001: Project scaffolding and build system
**Priority:** 1
**Description:** As a developer, I need the project scaffolded with Bun, React, Tailwind, shadcn/ui components, and the Vercel deployment config so that all subsequent stories have a working foundation.

**Acceptance Criteria:**
- [ ] `src/index.ts` serves `src/index.html` via `Bun.serve()` with HMR
- [ ] `src/frontend.tsx` renders a React 19 root
- [ ] Tailwind CSS works via `bun-plugin-tailwind`
- [ ] shadcn/ui Button and Input components are available
- [ ] `build.ts` produces a `dist/` output compatible with Vercel
- [ ] `vercel.json` configures Bun runtime, build command, output directory, and SPA rewrite
- [ ] `bunfig.toml` configures Tailwind plugin
- [ ] `bun dev` starts the dev server on port 3000
- [ ] TypeScript compiles without errors

### US-002: WebRTC signaling serverless function
**Priority:** 2
**Description:** As a developer, I need the signaling API ported from the reference app so that peers can exchange WebRTC offers and answers to establish direct connections.

**Acceptance Criteria:**
- [ ] `api/signaling.ts` Vercel function handles POST and GET requests
- [ ] `src/signaling.ts` implements in-memory session store with create, join, poll-answer, submit-answer, replace-offer, delete-session actions
- [ ] `src/handleSignaling.ts` dispatches requests to the correct action
- [ ] Sessions auto-expire after 30 minutes of inactivity
- [ ] Stale host detection (>10s without polling) allows next joiner to become host
- [ ] Works identically to reference app's signaling protocol

### US-003: WebRTC connection layer
**Priority:** 3
**Description:** As a developer, I need the WebRTC primitives (createOffer, acceptOffer, acceptAnswer) ported from the reference app so that peers can establish data channels for real-time communication.

**Acceptance Criteria:**
- [ ] `src/webrtc.ts` provides `createOffer()`, `acceptOffer()`, `acceptAnswer()` functions
- [ ] Data channels use `binaryType = "arraybuffer"` for Yjs binary updates
- [ ] ICE candidates are bundled into the SDP offer/answer strings (base64-encoded)
- [ ] Connection state changes (open, close, error) are reported via callbacks

### US-004: Session store with Yjs CRDT sync
**Priority:** 4
**Description:** As a developer, I need a React context that manages the Yjs document, peer connections, and session lifecycle so that all participants share synchronized poker state.

**Acceptance Criteria:**
- [ ] `src/store.tsx` provides a React context with session state
- [ ] Yjs `Y.Doc` holds shared poker state: participants map, votes map, revealed boolean, room name
- [ ] Host connects to each joiner in star topology; host relays Yjs updates between peers
- [ ] Joiner connects to host and receives full document state on connect
- [ ] Connection/disconnection of peers updates the participants list in real-time
- [ ] `useSyncExternalStore` or equivalent hook triggers React re-renders on Yjs updates

### US-005: Home page — create a room
**Priority:** 5
**Description:** As a host, I want to enter a room name on the home page and create a poker room so that I can start a planning session.

**Acceptance Criteria:**
- [ ] Home page (`/`) shows an input field for room name and a "Create Room" button
- [ ] Room name is required; button is disabled when input is empty
- [ ] On submit, browser navigates to `/{slugified-room-name}` using `history.pushState`
- [ ] The slug is URL-safe: lowercase, spaces become hyphens, special characters removed
- [ ] The user is prompted for their display name if not already stored in localStorage
- [ ] Display name is saved to localStorage after first entry
- [ ] Host automatically joins the room as the first participant

### US-006: Join a room via shared link
**Priority:** 6
**Description:** As a teammate, I want to open a shared room URL and join the poker session so that I can participate in estimation.

**Acceptance Criteria:**
- [ ] Navigating to `/{room-slug}` opens the poker room
- [ ] If no display name is in localStorage, a modal/dialog prompts for it before joining
- [ ] Display name is saved to localStorage for future sessions
- [ ] If display name already exists in localStorage, user joins immediately without prompt
- [ ] The joiner appears in the participants list for all connected peers
- [ ] If the room doesn't exist yet (no host), the joiner becomes the host

### US-007: Card deck and voting
**Priority:** 7
**Description:** As a participant, I want to select a card from the Fibonacci-like deck to cast my vote so that my estimate is recorded.

**Acceptance Criteria:**
- [ ] Card deck displays: ?, coffee-icon, 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100
- [ ] Clicking a card selects it (visually highlighted, e.g. raised/bordered)
- [ ] Clicking the same card again deselects it
- [ ] Clicking a different card changes the selection
- [ ] The vote is synced to all peers via Yjs in real-time
- [ ] Other participants see that this user "has voted" but NOT the value (until reveal)

### US-008: Participants list with vote status
**Priority:** 8
**Description:** As a participant, I want to see who is in the room and whether they have voted so that I know when everyone is ready.

**Acceptance Criteria:**
- [ ] A table/list shows all connected participants by display name
- [ ] Each participant row shows a vote indicator: checkmark if voted, dash/empty if not
- [ ] The vote value is hidden (shown as a face-down card icon or "?") until revealed
- [ ] Participants who disconnect are removed from the list
- [ ] The current user's row is visually distinguished (e.g. bold or highlighted)

### US-009: Reveal votes
**Priority:** 9
**Description:** As any participant, I want to click "Reveal" to flip all cards and see everyone's estimates so that the team can discuss.

**Acceptance Criteria:**
- [ ] A "Reveal" button is visible to all participants
- [ ] Clicking "Reveal" sets the shared `revealed` flag to true via Yjs
- [ ] All participants see all vote values simultaneously
- [ ] Cards animate with a flip effect when revealed (CSS transform, ~300ms)
- [ ] The "Reveal" button is replaced by or disabled after reveal

### US-010: Clear votes for next round
**Priority:** 10
**Description:** As any participant, I want to click "Clear" after discussion to reset all votes so that the team can estimate the next story.

**Acceptance Criteria:**
- [ ] A "Clear" / "New Round" button appears after votes are revealed
- [ ] Clicking it clears all votes and sets `revealed` back to false via Yjs
- [ ] All participants' card selections are reset
- [ ] The card deck returns to unselected state for everyone
- [ ] The participants list shows all participants as "not yet voted"

### US-011: SPA routing
**Priority:** 11
**Description:** As a developer, I need client-side routing so that `/` shows the home page and `/{room-slug}` shows the poker room, with Vercel's SPA rewrite handling direct URL access.

**Acceptance Criteria:**
- [ ] `/` renders the home/create-room page
- [ ] `/{room-slug}` renders the poker room page
- [ ] `history.pushState` is used for navigation (no full page reloads)
- [ ] `popstate` event is handled for browser back/forward
- [ ] Vercel rewrite rule sends all non-API routes to `index.html`
- [ ] Direct URL access to `/{room-slug}` works (loads app, then joins room)

## Functional Requirements

- FR-1: The app is a single-page application with two views: home page and poker room
- FR-2: Home page has an input for room name and a "Create Room" button
- FR-3: Creating a room navigates to `/{slugified-room-name}` via `history.pushState`
- FR-4: Slugification: lowercase, replace spaces with hyphens, remove non-alphanumeric characters (except hyphens), collapse multiple hyphens
- FR-5: If no display name is in localStorage, prompt for it via a modal before joining any room
- FR-6: Display name is stored in localStorage under a known key and reused across sessions
- FR-7: The card deck contains these values in order: `?`, `coffee`, `0`, `0.5`, `1`, `2`, `3`, `5`, `8`, `13`, `20`, `40`, `100`
- FR-8: The `coffee` card displays a coffee cup icon instead of text
- FR-9: A participant's vote is stored in the Yjs shared map keyed by their peer ID
- FR-10: The `revealed` flag is a shared Yjs boolean — when false, other participants' votes are hidden; when true, all votes are shown
- FR-11: The "Reveal" button sets `revealed = true`; the "Clear" button resets all votes and sets `revealed = false`
- FR-12: Participant list shows: display name, vote status (voted/not voted), and vote value (only when revealed)
- FR-13: When votes are revealed, cards flip with a CSS 3D transform animation (~300ms)
- FR-14: Peer connections use WebRTC data channels in star topology (host relays updates)
- FR-15: Signaling uses Vercel serverless functions at `/api/signaling` with the same protocol as the reference app
- FR-16: Participants who disconnect are removed from the shared state after connection close

## Non-Goals (Out of Scope)

- No user accounts, authentication, or sign-up
- No persistent storage or database — all state is in-memory and ephemeral
- No timer or countdown feature
- No voting history or round tracking
- No average/consensus/statistics display after reveal
- No spectator/observer mode
- No configurable card decks (only the default Fibonacci-like deck)
- No QR code generation for sharing
- No email sharing functionality
- No mobile-specific responsive layout (basic responsiveness via Tailwind is fine, but no dedicated mobile UI)
- No host-only privileges — all participants are equal

## Design Considerations

- Use shadcn/ui components (Button, Input, Dialog, Table) for consistent styling
- Tailwind CSS for layout and custom styling
- Cards should look like playing cards — rectangular with rounded corners, centered value, subtle border
- Selected card should visually "lift" (shadow + slight scale or translate-y)
- Flip animation on reveal: CSS `transform: rotateY(180deg)` with `backface-visibility: hidden`
- Card back (before reveal) shows a generic pattern or solid color
- Keep the layout simple: card deck at top, participants table below, action buttons (Reveal/Clear) between them
- Home page should be minimal: centered card with room name input

## Technical Considerations

- **Architecture:** Directly adapted from `reference-similar-sample-app/` — same signaling, WebRTC, Yjs, and build patterns
- **Yjs shared types:** `Y.Map` for participants (peerId -> {name, vote}), `Y.Map` for root state (revealed: boolean, roomName: string)
- **Signaling:** Same HTTP-based polling protocol — no WebSocket server needed
- **Star topology:** Host maintains connections to all joiners and relays Yjs updates
- **Build:** Bun bundler with Tailwind plugin, HTML entrypoint, outputs to `dist/`
- **Deployment:** Vercel with Bun runtime, serverless functions in `api/`, SPA rewrite for client-side routing
- **No Yjs persistence needed** — poker state is ephemeral and only matters while the session is active
- **RxJS** for session lifecycle management (polling, reconnection, cleanup) — same pattern as reference app

## Success Metrics

- A host can create a room and get a shareable URL in under 5 seconds
- A teammate can join via shared link and be ready to vote in under 3 seconds (with name in localStorage)
- All participants see vote status updates within 500ms of each other
- Card reveal animation plays smoothly on all participants' screens simultaneously
- The app works with at least 10 simultaneous participants in one room
- Zero server costs beyond Vercel's free tier (serverless signaling only)

## Open Questions

- Should we show a visual indicator when WebRTC connection is being established (connecting state)?
- What happens if the host leaves mid-session — should we handle host migration or just let the session end?
- Should the "coffee" card (break suggestion) be treated as a non-numeric vote or excluded from any future stats?
- Should there be a maximum room name length?
