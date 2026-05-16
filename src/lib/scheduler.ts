import type { MealPlan, Profile, Recipe, RecipeTask, TaskKind } from '../types';

// The scheduler. PURE — no React, no store imports — so it can be tested in
// isolation (CLAUDE.md). Given a plan, the recipes it references, and the
// active profile, it produces one merged timeline.
//
// v0 strategy: schedule every task as late as possible (backward pass from
// serve time). This is correct for dependencies and gives a tight timeline,
// but it does NOT yet resolve the single-cook constraint — it only DETECTS
// where the cook would be double-booked and reports those regions as
// conflicts. Resolving them (interleaving prep into passive gaps) is the
// next slice.

/** An ingredient as it appears at a station — quantity already scaled to the
 *  plan entry's serving count. */
export interface ScheduledIngredient {
  label: string;
  quantity: number;
  unit: string;
}

export interface ScheduledTask {
  recipeId: string;
  recipeTitle: string;
  taskId: string;
  label: string;
  kind: TaskKind;
  /** Seconds from the schedule's start (0) to this task's start. */
  startOffset: number;
  /** Duration in seconds, after proficiency scaling. */
  duration: number;
  /** Phase name, carried through for the tube-map's station styling. */
  group?: string;
  /** Recipe-local ids this task depends on — for drawing track connectors. */
  dependsOn: string[];
  /** Ingredients this step handles, scaled to the planned servings. */
  ingredients: ScheduledIngredient[];
}

/** A stretch of time where two or more cook-occupying tasks overlap. */
export interface CookConflict {
  startOffset: number;
  endOffset: number;
}

export interface Schedule {
  tasks: ScheduledTask[];
  /** Earliest task start → serve, in seconds. */
  totalDuration: number;
  conflicts: CookConflict[];
  /** Ids of plan recipes skipped because their task graph has a cycle. */
  cyclicRecipeIds: string[];
}

/** Prep scales with the cook's hands; cooking and resting are wall-clock fixed. */
export function scaledDuration(task: RecipeTask, profile: Profile): number {
  return task.kind === 'prep'
    ? task.baselineSeconds * profile.speedMultiplier
    : task.baselineSeconds;
}

/** prep + active occupy the single cook; passive (oven) + rest free them up. */
export function occupiesCook(kind: TaskKind): boolean {
  return kind === 'prep' || kind === 'active';
}

/**
 * Per recipe: the "lead start" of each task — seconds before serve that the
 * task must begin. Computed by an as-late-as-possible backward pass.
 * Returns null if the recipe's dependency graph has a cycle.
 */
function computeLeadStarts(
  recipe: Recipe,
  profile: Profile,
): Map<string, number> | null {
  const byId = new Map(recipe.tasks.map((t) => [t.id, t]));

  // Invert dependsOn into a dependents map so we can walk forward.
  const dependents = new Map<string, string[]>();
  for (const t of recipe.tasks) dependents.set(t.id, []);
  for (const t of recipe.tasks) {
    for (const dep of t.dependsOn) {
      if (byId.has(dep)) dependents.get(dep)!.push(t.id);
    }
  }

  const leadStart = new Map<string, number>();
  const visiting = new Set<string>();

  // leadStart(X) = leadEnd(X) + duration(X)
  // leadEnd(X)   = max leadStart over tasks that depend on X (0 if terminal),
  //               because X must finish before its earliest-starting dependent.
  function compute(id: string): number | null {
    const cached = leadStart.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return null; // cycle
    const task = byId.get(id);
    if (!task) return 0;

    visiting.add(id);
    let leadEnd = 0;
    for (const dependentId of dependents.get(id) ?? []) {
      const dependentLead = compute(dependentId);
      if (dependentLead === null) return null;
      if (dependentLead > leadEnd) leadEnd = dependentLead;
    }
    visiting.delete(id);

    const value = leadEnd + scaledDuration(task, profile);
    leadStart.set(id, value);
    return value;
  }

  for (const t of recipe.tasks) {
    if (compute(t.id) === null) return null;
  }
  return leadStart;
}

/** Sweep cook-occupying tasks for overlapping regions. v0: pairwise sweep,
 *  merged into contiguous bands — good enough to flag "you're double-booked". */
function findConflicts(tasks: ScheduledTask[]): CookConflict[] {
  const intervals = tasks
    .filter((t) => occupiesCook(t.kind))
    .map((t) => ({ start: t.startOffset, end: t.startOffset + t.duration }))
    .sort((a, b) => a.start - b.start);

  const conflicts: CookConflict[] = [];
  let coverEnd = -Infinity;

  for (const iv of intervals) {
    if (iv.start < coverEnd) {
      const cStart = iv.start;
      const cEnd = Math.min(coverEnd, iv.end);
      const last = conflicts[conflicts.length - 1];
      if (last && cStart <= last.endOffset) {
        last.endOffset = Math.max(last.endOffset, cEnd);
      } else {
        conflicts.push({ startOffset: cStart, endOffset: cEnd });
      }
    }
    coverEnd = Math.max(coverEnd, iv.end);
  }
  return conflicts;
}

export function buildSchedule(
  plan: MealPlan,
  recipesById: Map<string, Recipe>,
  profile: Profile,
): Schedule {
  interface Pending extends Omit<ScheduledTask, 'startOffset'> {
    leadStart: number;
  }

  const pending: Pending[] = [];
  const cyclicRecipeIds: string[] = [];
  let maxLead = 0;

  for (const entry of plan.entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) continue;

    const leads = computeLeadStarts(recipe, profile);
    if (!leads) {
      cyclicRecipeIds.push(recipe.id);
      continue;
    }

    // Ingredient quantities scale with how many servings this plan wants.
    const ingredientById = new Map(recipe.ingredients.map((i) => [i.id, i]));
    const servingFactor =
      recipe.servings > 0 ? entry.servings / recipe.servings : 1;

    for (const task of recipe.tasks) {
      const leadStart = leads.get(task.id);
      if (leadStart === undefined) continue;
      pending.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        taskId: task.id,
        label: task.label,
        kind: task.kind,
        duration: scaledDuration(task, profile),
        dependsOn: task.dependsOn,
        ingredients: task.ingredientIds
          .map((id) => ingredientById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => ({
            label: i.label,
            quantity: i.quantity * servingFactor,
            unit: i.unit,
          })),
        ...(task.group ? { group: task.group } : {}),
        leadStart,
      });
      if (leadStart > maxLead) maxLead = leadStart;
    }
  }

  // All recipes share serve (lead 0); offset = how far after the global start.
  const tasks: ScheduledTask[] = pending.map(({ leadStart, ...rest }) => ({
    ...rest,
    startOffset: maxLead - leadStart,
  }));

  return {
    tasks,
    totalDuration: maxLead,
    conflicts: findConflicts(tasks),
    cyclicRecipeIds,
  };
}
