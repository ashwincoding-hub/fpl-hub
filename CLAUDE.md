@AGENTS.md

# FPL Hub: project notes

- Next.js 16 app (App Router, `src/`), TypeScript, Tailwind v4, zustand (persisted to localStorage), vitest.
- Checks before finishing any change: `npm run lint && npm run typecheck && npm test`.
- `src/lib/` is pure and framework-free (model, planner, rules); keep it that way so the backtest scripts in `scripts/` can import it.
- Model changes: re-run `npm run backtest -- --walk` and `npm run backtest -- --quick`, and compare against the current reports in `reports/` before committing. Bump `MODEL_VERSION` in `src/lib/model/project.ts`.
- `src/data/projections.json` is generated (`npm run projections`) and committed by the GitHub Action. Don't hand-edit it.
- Only call FPL through `src/lib/fpl/client.ts` (server) or `scripts/lib/cache.ts` (scripts, disk-cached and throttled).
- Public repo: no secrets, no work-related paths, names or emails in any file.
