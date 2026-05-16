import type { MealPlan, Profile, Recipe, RecipeTask, TaskKind } from '../types';

// The scheduler. PURE — no React, no store imports — so it can be tested in
// isolation (CLAUDE.md). Given a plan, the recipes it references, and the
// active profile, it produces one merged timeline.
//
// The hard constraint: there is ONE cook. No two hands-on tasks (prep /
// active) may overlap. Passive tasks (oven, simmer) and rest don't need the
// cook, so they run freely in the background.
//
// Strategy — backward list scheduling on a single shared resource:
//  * Work backward from serve. A task is scheduled once all the tasks that
//    depend on it are scheduled.
//  * Each task is placed as late as it can be (closest to serve): a passive
//    task simply ends when its earliest dependent starts; a hands-on task
//    takes the latest cook slot that is free and ends in time.
//  * Among tasks ready to schedule we take the most serve-critical first
//    (smallest lead), with gentle clustering by dish and by task kind.
//
// Times are tracked in "lead" units — seconds before serve. serve = 0;
// a larger lead is earlier. The final ScheduledTask offsets are forward
// from the schedule's start.

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

export interface Schedule {
  tasks: ScheduledTask[];
  /** Earliest task start → serve, in seconds. */
  totalDuration: number;
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

function hasCycle(recipe: Recipe): boolean {
  const byId = new Map(recipe.tasks.map((t) => [t.id, t]));
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done

  function visit(id: string): boolean {
    const s = state.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    const task = byId.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        if (byId.has(dep) && visit(dep)) return true;
      }
    }
    state.set(id, 2);
    return false;
  }

  return recipe.tasks.some((t) => visit(t.id));
}

interface Node {
  globalId: string;
  recipeId: string;
  recipeTitle: string;
  task: RecipeTask;
  duration: number;
  ingredients: ScheduledIngredient[];
  /** Global ids of tasks that depend on this one. */
  successors: string[];
  /** Global ids this task depends on. */
  predecessors: string[];
  pendingSuccessors: number;
  scheduled: boolean;
  /** Lead (s before serve) at which the task ends / starts. */
  endLead: number;
  startLead: number;
}

interface LeadInterval {
  lo: number; // endLead — later in wall time
  hi: number; // startLead — earlier in wall time
}

/** Latest cook slot (smallest lead = closest to serve) of `duration` that
 *  ends no sooner than `minEndLead` and clashes with no booked interval. */
function findCookSlot(
  minEndLead: number,
  duration: number,
  booked: LeadInterval[],
): number {
  let endLead = minEndLead;
  for (;;) {
    const startLead = endLead + duration;
    const clash = booked.find((iv) => iv.lo < startLead && iv.hi > endLead);
    if (!clash) return endLead;
    endLead = clash.hi; // shift earlier in wall time, past the clash
  }
}

export function buildSchedule(
  plan: MealPlan,
  recipesById: Map<string, Recipe>,
  profile: Profile,
): Schedule {
  const nodes = new Map<string, Node>();
  const cyclicRecipeIds: string[] = [];

  const globalId = (recipeId: string, taskId: string) =>
    `${recipeId}::${taskId}`;

  for (const entry of plan.entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) continue;
    if (hasCycle(recipe)) {
      cyclicRecipeIds.push(recipe.id);
      continue;
    }

    const ingredientById = new Map(recipe.ingredients.map((i) => [i.id, i]));
    const servingFactor =
      recipe.servings > 0 ? entry.servings / recipe.servings : 1;
    const localIds = new Set(recipe.tasks.map((t) => t.id));

    for (const task of recipe.tasks) {
      nodes.set(globalId(recipe.id, task.id), {
        globalId: globalId(recipe.id, task.id),
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        task,
        duration: scaledDuration(task, profile),
        ingredients: task.ingredientIds
          .map((id) => ingredientById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => ({
            label: i.label,
            quantity: i.quantity * servingFactor,
            unit: i.unit,
          })),
        predecessors: task.dependsOn
          .filter((d) => localIds.has(d))
          .map((d) => globalId(recipe.id, d)),
        successors: [],
        pendingSuccessors: 0,
        scheduled: false,
        endLead: 0,
        startLead: 0,
      });
    }
  }

  // Wire successors from predecessors.
  for (const node of nodes.values()) {
    for (const predId of node.predecessors) {
      nodes.get(predId)?.successors.push(node.globalId);
    }
  }
  for (const node of nodes.values()) {
    node.pendingSuccessors = node.successors.length;
  }

  // Backward list scheduling.
  const booked: LeadInterval[] = [];
  const ready: Node[] = [];
  for (const node of nodes.values()) {
    if (node.pendingSuccessors === 0) ready.push(node);
  }

  let lastRecipeId: string | null = null;
  let lastKind: TaskKind | null = null;

  while (ready.length > 0) {
    // Most serve-critical first (smallest required lead), then cluster by the
    // dish and the kind of task we just did, then longer tasks first.
    ready.sort((a, b) => {
      const la = requiredEndLead(a, nodes);
      const lb = requiredEndLead(b, nodes);
      if (la !== lb) return la - lb;
      const sameDishA = a.recipeId === lastRecipeId ? 0 : 1;
      const sameDishB = b.recipeId === lastRecipeId ? 0 : 1;
      if (sameDishA !== sameDishB) return sameDishA - sameDishB;
      const sameKindA = a.task.kind === lastKind ? 0 : 1;
      const sameKindB = b.task.kind === lastKind ? 0 : 1;
      if (sameKindA !== sameKindB) return sameKindA - sameKindB;
      return b.duration - a.duration;
    });

    const node = ready.shift()!;
    const minEndLead = requiredEndLead(node, nodes);

    if (occupiesCook(node.task.kind)) {
      node.endLead = findCookSlot(minEndLead, node.duration, booked);
    } else {
      node.endLead = minEndLead; // passive / rest — as late as possible
    }
    node.startLead = node.endLead + node.duration;
    node.scheduled = true;
    if (occupiesCook(node.task.kind)) {
      booked.push({ lo: node.endLead, hi: node.startLead });
    }
    lastRecipeId = node.recipeId;
    lastKind = node.task.kind;

    for (const predId of node.predecessors) {
      const pred = nodes.get(predId);
      if (!pred) continue;
      pred.pendingSuccessors -= 1;
      if (pred.pendingSuccessors === 0) ready.push(pred);
    }
  }

  let totalDuration = 0;
  for (const node of nodes.values()) {
    if (node.startLead > totalDuration) totalDuration = node.startLead;
  }

  const tasks: ScheduledTask[] = [];
  for (const node of nodes.values()) {
    if (!node.scheduled) continue; // unreachable in an acyclic graph
    tasks.push({
      recipeId: node.recipeId,
      recipeTitle: node.recipeTitle,
      taskId: node.task.id,
      label: node.task.label,
      kind: node.task.kind,
      startOffset: totalDuration - node.startLead,
      duration: node.duration,
      dependsOn: node.task.dependsOn,
      ingredients: node.ingredients,
      ...(node.task.group ? { group: node.task.group } : {}),
    });
  }

  return { tasks, totalDuration, cyclicRecipeIds };
}

/** A task must end before every dependent starts; 0 (serve) if terminal. */
function requiredEndLead(node: Node, nodes: Map<string, Node>): number {
  let lead = 0;
  for (const succId of node.successors) {
    const succ = nodes.get(succId);
    if (succ && succ.scheduled && succ.startLead > lead) {
      lead = succ.startLead;
    }
  }
  return lead;
}
