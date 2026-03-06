## Codebase Patterns
- Use `bun-plugin-tailwind` for Tailwind CSS (configured in bunfig.toml under `[serve.static]`)
- shadcn/ui components live in `src/components/ui/` with `@/` path alias
- `build.ts` scans `src/` for HTML entrypoints and outputs to `dist/`
- Dev server runs on port 3000 via `bun --hot src/index.ts`
- `reference-similar-sample-app` is a symlinked reference project (excluded from tsconfig)
- Use `Record<string, any>` for dynamic CLI config parsing in build.ts to avoid TS strict mode issues
- Store exposes `localPeerId` (string | null) — use it to key votes/participants for the current user
- Yjs `votes` map: key = localPeerId, value = card string (e.g. "5", "coffee", "?")
- shadcn/ui Dialog component is at `src/components/ui/dialog.tsx` (uses `@radix-ui/react-dialog`)
- `RoomPage.tsx` handles join-via-link: auto-joins if displayName in localStorage, else shows Dialog
- Signaling API route is `/api/signaling?action=<action>` — POST for mutations, GET for poll-answer
- `src/handleSignaling.ts` is the shared dispatcher used by both dev server and Vercel function
- Dev server wires signaling via `routes: { "/api/signaling": handleSignaling }` in `src/index.ts`
- `src/webrtc.ts` provides WebRTC primitives: createOffer, acceptOffer, acceptAnswer with base64-encoded SDP+ICE bundling
- `src/store.tsx` provides StoreProvider context, useStore(), and useYjsSnapshot() for Yjs-backed session state
- Yjs shared maps: `participants` (peerId→name), `votes` (peerId→card), `meta` (roomName, revealed)
- Cast `Uint8Array` to `Uint8Array<ArrayBuffer>` when passing to `dc.send()` to satisfy strict TS types

---

## 2026-03-06 - US-001
- What was implemented: Project scaffolding with Bun.serve(), React 19, Tailwind CSS, shadcn/ui, Vercel config
- Files changed:
  - `src/index.ts` - Added port 3000, removed boilerplate API routes
  - `src/App.tsx` - Simplified to scrum poker placeholder
  - `src/index.html` - Updated title
  - `vercel.json` - Created with build command, output dir, SPA rewrite
  - `tsconfig.json` - Excluded reference-similar-sample-app
  - `build.ts` - Fixed TypeScript strict mode errors
- **Learnings for future iterations:**
  - The project was bootstrapped from a Bun+React template; boilerplate files like APITester.tsx and logo SVGs still exist
  - `reference-similar-sample-app` symlink points to `../KPI-Planning-Tool` - useful reference for WebRTC/Yjs patterns
  - Must exclude `reference-similar-sample-app` from tsconfig or it causes TS errors from missing deps
---

## 2026-03-06 - US-002
- What was implemented: WebRTC signaling serverless function ported from reference app
- Files changed:
  - `src/signaling.ts` - In-memory session store with 6 actions (join, create, submit-answer, poll-answer, replace-offer, delete-session)
  - `src/handleSignaling.ts` - Request dispatcher handling POST/GET with validation
  - `api/signaling.ts` - Vercel serverless function entry point
  - `src/index.ts` - Added `/api/signaling` route for dev server
- **Learnings for future iterations:**
  - The signaling protocol uses pre-created offers: host creates offer first, joiner gets it instantly, only host polls
  - Sessions auto-expire: 30min max age, 2min without host poll, 10s stale threshold for takeover
  - `api/signaling.ts` just delegates to `handleSignaling` — keeps Vercel function minimal
  - The `api/` directory is for Vercel serverless functions; `vercel.json` rewrites route API requests there
---

## 2026-03-06 - US-003
- What was implemented: WebRTC connection layer ported from reference app
- Files changed:
  - `src/webrtc.ts` - createOffer, acceptOffer, acceptAnswer functions with ICE gathering, data channel setup, and base64 encoding
- **Learnings for future iterations:**
  - WebRTC flow: Joiner creates offer -> Host accepts offer (produces answer) -> Joiner accepts answer -> connection complete
  - Data channel named "yjs" with ordered delivery and arraybuffer binary type for Yjs updates
  - ICE gathering uses a 3-second timeout fallback if `icegatheringstatechange` doesn't fire
  - SDP + ICE candidates are bundled into a single base64 string for signaling exchange
  - encode/decode helpers are exported for reuse by the store layer
---

## 2026-03-06 - US-004
- What was implemented: Session store with Yjs CRDT sync, React context, and WebRTC peer management
- Files changed:
  - `src/store.tsx` - StoreProvider with Yjs Y.Doc, star topology peer connections, host polling, joiner reconnect
  - `package.json` / `bun.lock` - Added `yjs` dependency
