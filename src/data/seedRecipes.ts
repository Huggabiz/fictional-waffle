import type { Recipe } from '../types';

// Built-in recipes. Read-only — users duplicate one to edit. They live in
// code (not localStorage) so they're always available and so we can ship
// improvements to them via a deploy.
//
// Task ids are local to the recipe; dependsOn references those local ids.
// Durations are baseline (enthusiast / 1.0×) in seconds.

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'seed:garlic-butter-prawn-pasta',
    title: 'Garlic-butter prawn pasta',
    source: 'builtin',
    servings: 2,
    notes: 'Quick weeknight pasta. The trick is to time the prawns to land just as the pasta is drained.',
    ingredients: [
      { id: 'i1', label: 'Spaghetti', quantity: 200, unit: 'g' },
      { id: 'i2', label: 'Raw prawns', quantity: 250, unit: 'g', notes: 'peeled, deveined' },
      { id: 'i3', label: 'Garlic', quantity: 3, unit: 'cloves' },
      { id: 'i4', label: 'Butter', quantity: 40, unit: 'g' },
      { id: 'i5', label: 'Olive oil', quantity: 1, unit: 'tbsp' },
      { id: 'i6', label: 'Lemon', quantity: 0.5, unit: '' },
      { id: 'i7', label: 'Flat-leaf parsley', quantity: 1, unit: 'handful' },
      { id: 'i8', label: 'Salt', quantity: 0, unit: 'to taste' },
    ],
    tasks: [
      { id: 't1', label: 'Boil salted water', kind: 'active', baselineSeconds: 60, dependsOn: [] },
      { id: 't2', label: 'Cook pasta', kind: 'passive', baselineSeconds: 600, dependsOn: ['t1'] },
      { id: 't3', label: 'Mince garlic', kind: 'prep', baselineSeconds: 90, dependsOn: [] },
      { id: 't4', label: 'Pat prawns dry, season', kind: 'prep', baselineSeconds: 90, dependsOn: [] },
      { id: 't5', label: 'Heat pan, melt butter', kind: 'active', baselineSeconds: 120, dependsOn: ['t3'] },
      { id: 't6', label: 'Sear prawns', kind: 'active', baselineSeconds: 180, dependsOn: ['t4', 't5'] },
      { id: 't7', label: 'Drain pasta, toss with prawns + lemon', kind: 'active', baselineSeconds: 90, dependsOn: ['t2', 't6'] },
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
      { id: 'i3', label: 'Lemon', quantity: 1, unit: '' },
      { id: 'i4', label: 'Garlic', quantity: 1, unit: 'head' },
      { id: 'i5', label: 'Olive oil', quantity: 3, unit: 'tbsp' },
      { id: 'i6', label: 'Thyme', quantity: 6, unit: 'sprigs' },
      { id: 'i7', label: 'Flaky salt', quantity: 0, unit: 'to taste' },
    ],
    tasks: [
      { id: 't1', label: 'Pre-heat oven to 200°C', kind: 'passive', baselineSeconds: 900, dependsOn: [] },
      { id: 't2', label: 'Halve potatoes, halve garlic head', kind: 'prep', baselineSeconds: 300, dependsOn: [] },
      { id: 't3', label: 'Pat chicken dry, salt generously', kind: 'prep', baselineSeconds: 180, dependsOn: [] },
      { id: 't4', label: 'Toss potatoes with oil + thyme', kind: 'prep', baselineSeconds: 120, dependsOn: ['t2'] },
      { id: 't5', label: 'Arrange tray: chicken on potatoes', kind: 'active', baselineSeconds: 180, dependsOn: ['t3', 't4'] },
      { id: 't6', label: 'Roast', kind: 'passive', baselineSeconds: 4200, dependsOn: ['t1', 't5'] },
      { id: 't7', label: 'Rest chicken on a board', kind: 'rest', baselineSeconds: 600, dependsOn: ['t6'] },
      { id: 't8', label: 'Carve and plate', kind: 'active', baselineSeconds: 240, dependsOn: ['t7'] },
    ],
  },
  {
    id: 'seed:greek-salad',
    title: 'Greek salad',
    source: 'builtin',
    servings: 2,
    notes: 'Make this while something else is in the oven — it’s pure prep, no cooking.',
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
      { id: 't1', label: 'Chop tomatoes into chunks', kind: 'prep', baselineSeconds: 150, dependsOn: [] },
      { id: 't2', label: 'Slice cucumber', kind: 'prep', baselineSeconds: 120, dependsOn: [] },
      { id: 't3', label: 'Thinly slice red onion', kind: 'prep', baselineSeconds: 90, dependsOn: [] },
      { id: 't4', label: 'Cube feta', kind: 'prep', baselineSeconds: 60, dependsOn: [] },
      { id: 't5', label: 'Toss with oil, vinegar, oregano', kind: 'active', baselineSeconds: 60, dependsOn: ['t1', 't2', 't3', 't4'] },
    ],
  },
];
