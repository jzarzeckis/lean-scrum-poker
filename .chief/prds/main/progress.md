## Codebase Patterns
- Use `bun-plugin-tailwind` for Tailwind CSS (configured in bunfig.toml under `[serve.static]`)
- shadcn/ui components live in `src/components/ui/` with `@/` path alias
- `build.ts` scans `src/` for HTML entrypoints and outputs to `dist/`
- Dev server runs on port 3000 via `bun --hot src/index.ts`
- `reference-similar-sample-app` is a symlinked reference project (excluded from tsconfig)
- Use `Record<string, any>` for dynamic CLI config parsing in build.ts to avoid TS strict mode issues
- Signaling API route is `/api/signaling?action=<action>` — POST for mutations, GET for poll-answer
- `src/handleSignaling.ts` is the shared dispatcher used by both dev server and Vercel function
- Dev server wires signaling via `routes: { "/api/signaling": handleSignaling }` in `src/index.ts`

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
