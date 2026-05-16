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
- [x] **Section restructure** — Library → Explore, new Cookbook section, Plan → Planner, Kitchen → Cook. New domain fields: `Recipe.source`, `Recipe.ingredients`, `PersistedState.cookbookIds`, `PersistedState.activePlanId`. Schema migrated to v2. (v0.1.4)
- [x] **Seed recipes + Explore + Cookbook + detail modal** — three built-in recipes, card grid in Explore and Cookbook, modal with ingredients + steps (coloured by kind). `useAllRecipes()` merges seeds with user recipes. Pure `criticalPathSeconds()` helper. (v0.1.5)
- [x] **Planner v0** — editable plan name and serve time, entry list with per-entry scale and remove, "Add from your cookbook" picker grid. Crude earliest-start readout (longest single critical path) until the real scheduler lands. (v0.1.6)
- [x] **Profile editor** — display name, units radio, proficiency segmented control mapped to speed multipliers, "10-minute prep takes ~Xm" preview. (v0.1.7)
- [x] **Scheduler v0 + Cook timeline** — pure `lib/scheduler.ts` merges the plan's recipe DAGs into one as-late-as-possible timeline (prep scaled by proficiency, cyclic recipes skipped, cook double-booking detected). Cook renders it as an SVG timeline (lane per dish, axis, serve marker, ticking now-line) with readout + conflict warnings. Planner gets a "Cook this plan" button. (v0.2.0)

## In progress

- [ ] _(nothing right now — pick the next item from "Next up")_

## Next up (rough order)

### Profile
- [ ] **Calibration recipe** — a small fixed recipe the user cooks; we measure their actual time and set `speedMultiplier` from it (proficiency → `custom`).
- [ ] Multiple profiles (household members), switchable from the top-right popover.
- [ ] Reset / clear-all-data action (already in store as `resetAll`; needs a confirmed UI affordance).

### Explore
- [ ] Search / filter the catalogue.
- [ ] Task DAG visualisation in the detail modal (replace the step list).
- [ ] JSON import: drop a recipe JSON into Explore to make it available.

### Cookbook
- [ ] Recipe authoring: add/edit/remove tasks, set kind (prep/active/passive/rest), duration, dependencies.
- [ ] Duplicate a seed recipe to make it editable as a user recipe.
- [ ] JSON export per recipe and whole cookbook (round-trips through `normaliseShape`).
- [ ] Servings scaling on the recipe (separate from per-plan scaling).

### Scheduler (the meaty one — v0 shipped, needs the constraint solver)
- [x] v0: merge recipe DAGs, as-late-as-possible pass, prep scaled by proficiency, conflict *detection*. (v0.2.0)
- [ ] **Resolve the single-cook constraint** — no two `prep`/`active` tasks overlap; interleave non-critical prep into `passive`/`rest` gaps instead of just flagging the clash.
- [ ] Scale prep durations by the plan entry's serving `scale` (more servings ⇒ more chopping; passive time unchanged).
- [ ] Unit tests for the scheduler (it's pure — easy to test in isolation).

### Planner
- [ ] Plan timeline preview (reuse the Cook `Timeline` component, read-only).
- [ ] Save / load multiple named plans (currently one active plan at a time).
- [ ] Serve-time presets ("tonight at 7" / "in 90 minutes").

### Cook
- [x] Static merged timeline (SVG, lane per dish, ticking now-line). (v0.2.0)
- [ ] "Start cook" action that anchors `now` to the schedule.
- [ ] Per-task "done" tap → marks complete and re-projects downstream.
- [ ] "I'm here" / "I'm behind" re-anchor control → re-projects serve time forward.
- [ ] Separate lanes for active vs passive so the cook can see when they're free.
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
