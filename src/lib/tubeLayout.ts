import type { Schedule, ScheduledTask } from './scheduler';

// Pure layout helpers for the tube map — no React. Two jobs:
//  1. Lay tasks of a recipe onto sub-lanes so parallel branches don't overlap,
//     and mark which stations are phase changes (big interchange) vs sub-steps.
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

    // Greedy sub-lane assignment: a task takes the first sub-lane free at its
    // start time, otherwise opens a new one.
    const subLaneEnd: number[] = [];
    const subLaneOf = new Map<string, number>();
    for (const task of sorted) {
      let i = subLaneEnd.findIndex((end) => end <= task.startOffset + 1);
      if (i === -1) {
        i = subLaneEnd.length;
        subLaneEnd.push(0);
      }
      subLaneEnd[i] = task.startOffset + task.duration;
      subLaneOf.set(task.taskId, i);
    }

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
      subLane: subLaneOf.get(task.taskId) ?? 0,
      major: !task.group || groupFirst.get(task.group) === task.taskId,
    }));

    return {
      recipeId: lane.recipeId,
      title: lane.title,
      laneIndex,
      tasks,
      byTaskId: new Map(tasks.map((t) => [t.taskId, t])),
      subLaneCount: Math.max(1, subLaneEnd.length),
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
  const cornerRun = 14; // straight run each side, so corners can round
  const mid = (mainA + mainB) / 2;
  const halfSpan = diag / 2 + cornerRun;
  const s = Math.max(minMain, mid - halfSpan);
  const e = Math.min(maxMain, mid + halfSpan);
  if (e - s < 4) {
    return [
      { main: mainA, cross: crossA },
      { main: mainB, cross: crossB },
    ];
  }
  const available = e - s;
  const diagLen = Math.min(diag, Math.max(2, available - 8));
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