- **Learnings for future iterations:**
  - Used plain async/await + AbortController instead of RxJS for session lifecycle (simpler, no extra dependency)
  - `Uint8Array` from Yjs needs cast to `Uint8Array<ArrayBuffer>` for `RTCDataChannel.send()` in strict TS
  - Store exposes `doc` directly; components read from Yjs maps and use `useYjsSnapshot()` to re-render on changes
  - Host sends full doc state (`Y.encodeStateAsUpdate`) to each new peer on data channel open
  - Joiner retries with 3s delay on disconnect; host polls continuously for new answers
  - Stale peers auto-cleaned after 30s of disconnection
---

## 2026-03-06 - US-005
- What was implemented: Home page with room creation using shadcn/ui Card, Label, Input, Button
- Files changed:
  - `src/HomePage.tsx` - Created with Card/CardHeader/CardContent wrapper, Label for input, slugify function, localStorage display name prompt
  - `src/App.tsx` - Added Router component with pushState navigation, handleCreateRoom connecting to session store
- **Learnings for future iterations:**
  - HomePage uses browser `prompt()` for display name; US-006 specifies shadcn/ui Dialog for joiners
  - slugify: lowercase, trim, remove special chars, spaces→hyphens
  - Router uses `window.location.pathname` + popstate for SPA routing
  - `connectToSession(slug, displayName)` from store handles both host and joiner roles
---

## 2026-03-06 - US-006
- What was implemented: Join a room via shared link with shadcn/ui Dialog for display name prompt
- Files changed:
  - `src/components/ui/dialog.tsx` - Created shadcn/ui Dialog component (Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription)
  - `src/RoomPage.tsx` - Created room page with auto-join (if localStorage has displayName) or Dialog prompt
  - `src/App.tsx` - Updated Router to render RoomPage for `/{room-slug}` paths
  - `package.json` / `bun.lock` - Added `@radix-ui/react-dialog` dependency
- **Learnings for future iterations:**
  - RoomPage uses `joinedRef` to prevent double-joining on re-renders
  - Dialog `onOpenChange` prevents closing without entering a name (checks `joinedRef.current`)
  - The store's `connectToSession` handles both host (no existing session) and joiner roles automatically
  - Future stories (US-007, US-008, US-009, US-010) will add card deck, participants list, reveal/clear to RoomPage
---

## 2026-03-06 - US-007
- What was implemented: Card deck with Fibonacci-like values and voting via Yjs
- Files changed:
  - `src/CardDeck.tsx` - Created with 13 card options (?, coffee, 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100), select/deselect toggle, Yjs votes map integration
  - `src/store.tsx` - Added `localPeerId` state to track current user's participant key, exposed via context
  - `src/RoomPage.tsx` - Integrated CardDeck component, shown when hosting or connected
- **Learnings for future iterations:**
  - Store now exposes `localPeerId` — host gets "host", joiners get "joiner-<uuid8>"
  - Votes are stored in Yjs `votes` map keyed by localPeerId; delete key to deselect
  - CardDeck reads votes via `doc.getMap("votes").get(localPeerId)` and uses `useYjsSnapshot()` for reactivity
  - Coffee card uses Lucide `Coffee` icon from `lucide-react`
---

## 2026-03-06 - US-008
- What was implemented: Participants list with vote status indicators using shadcn/ui Card
- Files changed:
  - `src/ParticipantsList.tsx` - Created with Card container, Check/Minus icons for vote status, revealed vote display, current user highlighting
  - `src/RoomPage.tsx` - Integrated ParticipantsList below CardDeck
  - `src/store.tsx` - Added `participantKey` to PeerEntry, Yjs observer to track participant keys, cleanup of Yjs entries on peer disconnect
- **Learnings for future iterations:**
  - PeerEntry now has `participantKey` field mapping WebRTC peers to Yjs participant map keys
  - Host observes Yjs participants map changes to associate new keys with recently connected peers
  - Stale peer cleanup (30s) also removes participant and vote entries from Yjs maps
  - `doc.getMap("meta").get("revealed")` controls whether vote values are shown or hidden
---

## 2026-03-06 - US-009
- What was implemented: Reveal button and card flip animation for showing votes
- Files changed:
  - `src/RoomPage.tsx` - Extracted `RoomContent` component with Reveal button that sets `meta.revealed` to true via Yjs; button disabled after reveal
  - `src/ParticipantsList.tsx` - Replaced static vote indicators with CSS 3D flip animation (~300ms) using perspective, backface-visibility, and rotateY transform
- **Learnings for future iterations:**
  - RoomContent is a separate component so it can independently call `useYjsSnapshot()` and read meta state
  - Flip animation uses CSS `perspective` + `transformStyle: preserve-3d` + `backfaceVisibility: hidden` on front/back faces
  - Front face shows Check/Minus icons; back face shows vote value or dash — rotateY(180deg) flips between them
---
