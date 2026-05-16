import type {
  MealPlan,
  MealPlanEntry,
  PersistedState,
  Profile,
  ProficiencyLevel,
  Recipe,
  RecipeIngredient,
  RecipeSource,
  RecipeTask,
  TaskKind,
} from '../types';

export const SCHEMA_VERSION = 4;

/** Fallback serving count when nothing better is known. */
const DEFAULT_SERVINGS = 2;

// The safety net: runs on every load regardless of version, fills in any
// missing fields with sane defaults. New domain fields go here too — that's
// what stops older payloads from crashing the app.

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asArray<T>(v: unknown, mapItem: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const mapped = mapItem(item);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  return asArray(v, (x) => (typeof x === 'string' ? x : null));
}

const PROFICIENCY_VALUES: ReadonlySet<ProficiencyLevel> = new Set([
  'novice',
  'enthusiast',
  'chef',
  'custom',
]);

function asProficiency(v: unknown): ProficiencyLevel {
  return typeof v === 'string' && PROFICIENCY_VALUES.has(v as ProficiencyLevel)
    ? (v as ProficiencyLevel)
    : 'enthusiast';
}

const TASK_KINDS: ReadonlySet<TaskKind> = new Set([
  'prep',
  'active',
  'passive',
  'rest',
]);

function asTaskKind(v: unknown): TaskKind {
  return typeof v === 'string' && TASK_KINDS.has(v as TaskKind)
    ? (v as TaskKind)
    : 'prep';
}

function asRecipeSource(v: unknown): RecipeSource {
  return v === 'builtin' ? 'builtin' : 'user';
}

function normaliseProfile(v: unknown): Profile {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    id: asString(o.id, 'local'),
    displayName: asString(o.displayName, 'You'),
    proficiency: asProficiency(o.proficiency),
    speedMultiplier: asNumber(o.speedMultiplier, 1),
    units: o.units === 'imperial' ? 'imperial' : 'metric',
    defaultServings: asNumber(o.defaultServings, DEFAULT_SERVINGS),
  };
}

function normaliseTask(v: unknown): RecipeTask | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = asString(o.id, '');
  if (!id) return null;
  const group = typeof o.group === 'string' && o.group ? o.group : undefined;
  return {
    id,
    label: asString(o.label, 'Untitled step'),
    kind: asTaskKind(o.kind),
    baselineSeconds: asNumber(o.baselineSeconds, 60),
    dependsOn: asStringArray(o.dependsOn),
    ...(group ? { group } : {}),
  };
}

function normaliseIngredient(v: unknown): RecipeIngredient | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = asString(o.id, '');
  if (!id) return null;
  const notes = typeof o.notes === 'string' ? o.notes : undefined;
  return {
    id,
    label: asString(o.label, 'Untitled ingredient'),
    quantity: asNumber(o.quantity, 0),
    unit: asString(o.unit, ''),
    ...(notes ? { notes } : {}),
  };
}

function normaliseRecipe(v: unknown): Recipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = asString(o.id, '');
  if (!id) return null;
  const notes = typeof o.notes === 'string' ? o.notes : undefined;
  return {
    id,
    title: asString(o.title, 'Untitled recipe'),
    source: asRecipeSource(o.source),
    servings: asNumber(o.servings, 2),
    ingredients: asArray(o.ingredients, normaliseIngredient),
    tasks: asArray(o.tasks, normaliseTask),
    ...(notes ? { notes } : {}),
  };
}

function normalisePlanEntry(v: unknown): MealPlanEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const recipeId = asString(o.recipeId, '');
  if (!recipeId) return null;
  // schema v2 stored a `scale` multiplier; v3 stores absolute `servings`.
  // Old payloads have no servings — fall back rather than guess from scale.
  return { recipeId, servings: asNumber(o.servings, DEFAULT_SERVINGS) };
}

function normalisePlan(v: unknown): MealPlan | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = asString(o.id, '');
  if (!id) return null;
  return {
    id,
    name: asString(o.name, 'Untitled plan'),
    serveAt: typeof o.serveAt === 'string' ? o.serveAt : null,
    entries: asArray(o.entries, normalisePlanEntry),
  };
}

export function normaliseShape(raw: unknown): PersistedState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const activePlanId =
    typeof o.activePlanId === 'string' ? o.activePlanId : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: normaliseProfile(o.profile),
    recipes: asArray(o.recipes, normaliseRecipe),
    cookbookIds: asStringArray(o.cookbookIds),
    plans: asArray(o.plans, normalisePlan),
    activePlanId,
  };
}
