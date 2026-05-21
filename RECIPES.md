# Authoring recipes

This file is the brief for a recipe author (human or LLM). The aim is that the
app's timeline reads the way a real cook would think about the dish, with
nothing silently glossed over.

A recipe is a **graph of tasks** (DAG), not a list of paragraphs. The
scheduler walks the graph, the tube-map view paints it. Both work only as
well as the task graph is honest.

## The cardinal rule

**Every action the cook performs is its own task.** If it takes the cook's
hands for more than a few seconds, it has its own row in `tasks`, a
`baselineSeconds`, and dependencies. Nothing — no matter how trivial —
should be folded into a passive task's preamble.

Why this matters: the app prompts the cook on each task in turn. If you
fold "drop the spaghetti in the boiling water" into a 10-minute passive
"Cook the spaghetti", the cook is never told to drop it in — the timeline
walks straight past the moment.

## Task kinds

Pick the kind that describes **what the cook is doing during the task**, not
what's happening to the food.

| kind | the cook is | example |
|---|---|---|
| `prep` | hands-on, knife or bowl work, away from the heat | "Mince the garlic", "Chop the tomatoes" |
| `active` | hands-on at the heat or in the oven | "Sear the prawns", "Slide the tray into the oven" |
| `passive` | hands free; something is on the heat or in the oven | "Boil a pan of salted water", "Bake the pizza" |
| `rest` | hands free; the dish is sitting still, not being cooked | "Rest the chicken on a board", "Cool fully in the tin" |

`prep` and `active` block the cook — the scheduler will not place another
`prep`/`active` in parallel. `passive` and `rest` free the cook to do
other work, which is what lets a meal interleave cleanly.

## Common patterns

### The boil cycle

Always four (or five) tasks, not one:

1. `active` — "Fill & salt a pan, hob on" (~25s)
2. `passive` — "Boil a pan of salted water" (~120s; depends on 1)
3. `active` — "Add the X to the water" (~15s; depends on 2)
4. `passive` — "Cook the X" (the actual cook time; depends on 3)
5. (later, an `active` task drains it as part of a finishing step)

The cook is prompted at every transition — when the water is on, when it
boils, when the food goes in, when to drain.

### The oven cycle

Three or four tasks around the bake:

1. `active` — "Switch the oven on to NNN°C" (~15s)
2. `passive` — "Pre-heat oven to NNN°C" (~10–15 min; depends on 1)
3. `active` — "Slide the X into the oven" (~15s; depends on 2 and on whatever's being baked being ready)
4. `passive` — "Bake / Roast" (the actual bake; depends on 3)
5. `active` — "Take the X out of the oven" (~15–20s; depends on 4)
6. Whatever follows (rest, carve, finish) depends on 5

Without the explicit slide-in and take-out tasks, the cook never gets a
prompt to do them.

### The marinate cycle

Two tasks, not one:

1. `active` — "Toss the beef with soy & cornflour" (the actual tossing)
2. `rest` — "Marinate the beef" (the sit time; depends on 1)

### Prep tasks

One prep task **per ingredient** that needs handling. "Slice the
cucumber" is its own station; don't pile vegetables into one mega-task.
Use a `group` to tie them into a visual phase.

## Schema

A task object:

```ts
{
  id: 'c2',                       // local to this recipe
  label: 'Sear the prawns',       // imperative — what the cook should do
  kind: 'active',                 // prep | active | passive | rest
  baselineSeconds: 180,           // enthusiast-cook estimate (1.0×)
  dependsOn: ['c1', 'g3'],        // list of task ids
  group: 'Cook the prawns',       // optional — phase title (see below)
  ingredientIds: ['i2'],          // ingredients this task uses
}
```

`baselineSeconds` is for a competent home cook (enthusiast tier). The
profile scales it — novice ×1.4, chef ×0.75 — so don't bake your own
speed into it.

### `group`

When several consecutive prep tasks belong to one phase ("Prep the
salad"), share a `group` value across them. The first task with that
group renders as a **major station** (the phase title), the rest render
as **minor stops** (sub-steps of the same job). Without a group, every
task is a major station — fine for the active cooking line, busy on a
prep run.

### `dependsOn`

The DAG. A task starts when **all** its dependencies have finished.
Chains, forks, and merges all work — but be deliberate about merges:
"Drain pasta, toss with prawns & lemon" depends on both "Cook the
spaghetti" *and* "Sear the prawns", which is what makes the scheduler
land them together at the right moment.

### `ingredientIds`

Link the task to the ingredients it actually handles, not the ingredients
in the same phase. The "Add the spaghetti to the water" task owns the
spaghetti ingredient; "Cook the spaghetti" owns none (the spaghetti is
already in).

## Naming

Imperative, second person, concrete. **"Slice the cucumber"** not
"Cucumber slicing" or "Prepare cucumber".

For the oven and pan cycles, use the cook's verb: "Slide the tray in",
"Take the chicken out", "Pour in the tomatoes". The cook is being told
what to do at that moment.

## Durations

- `baselineSeconds` is total **task time**, not just thinking time.
- Include the small actions (washing hands, fetching a board) in the
  prep duration; don't make them their own task.
- The minimum sensible duration is around 10 seconds — anything shorter
  is noise; fold it into a longer task.
- For an `active` trigger of a long passive (slide-in, drop-in), 15–25s
  is typical.

## What NOT to do

- Don't model every micro-action ("pick up the knife", "rinse the
  board") — those belong inside the prep duration.
- Don't make a `passive` task depend directly on another `passive`. The
  cook needs an `active` trigger between them. (Boil → Add → Cook, not
  Boil → Cook.)
- Don't use `rest` for marinating-and-tossing combined; split the toss
  out as `active`.
- Don't put two ingredients into one prep task unless they're prepared
  in the same physical action (mince garlic & ginger together — one
  task, two `ingredientIds`).

## Prompt template (for LLMs)

> Write a recipe for **[dish name]** as a `Recipe` object matching the
> schema in `src/types/index.ts`. Apply the rules in
> [RECIPES.md](./RECIPES.md): every cook action is its own task; use the
> boil cycle / oven cycle / marinate cycle patterns where applicable;
> never chain two passive tasks without an active trigger between them.
> One prep task per ingredient with imperative labels. Group prep tasks
> under one or two phase titles. Provide enthusiast-tier
> `baselineSeconds`. Return only the object literal.
