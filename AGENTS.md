# Repository Guidelines

Please provide all answers in Japanese

## Project Structure & Module Organization

- Core React + TypeScript code sits in `src/`; components, contexts, utilities, and the manual regression tests (`src/test/entryStatusTest.ts`) live in matching subfolders.
- Shared styling stays under `src/styles/` while legacy overrides remain in `src/styles.css`; static assets are served from `public/`.
- Build artefacts drop into `dist/`; deployment config is tracked in `.netlify/` and `netlify.toml`; helper scripts (notably `scripts/set-build-time.js`) stamp `.env.build` and refresh `public/version.json`.

## Build, Test, and Development Commands

- `npm run dev` — start the Vite dev server with HMR at http://localhost:5173.
- `npm run build` — run the build-time script, compile TypeScript, and emit an optimized bundle in `dist/`.
- `npm run preview` — serve the production bundle locally to validate Netlify-ready output.
- `npm run lint` / `npm run lint:fix` — enforce the Airbnb + Prettier ESLint configuration, optionally autofixing.
- `npm run format:check` / `npm run format` — verify or rewrite formatting across `src/**/*.{ts,tsx,css}`.
- `npm run quality:check` — gate releases by chaining type-check, lint, Prettier audit, and a full build.

## Coding Style & Naming Conventions

- `tsconfig.json` enables `strict` mode and unused checks; treat compiler warnings as blockers.
- Prefer 2-space indentation and Prettier defaults; run `npm run format` before review.
- Name React components with `PascalCase` (`MonthlyView.tsx`), utilities/hooks with `camelCase` (`backgroundSyncManager`), and types/interfaces with `PascalCase` inside `src/types`.
- Co-locate CSS with its component when feasible; otherwise extend the shared tokens in `src/styles/`.

## Testing Guidelines

- Automated coverage is limited; `src/test/entryStatusTest.ts` exposes smoke tests via the browser console.
- After launching the dev server, execute `window.entryStatusTest.runAllTests();` to validate entry-state logic and cache behaviour.
- Expand the fixture arrays in that file when introducing new business rules, and log expected vs. actual outcomes in Japanese or English.
- Document additional manual validation (devices, browsers, API fixtures) in the PR until a formal runner (e.g., Vitest) is introduced.

## Commit & Pull Request Guidelines

- Mirror the Git history by writing concise, imperative summaries (`強力なバージョン自動更新追加`) in Japanese or English; keep the first line under ~50 characters.
- Group related changes per commit and rerun `npm run quality:check` before finalizing.
- Pull requests must include context, linked issue or ticket IDs, UI screenshots/GIFs for visible changes, and a checklist of local commands executed.
- Call out required environment variables and update sample `.env.local` entries or docs when the contract changes.
