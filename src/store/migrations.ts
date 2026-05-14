import type {
  MealPlan,
  MealPlanEntry,
  PersistedState,
  Profile,
  ProficiencyLevel,
  Recipe,
  RecipeTask,
  TaskKind,
} from '../types';

export const SCHEMA_VERSION = 1;

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

function normaliseProfile(v: unknown): Profile {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    id: asString(o.id, 'local'),
    displayName: asString(o.displayName, 'You'),
    proficiency: asProficiency(o.proficiency),
    speedMultiplier: asNumber(o.speedMultiplier, 1),
    units: o.units === 'imperial' ? 'imperial' : 'metric',
  };
}

function normaliseTask(v: unknown): RecipeTask | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = asString(o.id, '');
  if (!id) return null;
  return {
    id,
    label: asString(o.label, 'Untitled step'),
    kind: asTaskKind(o.kind),
    baselineSeconds: asNumber(o.baselineSeconds, 60),
    dependsOn: asArray(o.dependsOn, (x) => (typeof x === 'string' ? x : null)),
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
    servings: asNumber(o.servings, 2),
    tasks: asArray(o.tasks, normaliseTask),
    ...(notes ? { notes } : {}),
  };
}

function normalisePlanEntry(v: unknown): MealPlanEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const recipeId = asString(o.recipeId, '');
  if (!recipeId) return null;
  return { recipeId, scale: asNumber(o.scale, 1) };
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
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: normaliseProfile(o.profile),
    recipes: asArray(o.recipes, normaliseRecipe),
    plans: asArray(o.plans, normalisePlan),
  };
}
