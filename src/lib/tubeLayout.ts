import type { Schedule, ScheduledTask } from './scheduler';

// Pure layout helpers for the tube map — no React. Two jobs:
//  1. Lay tasks of a recipe onto sub-lanes that follow the recipe's BRANCH
//     structure (a dependency chain stays on one track; a fork opens a new
//     one), and mark phase-change stations vs sub-steps.
//  2. Geometry for track connectors: a branch leaves the line as a 45° spur
//     with rounded corners, the way a tube line splits.

export interface SubLanedTask extends ScheduledTask {
  endOffset: number;
  subLane: number;
  /** True = phase change (big interchange station); false = sub-step. */
  major: boolean;
}

export interface LaneLayout {
  recipeId: string;
  title: string;
  laneIndex: number;
  tasks: SubLanedTask[];
  byTaskId: Map<string, SubLanedTask>;
  subLaneCount: number;
}

/**
 * Assign each task a sub-lane following the recipe's dependency structure: a
 * task continues one predecessor's lane, so a chain (boil water → cook pasta)
 * always shares a track; a second dependent of the same task forks to a fresh
 * lane. This is structural, not time-based — branches stay visually parallel
 * even when the single-cook schedule means they don't overlap in time.
 */
function structuralSubLanes(tasks: ScheduledTask[]): {
  laneOf: Map<string, number>;
  count: number;
} {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const endOf = (id: string) => {
    const t = byId.get(id);
    return t ? t.startOffset + t.duration : 0;
  };

  // Kahn topological sort (recipes here are acyclic — cyclic ones are dropped
  // by the scheduler), earliest-starting task first for a stable result.
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const t of tasks) {
    indeg.set(t.taskId, 0);
    succ.set(t.taskId, []);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!byId.has(dep)) continue;
      indeg.set(t.taskId, (indeg.get(t.taskId) ?? 0) + 1);
      succ.get(dep)!.push(t.taskId);
    }
  }
  const ready = tasks
    .filter((t) => (indeg.get(t.taskId) ?? 0) === 0)
    .map((t) => t.taskId);
  const topo: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => byId.get(a)!.startOffset - byId.get(b)!.startOffset);
    const id = ready.shift()!;
    topo.push(id);
    for (const s of succ.get(id) ?? []) {
      indeg.set(s, (indeg.get(s) ?? 0) - 1);
      if (indeg.get(s) === 0) ready.push(s);
    }
  }

  const laneOf = new Map<string, number>();
  const continued = new Set<string>(); // deps whose lane a successor already took
  let nextLane = 0;
  for (const id of topo) {
    const task = byId.get(id)!;
    const freeDeps = task.dependsOn.filter(
      (d) => byId.has(d) && !continued.has(d),
    );
    if (freeDeps.length > 0) {
      // Continue the dependency that ends latest — it flows most naturally in.
      freeDeps.sort((a, b) => endOf(b) - endOf(a));
      const chosen = freeDeps[0];
      laneOf.set(id, laneOf.get(chosen)!);
      continued.add(chosen);
    } else {
      laneOf.set(id, nextLane++);
    }
  }
  for (const t of tasks) {
    if (!laneOf.has(t.taskId)) laneOf.set(t.taskId, 0);
  }
  return { laneOf, count: Math.max(1, nextLane) };
}

export function layoutLanes(
  schedule: Schedule,
  lanes: { recipeId: string; title: string }[],
): LaneLayout[] {
  const tasksByRecipe = new Map<string, ScheduledTask[]>();
  for (const lane of lanes) tasksByRecipe.set(lane.recipeId, []);
  for (const task of schedule.tasks) {
    tasksByRecipe.get(task.recipeId)?.push(task);
  }

  return lanes.map((lane, laneIndex) => {
    const raw = tasksByRecipe.get(lane.recipeId) ?? [];
    const sorted = [...raw].sort(
      (a, b) => a.startOffset - b.startOffset || b.duration - a.duration,
    );

    const { laneOf, count } = structuralSubLanes(raw);

    // The first task (by start) in each group is the interchange station.
    const groupFirst = new Map<string, string>();
    for (const task of sorted) {
      if (task.group && !groupFirst.has(task.group)) {
        groupFirst.set(task.group, task.taskId);
      }
    }

    const tasks: SubLanedTask[] = sorted.map((task) => ({
      ...task,
      endOffset: task.startOffset + task.duration,
      subLane: laneOf.get(task.taskId) ?? 0,
      major: !task.group || groupFirst.get(task.group) === task.taskId,
    }));

    return {
      recipeId: lane.recipeId,
      title: lane.title,
      laneIndex,
      tasks,
      byTaskId: new Map(tasks.map((t) => [t.taskId, t])),
      subLaneCount: count,
    };
  });
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Points for a connector from one station to the next, in (main, cross)
 * coordinates — main is the time axis. A change of sub-lane leaves the line
 * as a 45° spur with a short straight run either side for rounded corners.
 *
 * Dependencies are often tight (one task ends exactly as the next starts),
 * so there's no room between the stations for the spur. The connector is
 * therefore centred on the midpoint and allowed to run back into the
 * source segment and forward into the target segment — it's drawn UNDER the
 * track, so the overlap reads as the line forking. `minMain`/`maxMain` bound
 * how far it may borrow (the far ends of the two segments).
 */
export function connectorPoints(
  mainA: number,
  crossA: number,
  mainB: number,
  crossB: number,
  minMain: number,
  maxMain: number,
): { main: number; cross: number }[] {
  if (Math.abs(crossB - crossA) < 0.5) {
    return [
      { main: mainA, cross: crossA },
      { main: mainB, cross: crossB },
    ];
  }
  const diag = Math.abs(crossB - crossA);
  // Keep a straight run each side so the corners always have room to round;
  // when space is tight the diagonal shrinks (shallower than 45°) but the
  // corners stay rounded rather than collapsing to a sharp kink.
  const minStraight = 9;
  const idealStraight = 16;
  const mid = (mainA + mainB) / 2;
  const halfSpan = diag / 2 + idealStraight;
  const s = Math.max(minMain, mid - halfSpan);
  const e = Math.min(maxMain, mid + halfSpan);
  const available = e - s;
  if (available < 2 * minStraight + 6) {
    return [
      { main: mainA, cross: crossA },
      { main: mainB, cross: crossB },
    ];
  }
  const diagLen = Math.min(diag, available - 2 * minStraight);
  const straight = (available - diagLen) / 2;
  return [
    { main: s, cross: crossA },
    { main: s + straight, cross: crossA },
    { main: s + straight + diagLen, cross: crossB },
    { main: e, cross: crossB },
  ];
}

function lerp(from: Pt, to: Pt, dist: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dist, len / 2) / len;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/** SVG path through points with corners rounded by `radius`. */
export function roundedPath(points: Pt[], radius: number): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const a = lerp(curr, prev, radius);
    const b = lerp(curr, next, radius);
    d += ` L ${a.x} ${a.y} Q ${curr.x} ${curr.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
