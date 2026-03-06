## Codebase Patterns
- Use `bun-plugin-tailwind` for Tailwind CSS (configured in bunfig.toml under `[serve.static]`)
- shadcn/ui components live in `src/components/ui/` with `@/` path alias
- `build.ts` scans `src/` for HTML entrypoints and outputs to `dist/`
- Dev server runs on port 3000 via `bun --hot src/index.ts`
- `reference-similar-sample-app` is a symlinked reference project (excluded from tsconfig)
- Use `Record<string, any>` for dynamic CLI config parsing in build.ts to avoid TS strict mode issues

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
