# Fictional Waffle — Working Conventions

A recipe app that paints a recipe as a left-to-right **timeline** ending at the user's target serve time. Recipes are modelled as graphs of tasks (prep, active cooking, passive cooking, rest) with parallel branches and merge points, so the app can interleave dishes and surface what to start *now*.

## The Concept (so design decisions trace back to it)

- Most recipes are written as prose. This app extracts the **ingredients** and the **timeline** so cooks can see the shape of the cook at a glance.
- A recipe is a DAG of tasks. Tasks have a duration, a kind (`prep` / `active` / `passive` / `rest`), and dependencies. Passive tasks (oven, simmer) free the cook to do other work in parallel.
- Multiple dishes in a meal share **one cook** — the schedule has to acknowledge the cook can't be in two active tasks at once. Non-critical tasks can be front-loaded and interleaved.
- Users have a **proficiency profile** (novice / enthusiast / chef, or a measured baseline from a calibration recipe) that scales prep-task durations.
- During the cook, the app **creeps along the timeline** in real time. If the cook is behind, they tell the app where they are and serve time re-projects.
- Later: a sous-chef role re-allocates tasks; voice prompts narrate next steps.

## App Sections

1. **Profile** — proficiency profile, units, calibration test recipe.
2. **Library** — recipes (built-in + user-authored). Each recipe is a task graph, not prose.
3. **Plan** — pick recipes, set serve time, scheduler produces a merged timeline.
4. **Kitchen** — live timeline view during the cook with re-projection controls.

## Storage

- Static SPA, **local-only**. Everything in `localStorage` (and JSON file import/export for portability). No backend, no auth.
- Deploys to GitHub Pages from `main`.
- A future cloud-sync layer is possible but explicitly out of scope until the core timeline UX is proven.

## Stack

- Vite + React + TypeScript (strict).
- Zustand for state.
- Plain CSS files, co-located with components. Global tokens in `src/index.css`.
- No CSS-in-JS, no Tailwind unless explicitly asked.
- The timeline starts as plain SVG + CSS. Only reach for a charting lib if hand-rolled SVG actually hurts.

---

## Versioning & Visibility

- **Bump `package.json` version on every commit** — patch by default, minor/major only when warranted. The version badge in the app toolbar is how the user tells whether a new build is live.
- Version is injected via Vite's `define` in `vite.config.ts` from `package.json` and rendered in a toolbar corner badge.

## Branching & Deploy

- Develop on the session branch `claude/setup-recipe-app-mPY8r` (or as specified).
- **Only push the feature branch from Claude.** A GitHub Actions workflow (`.github/workflows/deploy.yml`) fast-forwards `main` to the feature branch on every push, then builds and deploys to Pages. This exists because direct pushes to `main` from the Claude sandbox are blocked by a session-level proxy — letting Actions do the promotion sidesteps that cleanly.
- The fast-forward is non-force: if `main` has diverged from the feature branch (e.g. someone pushed to `main` directly), the workflow fails loudly rather than overwriting work. Resolve by rebasing the feature branch onto `main`.
- If a push fails due to network, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

## Build Before Commit

- Always run `npm run build` before committing. Catch TypeScript strict errors and bundle issues before CI.
- Never commit code that doesn't build. If CI fails on something missed, fix it immediately.

## Commit Discipline

- Descriptive multi-line commit messages: one-line summary of *what*, body explaining *why*.
- Append the session URL to every commit message.
- Never amend published commits — always create new commits.
- Stage specific files, not `git add -A`, to avoid committing sensitive files.

## React Hooks & Early Returns

- All hooks must come before any conditional return. React error #310 (hooks mismatch) happens when `useMemo` / `useState` / `useEffect` appear after an `if (!x) return null` guard.
- Move all hooks above the guard, use `data?.foo ?? fallback` inside them.

## State Management (Zustand)

- Single top-level store. State + actions inline.
- **Immutable updates only** — return new objects/arrays, never mutate.
- Derived values live in `useMemo` inside components, not in the store.
- When adding new fields to persisted data, always add a migration step in the loader that defaults the new field for older payloads. Without this, loading a pre-existing profile / recipe / plan crashes.

## Type Conventions

- Shared types in `src/types/index.ts`. Domain types next to their components.
- `interface` for object shapes, `type` for unions/utilities.
- Optional fields use `?:` and are guarded at every read site.
- **The four-place rule:** when adding a field to a domain interface (e.g. `Recipe`, `Task`, `Profile`), update *all four*:
  1. the type,
  2. the factory function,
  3. any import/export builders (JSON, CSV),
  4. the `normaliseShape` migration.
  Miss one and stale data crashes the app.

## Schema Evolution

- Never silently change field shapes. Bump a schema version and add a migration step.
- A `normaliseShape` pass runs on every load regardless of version, adding sane defaults for any missing fields. This is the safety net for partially-migrated payloads.

## Styling

- Plain CSS, co-located with components. Global variables in `src/index.css`.
- CSS custom properties for theming (light/dark via `var(--color-surface)` etc.).
- For print: `@media print` rules in the component's CSS. Reminders: `position: fixed` repeats on every printed page, `background-image` doesn't print by default (use `<img>`), `@page` margin boxes aren't reliably supported.

## Modal/Dialog Patterns

- Backdrop uses `onMouseDown={onClose}` (not `onClick`) — prevents closing when the user drags a text selection outside the panel.
- Panel uses `onMouseDown={(e) => e.stopPropagation()}` to match.
- Close button uses regular `onClick`.

## Comments

- Explain *why*, not *what*. Call out non-obvious consequences and invariants.
- When fixing a subtle bug, leave a comment referencing the symptom so the fix isn't reverted later.
- Default to no comments. Don't restate code.

## Shipping Cadence

- Small, verifiable increments. Ship often, bump version every time.
- Don't batch unrelated changes into one commit.
- Report what shipped in 1–2 sentences after pushing.

## Communication Style

- State what you're about to do in one sentence before starting.
- Short updates at key moments (found something, changed direction, hit a blocker).
- End-of-turn summary: what changed and what's next. Nothing else.
- When the user says "roll back," use `git revert` (non-destructive) rather than `git reset --hard` — the latter requires force-pushing which risks losing work on shared branches.

## Domain-Specific Reminders

- **Durations are user-relative.** A recipe stores baseline durations; the active proficiency profile scales them at render time. Don't bake the scaled values into the recipe.
- **Tasks form a DAG, not a list.** Don't assume linear order anywhere — always traverse dependencies.
- **The scheduler is pure.** Given (recipes, profile, serve time, current time), it produces the same merged timeline. Keep it free of React / store imports so it's testable in isolation.
- **Clock skew matters.** During a cook the user might pause, get behind, or re-anchor "I'm here now." Treat the timeline as a projection of *remaining* work from *now*, not a fixed schedule.
