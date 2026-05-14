# Fictional Waffle — Implementation Progress

A living checklist of what's shipped vs. what's next. Edit freely — this is
the source of truth for "where are we?". When something ships, tick it and
note the version it landed in.

Conventions are in `CLAUDE.md`; this file is just the punch list.

---

## Conceptual model

The user flow walks four sections:

1. **Profile** _(top-right user menu, Office-365 style)_ — who's cooking, how fast they are, units.
2. **Explore** _(side nav)_ — browse the recipe catalogue (built-in + future community). Tap a recipe to **add it to your cookbook**.
3. **Cookbook** _(side nav)_ — your saved recipes. From here you can edit, duplicate, remove, or **add to a plan**.
4. **Planner** _(side nav)_ — compose a meal from cookbook recipes, set a serve time, see the merged timeline.
5. **Cook** _(side nav)_ — cook the active plan along a live timeline.

So "Library" splits into Explore (discovery) + Cookbook (the user's saved set), "Plan" becomes "Planner" since it's where you compose, and "Kitchen" becomes "Cook" because the verb is the action.

---

## Shipped

- [x] **Scaffold** — Vite + React 18 + TS strict, Zustand store, plain CSS, GH Pages target. (v0.1.0)
- [x] **App shell** — toolbar with brand + version badge, side nav, section routing. (v0.1.0)
- [x] **Persistence** — localStorage with schema version + `normaliseShape` migration safety net. (v0.1.0)
- [x] **CI/CD** — Actions: `claude/**` push fast-forwards `main`, then a separate `deploy.yml` builds and deploys Pages from `main` (so the `github-pages` environment's branch rule is satisfied). (v0.1.2)
- [x] **Top-right user menu** — Office-365-style avatar chip + popover (name, proficiency, units, "Profile settings" link to the full section). Profile removed from side nav. (v0.1.3)

## In progress

- [ ] _(nothing right now — pick the next item from "Next up")_

## Next up (rough order)

### Section model restructure (v0.1.4)
- [ ] Rename "Library" section → **Explore**.
- [ ] Add new **Cookbook** section (the user's saved recipes — initially empty).
- [ ] Rename "Plan" section → **Planner**.
- [ ] Rename "Kitchen" section → **Cook**.
- [ ] Side nav order: Explore · Cookbook · Planner · Cook.
- [ ] Domain types: `Recipe` gains a `source: 'builtin' | 'user'` field; persisted state gains `cookbookIds: string[]` (set of recipe ids the user has added to their cookbook). _Four-place rule._
- [ ] Explore card action: "Add to cookbook" toggles `cookbookIds`.
- [ ] Cookbook empty state: "Nothing here yet — head to Explore to add recipes."

### Profile
- [ ] Editable profile inside the Profile section (display name, proficiency preset, units).
- [ ] Speed multiplier preview: "at your speed, a 10-minute prep is ~Xm".
- [ ] **Calibration recipe** — a small fixed recipe the user cooks; we measure their actual time and set `speedMultiplier` from it (proficiency → `custom`).
- [ ] Multiple profiles (household members), switchable from the top-right popover.
- [ ] Reset / clear-all-data action (already in store as `resetAll`; needs a confirmed UI affordance).

### Explore
- [ ] Card grid of available recipes with search/filter.
- [ ] Recipe detail view: ingredients column + task DAG visualisation.
- [ ] Built-in seed recipes (3–5) so Explore is non-empty on first run.
- [ ] "Add to cookbook" / "Remove from cookbook" toggle on each card.
- [ ] JSON import: drop a recipe JSON into Explore to make it available.

### Cookbook
- [ ] List of recipes the user has added (filtered subset of Explore + any user-authored).
- [ ] Recipe authoring: add/edit/remove tasks, set kind (prep/active/passive/rest), duration, dependencies.
- [ ] Recipe duplication.
- [ ] JSON export per recipe and whole cookbook (round-trips through `normaliseShape`).
- [ ] "Add to current plan" action.
- [ ] Servings scaling on the recipe (separate from per-plan scaling).

### Planner
- [ ] Plan picker: select recipes from cookbook, set per-recipe scale.
- [ ] Serve time picker (date + time, plus "tonight at 7" / "in 90 minutes" presets).
- [ ] **Scheduler** (pure module, no React/store imports):
  - merges multiple recipe DAGs into one timeline,
  - respects the single-cook constraint (no two `active` tasks overlapping),
  - front-loads non-critical prep so the cook's idle time during `passive` tasks is used,
  - applies the active profile's `speedMultiplier` to `prep` durations only.
- [ ] Plan timeline preview (read-only SVG, left-to-right, ending at serve time).
- [ ] Save / load named plans.

### Cook
- [ ] Live timeline view (SVG, time-scaled, with a moving now-indicator).
- [ ] "Start cook" action that anchors `now` to the schedule.
- [ ] Per-task "done" tap → marks complete and re-projects downstream.
- [ ] "I'm here" / "I'm behind" re-anchor control → re-projects serve time forward.
- [ ] Separate lanes for active vs passive tasks so the cook can see when they're free.
- [ ] Local notifications when a passive task is about to end / has ended.
- [ ] Keep-screen-awake hint (Wake Lock API where supported).

## Later (explicitly out of scope until the core works)

- [ ] **Sous-chef role** — split active tasks across two cooks; renders both lanes.
- [ ] **Voice prompts** — TTS narrating the next step; "what's next?" voice query.
- [ ] **Cloud sync** layer (currently 100% local — JSON export is the portability story).
- [ ] PWA install / offline cache.
- [ ] Print view of a plan (one-pager for the fridge).

---

## Reminders (cross-cutting, easy to forget)

- **Four-place rule** when adding a domain field: type → factory → import/export → `normaliseShape`. See `CLAUDE.md`.
- **Scheduler stays pure.** It must be testable without React/Zustand imports.
- **Durations are user-relative.** Recipes store baseline seconds; scaling happens at render time.
- **Version bump every commit.** The toolbar badge is the user's way to confirm a new build is live.
