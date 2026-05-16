import type { Recipe } from '../types';

// Built-in recipes. Read-only — users duplicate one to edit. They live in
// code (not localStorage) so they're always available and so we can ship
// improvements to them via a deploy.
//
// Task ids are local to the recipe; dependsOn references those local ids.
// Durations are baseline (enthusiast / 1.0×) in seconds.
//
// `group` marks a phase: tasks sharing a group are sequential sub-steps of
// one job (e.g. one cook, one knife, working down a prep list). The tube-map
// draws the first as a big interchange station and the rest as minor stops.
// Prep is deliberately one task PER ingredient — "slice the carrots" is its
// own station. `ingredientIds` links a step to the ingredients it handles,
// shown on the food side of the tube-map.

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'seed:garlic-butter-prawn-pasta',
    title: 'Garlic-butter prawn pasta',
    source: 'builtin',
    servings: 2,
    notes: 'Quick weeknight pasta. The trick is to time the prawns to land just as the pasta is drained.',
    ingredients: [
      { id: 'i1', label: 'Spaghetti', quantity: 200, unit: 'g' },
      { id: 'i2', label: 'Raw prawns', quantity: 250, unit: 'g', notes: 'shell on' },
      { id: 'i3', label: 'Garlic', quantity: 3, unit: 'cloves' },
      { id: 'i4', label: 'Butter', quantity: 40, unit: 'g' },
      { id: 'i5', label: 'Olive oil', quantity: 1, unit: 'tbsp' },
      { id: 'i6', label: 'Lemon', quantity: 0.5, unit: '' },
      { id: 'i7', label: 'Flat-leaf parsley', quantity: 1, unit: 'handful' },
      { id: 'i8', label: 'Salt', quantity: 0, unit: 'to taste' },
    ],
    tasks: [
      { id: 'g1', label: 'Mince the garlic', kind: 'prep', baselineSeconds: 60, dependsOn: [], group: 'Prep prawns & garlic', ingredientIds: ['i3'] },
      { id: 'g2', label: 'Peel & devein the prawns', kind: 'prep', baselineSeconds: 150, dependsOn: ['g1'], group: 'Prep prawns & garlic', ingredientIds: ['i2'] },
      { id: 'g3', label: 'Pat prawns dry, season', kind: 'prep', baselineSeconds: 60, dependsOn: ['g2'], group: 'Prep prawns & garlic', ingredientIds: ['i8'] },
      { id: 'w1', label: 'Boil a pan of salted water', kind: 'active', baselineSeconds: 120, dependsOn: [], group: 'Cook the pasta', ingredientIds: [] },
      { id: 'w2', label: 'Cook the spaghetti', kind: 'passive', baselineSeconds: 600, dependsOn: ['w1'], group: 'Cook the pasta', ingredientIds: ['i1'] },
      { id: 'c1', label: 'Heat pan, melt the butter', kind: 'active', baselineSeconds: 120, dependsOn: ['g3'], ingredientIds: ['i4'] },
      { id: 'c2', label: 'Sear the prawns', kind: 'active', baselineSeconds: 180, dependsOn: ['c1'], ingredientIds: ['i2'] },
      { id: 'f1', label: 'Drain pasta, toss with prawns & lemon', kind: 'active', baselineSeconds: 90, dependsOn: ['w2', 'c2'], ingredientIds: ['i6', 'i7'] },
    ],
  },
  {
    id: 'seed:roast-chicken-tray',
    title: 'Tray-roast chicken with potatoes',
    source: 'builtin',
    servings: 4,
    notes: 'A long passive bake gives plenty of room to prep a side. Resting matters — don’t skip it.',
    ingredients: [
      { id: 'i1', label: 'Whole chicken', quantity: 1.6, unit: 'kg' },
      { id: 'i2', label: 'Baby potatoes', quantity: 800, unit: 'g' },
      { id: 'i3', label: 'Garlic', quantity: 1, unit: 'head' },
      { id: 'i4', label: 'Olive oil', quantity: 3, unit: 'tbsp' },
      { id: 'i5', label: 'Thyme', quantity: 6, unit: 'sprigs' },
      { id: 'i6', label: 'Flaky salt', quantity: 0, unit: 'to taste' },
    ],
    tasks: [
      { id: 'o1', label: 'Pre-heat oven to 200°C', kind: 'passive', baselineSeconds: 720, dependsOn: [], ingredientIds: [] },
      { id: 'v1', label: 'Halve the baby potatoes', kind: 'prep', baselineSeconds: 180, dependsOn: [], group: 'Prep the tray', ingredientIds: ['i2'] },
      { id: 'v2', label: 'Halve the garlic head', kind: 'prep', baselineSeconds: 30, dependsOn: ['v1'], group: 'Prep the tray', ingredientIds: ['i3'] },
      { id: 'v3', label: 'Pat chicken dry, salt generously', kind: 'prep', baselineSeconds: 150, dependsOn: ['v2'], group: 'Prep the tray', ingredientIds: ['i1', 'i6'] },
      { id: 'v4', label: 'Toss potatoes with oil & thyme', kind: 'prep', baselineSeconds: 90, dependsOn: ['v3'], group: 'Prep the tray', ingredientIds: ['i4', 'i5'] },
      { id: 'a1', label: 'Arrange tray: chicken on the potatoes', kind: 'active', baselineSeconds: 150, dependsOn: ['v4'], ingredientIds: [] },
      { id: 'r1', label: 'Roast', kind: 'passive', baselineSeconds: 4200, dependsOn: ['o1', 'a1'], ingredientIds: [] },
      { id: 'rest1', label: 'Rest the chicken on a board', kind: 'rest', baselineSeconds: 600, dependsOn: ['r1'], ingredientIds: [] },
      { id: 'a2', label: 'Carve and plate', kind: 'active', baselineSeconds: 240, dependsOn: ['rest1'], ingredientIds: [] },
    ],
  },
  {
    id: 'seed:greek-salad',
    title: 'Greek salad',
    source: 'builtin',
    servings: 2,
    notes: 'Pure prep, no cooking — make it while something else is in the oven.',
    ingredients: [
      { id: 'i1', label: 'Tomatoes', quantity: 3, unit: 'medium' },
      { id: 'i2', label: 'Cucumber', quantity: 1, unit: '' },
      { id: 'i3', label: 'Red onion', quantity: 0.5, unit: '' },
      { id: 'i4', label: 'Feta', quantity: 150, unit: 'g' },
      { id: 'i5', label: 'Kalamata olives', quantity: 80, unit: 'g' },
      { id: 'i6', label: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { id: 'i7', label: 'Red wine vinegar', quantity: 1, unit: 'tsp' },
      { id: 'i8', label: 'Dried oregano', quantity: 0.5, unit: 'tsp' },
    ],
    tasks: [
      { id: 'p1', label: 'Chop tomatoes into chunks', kind: 'prep', baselineSeconds: 150, dependsOn: [], group: 'Prep the salad', ingredientIds: ['i1'] },
      { id: 'p2', label: 'Slice the cucumber', kind: 'prep', baselineSeconds: 120, dependsOn: ['p1'], group: 'Prep the salad', ingredientIds: ['i2'] },
      { id: 'p3', label: 'Thinly slice the red onion', kind: 'prep', baselineSeconds: 90, dependsOn: ['p2'], group: 'Prep the salad', ingredientIds: ['i3'] },
      { id: 'p4', label: 'Cube the feta', kind: 'prep', baselineSeconds: 60, dependsOn: ['p3'], group: 'Prep the salad', ingredientIds: ['i4'] },
      { id: 't1', label: 'Toss with oil, vinegar & oregano', kind: 'active', baselineSeconds: 60, dependsOn: ['p4'], ingredientIds: ['i5', 'i6', 'i7', 'i8'] },
    ],
  },
  {
    id: 'seed:chunky-vegetable-soup',
    title: 'Chunky vegetable soup',
    source: 'builtin',
    servings: 4,
    notes: 'A long prep run, then a hands-free simmer. Good partner for a dish that needs attention.',
    ingredients: [
      { id: 'i1', label: 'Onion', quantity: 1, unit: 'large' },
      { id: 'i2', label: 'Leek', quantity: 1, unit: '' },
      { id: 'i3', label: 'Carrots', quantity: 3, unit: '' },
      { id: 'i4', label: 'Celery', quantity: 2, unit: 'sticks' },
      { id: 'i5', label: 'Potato', quantity: 1, unit: 'large' },
      { id: 'i6', label: 'Vegetable stock', quantity: 1.2, unit: 'l' },
      { id: 'i7', label: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { id: 'i8', label: 'Salt & pepper', quantity: 0, unit: 'to taste' },
    ],
    tasks: [
      { id: 'v1', label: 'Dice the onion', kind: 'prep', baselineSeconds: 90, dependsOn: [], group: 'Prep vegetables', ingredientIds: ['i1'] },
      { id: 'v2', label: 'Slice the leek', kind: 'prep', baselineSeconds: 90, dependsOn: ['v1'], group: 'Prep vegetables', ingredientIds: ['i2'] },
      { id: 'v3', label: 'Slice the carrots', kind: 'prep', baselineSeconds: 120, dependsOn: ['v2'], group: 'Prep vegetables', ingredientIds: ['i3'] },
      { id: 'v4', label: 'Dice the celery', kind: 'prep', baselineSeconds: 90, dependsOn: ['v3'], group: 'Prep vegetables', ingredientIds: ['i4'] },
      { id: 'v5', label: 'Cube the potato', kind: 'prep', baselineSeconds: 90, dependsOn: ['v4'], group: 'Prep vegetables', ingredientIds: ['i5'] },
      { id: 'c1', label: 'Sweat onion & leek in oil', kind: 'active', baselineSeconds: 240, dependsOn: ['v5'], ingredientIds: ['i7'] },
      { id: 'c2', label: 'Add carrots, celery, potato & stock', kind: 'active', baselineSeconds: 120, dependsOn: ['c1'], ingredientIds: ['i6'] },
      { id: 'c3', label: 'Simmer until tender', kind: 'passive', baselineSeconds: 1500, dependsOn: ['c2'], ingredientIds: [] },
      { id: 'c4', label: 'Blend smooth and season', kind: 'active', baselineSeconds: 120, dependsOn: ['c3'], ingredientIds: ['i8'] },
    ],
  },
];
