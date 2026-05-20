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
 * Minimum main-axis span between two stations for a 45° cross-lane connector
 * to draw cleanly. Five segments make a turn: straight → arc → 45° → arc →
 * straight. With placement='destination' the leading straight needs to be
 * AT LEAST `cornerTangent` long beyond the arc, otherwise the arc consumes
 * the whole leadIn segment and the curve starts immediately at the source
 * with no visible vertical before it — reads as a sharp corner. So the
 * minimum is `3 * cornerTangent + crossDelta` (one tangent for the visible
 * leading straight, two for the two arcs), with the trailing arc landing
 * right at the destination station (which serves as its visual end-cap).
 * The layout pre-pass enforces this by stretching the time-warp when a
 * tight chain would otherwise hide the bend.
 */
export function connectorMainSpan(
  crossDelta: number,
  cornerTangent: number,
): number {
  return 3 * cornerTangent + Math.abs(crossDelta);
}

/**
 * 4-point polyline for a 45° cross-lane connector from (mainA, crossA) to
 * (mainB, crossB). The diagonal is locked at 45° always — its main-extent
 * equals its cross-delta. `placement` decides where the diagonal sits when
 * there's slack:
 *  - `'destination'` (default): bend right before the destination. The line
 *    stays on the source column for the gap, then bends into the target
 *    column at the end. Reads as "the dish waits on its prep track until
 *    the next step needs it" — the natural cooking flow.
 *  - `'source'`: bend right after the source. The line runs parallel to
 *    the destination column for the rest of the gap. Use this when the
 *    visual emphasis is on divergence (e.g. the destination half of a
 *    journey hop where the line leaves the interchange).
 *
 * The corners P1 and P2 are spaced `cornerTangent` away from the straight
 * segment's tangent point so `roundedPath` can round them without clamping.
 * The layout pre-pass should ensure mainDelta ≥ `connectorMainSpan`. The
 * fallback splits any sub-threshold slack symmetrically when crossDelta
 * still fits, or collapses to a straight diagonal if it doesn't — never
 * a backward-running segment.
 */
export function connectorPoints(
  mainA: number,
  crossA: number,
  mainB: number,
  crossB: number,
  cornerTangent: number,
  placement: 'source' | 'destination' = 'destination',
): { main: number; cross: number }[] {
  const crossDelta = Math.abs(crossB - crossA);
  if (crossDelta < 0.5) {
    return [
      { main: mainA, cross: crossA },
      { main: mainB, cross: crossB },
    ];
  }
  const mainDelta = mainB - mainA;
  const required = connectorMainSpan(crossDelta, cornerTangent);
  let leadIn: number;
  if (mainDelta >= required) {
    leadIn =
      placement === 'destination'
        ? mainDelta - cornerTangent - crossDelta
        : cornerTangent;
  } else if (mainDelta >= crossDelta) {
    // No room for full cornerTangent on both sides — share what's left.
    // Corners will round on shorter tangents; visibly tighter but not
    // overshooting or backward-running.
    leadIn = (mainDelta - crossDelta) / 2;
  } else {
    // Can't fit a 45° turn at all. Draw straight from source to target —
    // not 45°, but at least monotonic. The layout pre-pass shouldn't allow
    // this case; if it shows up, it's a signal the constraint was missed.
    return [
      { main: mainA, cross: crossA },
      { main: mainB, cross: crossB },
    ];
  }
  return [
    { main: mainA, cross: crossA },
    { main: mainA + leadIn, cross: crossA },
    { main: mainA + leadIn + crossDelta, cross: crossB },
    { main: mainB, cross: crossB },
  ];
}

function pointAlong(from: Pt, to: Pt, dist: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dist, len) / len;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * SVG path through points with corners rounded by `radius`. The tangent
 * length consumed at each corner is `radius` on each adjacent segment,
 * capped by:
 *  - the full segment length for end segments (only one corner uses them),
 *  - half the segment length for interior segments shared between two
 *    corners (each takes its half).
 * This avoids the previous quirk where end segments were over-clamped to
 * len/2, producing visibly cramped lead-in and trailing arcs.
 */
export function roundedPath(points: Pt[], radius: number): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  const n = points.length;
  const segLen = (i: number) =>
    Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < n - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const backShared = i - 1 > 0;
    const fwdShared = i + 1 < n - 1;
    const backCap = backShared ? segLen(i - 1) / 2 : segLen(i - 1);
    const fwdCap = fwdShared ? segLen(i) / 2 : segLen(i);
    const a = pointAlong(curr, prev, Math.min(radius, backCap));
    const b = pointAlong(curr, next, Math.min(radius, fwdCap));
    d += ` L ${a.x} ${a.y} Q ${curr.x} ${curr.y} ${b.x} ${b.y}`;
  }
  const last = points[n - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
