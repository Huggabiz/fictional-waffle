import { useEffect, useMemo, useRef, useState } from 'react';
import type { Schedule, ScheduledIngredient } from '../lib/scheduler';
import { occupiesCook } from '../lib/scheduler';
import {
  connectorMainSpan,
  connectorPoints,
  layoutLanes,
  roundedPath,
} from '../lib/tubeLayout';
import type { LaneLayout, SubLanedTask } from '../lib/tubeLayout';
import { formatDuration } from '../lib/recipeMetrics';
import type { TaskKind } from '../types';
import './TubeMap.css';

// The kitchen timeline as a vertical tube map. Time runs top → bottom. Each
// dish is a coloured line; each task is a length of track; each instruction
// is a station (big interchange = phase change, small tick = sub-step).
// Beside each station: the phase title (when it changes), the action in
// bold, and the ingredients in light grey. Branches split as 45° spurs.
//
// Three track styles say how much the task needs the cook:
//  - focus   (prep/active) — solid filled track; you're hands-on.
//  - monitor (passive)     — dashed track; a pot on the heat, stay aware.
//  - dormant (rest)        — hollow outlined track; left to its own devices.
const DASH = '9 7';

function trackStyle(kind: TaskKind): 'focus' | 'monitor' | 'dormant' {
  if (kind === 'prep' || kind === 'active') return 'focus';
  if (kind === 'passive') return 'monitor';
  return 'dormant';
}

export const LINE_COLORS = [
  '#d8602f',
  '#2f7fd8',
  '#3fa64f',
  '#b343a8',
  '#c9a227',
  '#1f9e9e',
];

export function lineColor(index: number): string {
  return LINE_COLORS[index % LINE_COLORS.length];
}

// Geometry constants. Two profiles — desktop and compact (≤720px) —
// so the map fits a phone without runaway horizontal scroll. cornerRadius
// stays small enough that the 45° middle segment still reads as a
// distinct straight between the two bends (R=14 with subLaneGap=34 leaves
// ~20px of visible diagonal in the middle, instead of being swallowed by
// the two corner arcs).
const GEO_DESKTOP = {
  pxPerSec: 0.85,
  leftAxis: 52,
  mainStart: 56,
  bottomPad: 52,
  rightPad: 20,
  trackPad: 24,
  subLaneGap: 34,
  instrGutter: 240,
  cornerRadius: 14,
  minEventGap: 30,
};

const GEO_COMPACT: typeof GEO_DESKTOP = {
  ...GEO_DESKTOP,
  leftAxis: 40,
  trackPad: 16,
  subLaneGap: 30,
  instrGutter: 130,
  cornerRadius: 12,
};

interface Lane {
  recipeId: string;
  title: string;
}

// Two ways to read the same schedule:
//  - tracks:  each dish keeps its own column, well apart. The default.
//  - journey: every dish's line bundles into one central group, and where
//             the cook moves from one dish to the next the lines converge
//             at a shared interchange — the cook's path through the meal.
type Mode = 'tracks' | 'journey';

interface RecipeView extends LaneLayout {
  color: string;
  trackLeft: number;
  subLaneX: (subLane: number) => number;
  /** Keyed by `recipeId::taskId` → which column the label sits in. */
  labelSide: Map<string, 'left' | 'right'>;
  leftLabelX: number;
  rightLabelX: number;
}

interface TubeMapProps {
  schedule: Schedule;
  lanes: Lane[];
  /** Wall-clock ms of schedule start, or null if the plan has no serve time. */
  startMs: number | null;
  /** Current time in ms — drives the "you are here" line. */
  nowMs: number;
  /** `recipeId::taskId` to scroll-centre on when it changes. */
  focusTaskId?: string | null;
}

function tickIntervalSec(totalSec: number): number {
  const minutes = totalSec / 60;
  if (minutes <= 20) return 5 * 60;
  if (minutes <= 60) return 10 * 60;
  if (minutes <= 150) return 30 * 60;
  return 60 * 60;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatQty(q: number): string {
  if (q <= 0) return '';
  const r = Math.round(q * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function ingredientsText(ingredients: ScheduledIngredient[]): string {
  return ingredients
    .map((ing) =>
      [formatQty(ing.quantity), ing.unit, ing.label].filter(Boolean).join(' '),
    )
    .join(', ');
}

export function TubeMap({
  schedule,
  lanes,
  startMs,
  nowMs,
  focusTaskId,
}: TubeMapProps) {
  const [mode, setMode] = useState<Mode>('journey');
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 720px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 720px)');
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Container width drives a dynamic label gutter — so on phone, the SVG
  // shrinks its label columns to fit the viewport (labels then wrap onto
  // multiple lines via foreignObject) instead of forcing a horizontal scroll.
  const [containerW, setContainerW] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const view = useMemo(() => {
    const baseG = compact ? GEO_COMPACT : GEO_DESKTOP;
    const isJourney = mode === 'journey';
    const total = Math.max(schedule.totalDuration, 60);
    const laid = layoutLanes(schedule, lanes);

    // Fit-to-width: solve for the label gutter that makes the SVG width
    // equal the container width. Below the minimum, accept a small
    // horizontal scroll — beats labels too narrow to read.
    const minGutter = compact ? 88 : 140;
    let fittedGutter: number;
    if (isJourney) {
      let totalSubLanes = 0;
      for (const lane of laid) totalSubLanes += lane.subLaneCount;
      const fixed =
        baseG.leftAxis +
        2 * baseG.trackPad +
        Math.max(0, totalSubLanes - 1) * baseG.subLaneGap +
        baseG.rightPad;
      fittedGutter = (containerW - fixed) / 2;
    } else {
      const numBands = Math.max(1, laid.length);
      const subLaneTotal = laid.reduce(
        (s, lane) => s + Math.max(0, lane.subLaneCount - 1) * baseG.subLaneGap,
        0,
      );
      const fixed =
        baseG.leftAxis +
        numBands * 2 * baseG.trackPad +
        subLaneTotal +
        baseG.rightPad;
      fittedGutter = (containerW - fixed) / (2 * numBands);
    }
    const gutter = Math.max(minGutter, Math.min(baseG.instrGutter, fittedGutter));
    const g = { ...baseG, instrGutter: gutter };

    // --- Pass 1: cross-axis layout. Each recipe's lane positions don't
    // depend on the time-warp, so they're computed first — the per-connector
    // spacing pass (Pass 2) needs cross-deltas in pixels.
    interface LanePos {
      lane: LaneLayout;
      color: string;
      trackLeft: number;
      subLaneX: (subLane: number) => number;
      leftLabelX: number;
      rightLabelX: number;
    }
    let lanePositions: LanePos[];
    let width: number;
    if (isJourney) {
      const trackBase = g.leftAxis + g.instrGutter + g.trackPad;
      let laneCursor = 0;
      const blockStart = laid.map((lane) => {
        const start = laneCursor;
        laneCursor += lane.subLaneCount;
        return start;
      });
      const trackRight =
        trackBase + Math.max(0, laneCursor - 1) * g.subLaneGap;
      const leftLabelX = g.leftAxis + g.instrGutter - 14;
      const rightLabelX = trackRight + 24;
      lanePositions = laid.map((lane, ri) => {
        const start = blockStart[ri];
        const subLaneX = (subLane: number) =>
          trackBase + (start + subLane) * g.subLaneGap;
        return {
          lane,
          color: lineColor(lane.laneIndex),
          trackLeft: subLaneX(0),
          subLaneX,
          leftLabelX,
          rightLabelX,
        };
      });
      width = trackRight + g.trackPad + g.instrGutter + g.rightPad;
    } else {
      let bandLeft = g.leftAxis;
      lanePositions = laid.map((lane) => {
        const trackLeft = bandLeft + g.instrGutter + g.trackPad;
        const subLaneX = (subLane: number) =>
          trackLeft + subLane * g.subLaneGap;
        const trackRight = subLaneX(lane.subLaneCount - 1);
        const out: LanePos = {
          lane,
          color: lineColor(lane.laneIndex),
          trackLeft,
          subLaneX,
          leftLabelX: bandLeft + g.instrGutter - 14,
          rightLabelX: trackRight + 24,
        };
        bandLeft +=
          g.instrGutter +
          g.trackPad +
          (lane.subLaneCount - 1) * g.subLaneGap +
          g.trackPad +
          g.instrGutter;
        return out;
      });
      width = bandLeft + g.rightPad;
    }

    // --- Pass 2: time-warp with per-station events. Each task contributes
    // a start and an end event keyed by `recipeId::taskId::kind`, so two
    // stations at the same real time can sit at different drawn-ys when
    // geometry demands it (e.g. a fork where the parent ends and a
    // cross-lane child starts at the same instant — the child gets pushed
    // down by the connector's required main span).
    //
    // 1. Build event list: real-time anchors (0, total) plus a start+end
    //    event per task. Sort by sec, with 'end' before 'start' at the
    //    same sec so a chain reads parent-end → child-start.
    // 2. Lay them out left-to-right with `minEventGap` minimum drawn gap.
    // 3. Walk every cross-lane connector; if drawn(child-start) -
    //    drawn(parent-end) < 2R + crossDelta, push all later events by the
    //    deficit. Process in source-event order so a push never violates an
    //    upstream constraint (it only adds room downstream).
    type EvKind = 'anchor' | 'start' | 'end';
    interface Ev {
      sec: number;
      kind: EvKind;
      key?: string;
    }
    const events: Ev[] = [
      { sec: 0, kind: 'anchor' },
      { sec: total, kind: 'anchor' },
    ];
    for (const lp of lanePositions) {
      for (const t of lp.lane.tasks) {
        const key = `${lp.lane.recipeId}::${t.taskId}`;
        events.push({ sec: t.startOffset, kind: 'start', key });
        events.push({ sec: t.endOffset, kind: 'end', key });
      }
    }
    const rank = (k: EvKind) => (k === 'end' ? 0 : k === 'anchor' ? 1 : 2);
    events.sort((a, b) =>
      a.sec !== b.sec ? a.sec - b.sec : rank(a.kind) - rank(b.kind),
    );
    const drawnYs: number[] = new Array(events.length);
    drawnYs[0] = 0;
    for (let i = 1; i < events.length; i++) {
      const realGap = events[i].sec - events[i - 1].sec;
      drawnYs[i] = drawnYs[i - 1] + Math.max(realGap * g.pxPerSec, g.minEventGap);
    }
    const startIdx = new Map<string, number>();
    const endIdx = new Map<string, number>();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.kind === 'start') startIdx.set(e.key!, i);
      else if (e.kind === 'end') endIdx.set(e.key!, i);
    }

    // Cross-lane connectors carry a spacing constraint. Collect them all,
    // sort by source-event order, then apply with cascading pushes.
    const constraints: { fromIdx: number; toIdx: number; minPx: number }[] = [];
    for (const lp of lanePositions) {
      for (const t of lp.lane.tasks) {
        for (const depId of t.dependsOn) {
          const dep = lp.lane.byTaskId.get(depId);
          if (!dep || dep.subLane === t.subLane) continue;
          const cross = Math.abs(
            lp.subLaneX(t.subLane) - lp.subLaneX(dep.subLane),
          );
          const fromIdx = endIdx.get(`${lp.lane.recipeId}::${depId}`);
          const toIdx = startIdx.get(`${lp.lane.recipeId}::${t.taskId}`);
          if (fromIdx === undefined || toIdx === undefined) continue;
          constraints.push({
            fromIdx,
            toIdx,
            minPx: connectorMainSpan(cross, g.cornerRadius),
          });
        }
      }
    }
    // Journey hops are two connectors joined at an interchange — each half
    // needs its own bend pair, so the pair as a whole needs twice the
    // single-connector budget. Without this the hop's diagonals would cram
    // and lines would zigzag back and forth across the interchange.
    if (isJourney) {
      const handsOnPre: { taskKey: string; recipeId: string; subLane: number; sec: number }[] = [];
      for (const lp of lanePositions) {
        for (const t of lp.lane.tasks) {
          if (!occupiesCook(t.kind)) continue;
          handsOnPre.push({
            taskKey: `${lp.lane.recipeId}::${t.taskId}`,
            recipeId: lp.lane.recipeId,
            subLane: t.subLane,
            sec: t.startOffset,
          });
        }
      }
      handsOnPre.sort((a, b) => a.sec - b.sec);
      const subLaneXOf = new Map(
        lanePositions.map((lp) => [lp.lane.recipeId, lp.subLaneX]),
      );
      for (let i = 0; i < handsOnPre.length - 1; i++) {
        const a = handsOnPre[i];
        const b = handsOnPre[i + 1];
        if (a.recipeId === b.recipeId) continue;
        const ax = subLaneXOf.get(a.recipeId)!(a.subLane);
        const bx = subLaneXOf.get(b.recipeId)!(b.subLane);
        const cross = Math.abs(ax - bx);
        const fromIdx = endIdx.get(a.taskKey);
        const toIdx = startIdx.get(b.taskKey);
        if (fromIdx === undefined || toIdx === undefined) continue;
        // One bend pair: the connector goes straight from a's end into
        // b's first station (which serves as the transfer point), so the
        // same budget as any cross-lane connector.
        constraints.push({
          fromIdx,
          toIdx,
          minPx: connectorMainSpan(cross, g.cornerRadius),
        });
      }
    }
    constraints.sort((a, b) => a.fromIdx - b.fromIdx || a.toIdx - b.toIdx);
    for (const c of constraints) {
      const have = drawnYs[c.toIdx] - drawnYs[c.fromIdx];
      if (have < c.minPx) {
        const deficit = c.minPx - have;
        for (let i = c.toIdx; i < drawnYs.length; i++) drawnYs[i] += deficit;
      }
    }

    // --- Pass 3: derive per-task drawn ys and a sec→y axis for ticks.
    const taskStartY = new Map<string, number>();
    const taskEndY = new Map<string, number>();
    for (const [key, i] of startIdx) taskStartY.set(key, g.mainStart + drawnYs[i]);
    for (const [key, i] of endIdx) taskEndY.set(key, g.mainStart + drawnYs[i]);
    const startOf = (recipeId: string, taskId: string) =>
      taskStartY.get(`${recipeId}::${taskId}`) ?? g.mainStart;
    const endOf = (recipeId: string, taskId: string) =>
      taskEndY.get(`${recipeId}::${taskId}`) ?? g.mainStart;

    // For the time axis: collapse to one y per sec (the earliest, i.e. the
    // 'end' or 'anchor' if present). Two stations sharing a sec still draw
    // at separate ys via taskStartY/EndY; ticks just pick the top.
    const secToY = new Map<number, number>();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!secToY.has(e.sec)) secToY.set(e.sec, g.mainStart + drawnYs[i]);
    }
    const sortedSecs = [...secToY.keys()].sort((a, b) => a - b);
    const mainOf = (sec: number) => {
      const clamped = Math.max(0, Math.min(total, sec));
      let lo = sortedSecs[0];
      let hi = sortedSecs[sortedSecs.length - 1];
      for (let i = 1; i < sortedSecs.length; i++) {
        if (sortedSecs[i] >= clamped) {
          lo = sortedSecs[i - 1];
          hi = sortedSecs[i];
          break;
        }
      }
      const loY = secToY.get(lo)!;
      const hiY = secToY.get(hi)!;
      const frac = hi > lo ? (clamped - lo) / (hi - lo) : 0;
      return loY + frac * (hiY - loY);
    };

    // --- Pass 4: label sides. Uses station ys AND wrap-aware label
    // height estimates so labels in narrow gutters (where they wrap to
    // multiple visual lines) don't get stacked too tightly.
    const labelW = Math.max(0, g.instrGutter - 26);
    const charsPerLine = Math.max(8, Math.floor(labelW / 6.5));
    const lineH = 15.6;
    const visualLines = (text: string) =>
      Math.max(1, Math.ceil(text.length / charsPerLine));
    const labelHeight = (task: SubLanedTask): number => {
      let lines = 0;
      if (task.major && task.group) lines += visualLines(task.group);
      lines += visualLines(task.label);
      const food = ingredientsText(task.ingredients);
      if (food) lines += visualLines(food);
      return Math.max(lineH, lines * lineH);
    };
    const assignSides = (
      entries: { recipeId: string; task: SubLanedTask }[],
    ): Map<string, 'left' | 'right'> => {
      const side = new Map<string, 'left' | 'right'>();
      let rightBottom = -Infinity;
      let leftBottom = -Infinity;
      for (const { recipeId, task } of [...entries].sort(
        (a, b) => a.task.startOffset - b.task.startOffset,
      )) {
        const half = labelHeight(task) / 2;
        const y = startOf(recipeId, task.taskId);
        let chosen: 'left' | 'right';
        if (y - half >= rightBottom) chosen = 'right';
        else if (y - half >= leftBottom) chosen = 'left';
        else chosen = rightBottom <= leftBottom ? 'right' : 'left';
        if (chosen === 'right') rightBottom = y + half + 6;
        else leftBottom = y + half + 6;
        side.set(`${recipeId}::${task.taskId}`, chosen);
      }
      return side;
    };

    let recipes: RecipeView[];
    if (isJourney) {
      const labelSide = assignSides(
        lanePositions.flatMap((lp) =>
          lp.lane.tasks.map((task) => ({ recipeId: lp.lane.recipeId, task })),
        ),
      );
      recipes = lanePositions.map((lp) => ({
        ...lp.lane,
        color: lp.color,
        trackLeft: lp.trackLeft,
        subLaneX: lp.subLaneX,
        labelSide,
        leftLabelX: lp.leftLabelX,
        rightLabelX: lp.rightLabelX,
      }));
    } else {
      recipes = lanePositions.map((lp) => ({
        ...lp.lane,
        color: lp.color,
        trackLeft: lp.trackLeft,
        subLaneX: lp.subLaneX,
        labelSide: assignSides(
          lp.lane.tasks.map((task) => ({ recipeId: lp.lane.recipeId, task })),
        ),
        leftLabelX: lp.leftLabelX,
        rightLabelX: lp.rightLabelX,
      }));
    }

    // Label-clearance pass. With labels wrapping in narrow gutters they
    // can take 60–100px of vertical room each — well past the height
    // assignSides could pack two on the same side at the schedule's
    // natural pace. Push events apart per-side when consecutive labels
    // would overlap. Time bends but no instruction sits on another.
    {
      type Item = { idx: number; y: number; h: number };
      const bySide: Record<'left' | 'right', Item[]> = { left: [], right: [] };
      for (const r of recipes) {
        for (const t of r.tasks) {
          const key = `${r.recipeId}::${t.taskId}`;
          const side = r.labelSide.get(key);
          const i = startIdx.get(key);
          if (!side || i === undefined) continue;
          bySide[side].push({ idx: i, y: drawnYs[i], h: labelHeight(t) });
        }
      }
      const labelConstraints: { fromIdx: number; toIdx: number; minPx: number }[] = [];
      for (const side of ['left', 'right'] as const) {
        const items = bySide[side].sort((a, b) => a.y - b.y);
        for (let k = 0; k < items.length - 1; k++) {
          const a = items[k];
          const b = items[k + 1];
          labelConstraints.push({
            fromIdx: a.idx,
            toIdx: b.idx,
            minPx: (a.h + b.h) / 2 + 6,
          });
        }
      }
      labelConstraints.sort((a, b) => a.fromIdx - b.fromIdx || a.toIdx - b.toIdx);
      for (const c of labelConstraints) {
        const have = drawnYs[c.toIdx] - drawnYs[c.fromIdx];
        if (have < c.minPx) {
          const deficit = c.minPx - have;
          for (let i = c.toIdx; i < drawnYs.length; i++) drawnYs[i] += deficit;
        }
      }
      // Re-derive per-station ys and the time axis after the push.
      for (const [k, i] of startIdx)
        taskStartY.set(k, g.mainStart + drawnYs[i]);
      for (const [k, i] of endIdx)
        taskEndY.set(k, g.mainStart + drawnYs[i]);
      secToY.clear();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (!secToY.has(e.sec)) secToY.set(e.sec, g.mainStart + drawnYs[i]);
      }
    }

    const lastDrawn = drawnYs[drawnYs.length - 1];
    const height = g.mainStart + lastDrawn + g.bottomPad;

    const step = tickIntervalSec(total);
    const ticks: { y: number; label: string }[] = [];
    for (let o = 0; o < total - step * 0.4; o += step) {
      ticks.push({
        y: mainOf(o),
        label: startMs
          ? formatClock(startMs + o * 1000)
          : o === 0
            ? 'start'
            : `+${Math.round(o / 60)}m`,
      });
    }

    const serveY = mainOf(total);
    const nowOffset = startMs !== null ? (nowMs - startMs) / 1000 : null;
    // The now-line should crawl forward as time passes — including in
    // manual mode, where effectiveNow rides the clock until the step's
    // duration runs out, then sits at the end waiting for Next. When a
    // task is in focus, interpolate within ITS drawn segment (startY →
    // endY) so the line slides along the active step's track instead of
    // jumping to the wrong y (the per-station layout means mainOf(sec)
    // doesn't always line up with where the station was actually drawn).
    let nowY: number | null = null;
    if (nowOffset !== null && nowOffset >= 0 && nowOffset <= total) {
      nowY = mainOf(nowOffset);
      if (focusTaskId) {
        const focusTask = schedule.tasks.find(
          (t) => `${t.recipeId}::${t.taskId}` === focusTaskId,
        );
        const sY = taskStartY.get(focusTaskId);
        const eY = taskEndY.get(focusTaskId);
        if (focusTask && sY !== undefined && eY !== undefined && focusTask.duration > 0) {
          const frac = Math.max(
            0,
            Math.min(1, (nowOffset - focusTask.startOffset) / focusTask.duration),
          );
          nowY = sY + frac * (eY - sY);
        }
      }
    }

    // Journey: where the cook moves from one dish to another, a single
    // continuous connector runs from the last hands-on task on dish A
    // directly into dish B's next station — that station IS the transfer
    // point. One roundedPath (not two) so the bend leaving A is properly
    // curved; the previous split-at-corner approach left that corner
    // sharp because two strokes met at a point with no quadratic between
    // them. Handover is shown via a linear gradient from A's colour to
    // B's along the path's straight-line direction.
    interface Hop {
      d: string;
      colorA: string;
      colorB: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
    const hops: Hop[] = [];
    if (isJourney) {
      const handsOn: { task: SubLanedTask; recipe: RecipeView }[] = [];
      for (const r of recipes) {
        for (const t of r.tasks) {
          if (occupiesCook(t.kind)) handsOn.push({ task: t, recipe: r });
        }
      }
      handsOn.sort((a, b) => a.task.startOffset - b.task.startOffset);
      for (let i = 0; i < handsOn.length - 1; i++) {
        const a = handsOn[i];
        const b = handsOn[i + 1];
        if (a.recipe.recipeId === b.recipe.recipeId) continue;
        const ax = a.recipe.subLaneX(a.task.subLane);
        const ay = endOf(a.recipe.recipeId, a.task.taskId);
        const bx = b.recipe.subLaneX(b.task.subLane);
        const by = startOf(b.recipe.recipeId, b.task.taskId);
        const pts = connectorPoints(ay, ax, by, bx, g.cornerRadius);
        const d = roundedPath(
          pts.map((p) => ({ x: p.cross, y: p.main })),
          g.cornerRadius,
        );
        hops.push({
          d,
          colorA: a.recipe.color,
          colorB: b.recipe.color,
          x1: ax,
          y1: ay,
          x2: bx,
          y2: by,
        });
      }
    }

    // stationPos drives auto-centring on focus changes. centerX is the
    // midpoint of the WHOLE row (illustration on one side ↔ station ↔
    // label on the other) — so a Next press brings the marker, the
    // instruction text, and the ingredient art all into view together.
    // Illustration geometry — bigger now (the previous placeholder read as
    // a tiny note) and explicitly placed OUTSIDE the track bundle so it
    // never sits on top of a track. In journey mode the bundle is shared
    // across recipes; in tracks mode each recipe has its own.
    const illR = compact ? 17 : 22;
    const illBuffer = 14; // gap between bundle edge and illustration edge
    const labelMaxW = Math.max(0, g.instrGutter - 26);
    const journeyBundle = isJourney && lanePositions.length > 0
      ? {
          left: lanePositions[0].subLaneX(0),
          right:
            lanePositions[lanePositions.length - 1].subLaneX(
              lanePositions[lanePositions.length - 1].lane.subLaneCount - 1,
            ),
        }
      : null;
    const bundleBoundsFor = (recipeId: string) => {
      if (journeyBundle) return journeyBundle;
      const lp = lanePositions.find((p) => p.lane.recipeId === recipeId);
      if (!lp) return { left: 0, right: 0 };
      return {
        left: lp.subLaneX(0),
        right: lp.subLaneX(lp.lane.subLaneCount - 1),
      };
    };
    const illXFor = (recipeId: string, onLeft: boolean) => {
      const b = bundleBoundsFor(recipeId);
      // Opposite side of label: label on left → illustration on the right
      // of the bundle, and vice versa.
      return onLeft ? b.right + illBuffer + illR : b.left - illBuffer - illR;
    };
    const stationPos = new Map<
      string,
      { x: number; y: number; centerX: number }
    >();
    for (const r of recipes) {
      for (const t of r.tasks) {
        const sx = r.subLaneX(t.subLane);
        const onLeft =
          r.labelSide.get(`${r.recipeId}::${t.taskId}`) === 'left';
        const labelX = onLeft ? r.leftLabelX : r.rightLabelX;
        const labelFar = onLeft ? labelX - labelMaxW : labelX + labelMaxW;
        const hasIll = t.ingredients.length > 0;
        const illCx = illXFor(r.recipeId, onLeft);
        const illFar = hasIll
          ? onLeft
            ? illCx + illR
            : illCx - illR
          : sx;
        stationPos.set(`${r.recipeId}::${t.taskId}`, {
          x: sx,
          y: startOf(r.recipeId, t.taskId),
          centerX: (illFar + labelFar) / 2,
        });
      }
    }

    return {
      g,
      isJourney,
      recipes,
      width,
      height,
      ticks,
      serveY,
      nowY,
      mainOf,
      startOf,
      endOf,
      stationPos,
      hops,
      illR,
      illXFor,
    };
  }, [schedule, lanes, startMs, nowMs, mode, focusTaskId, compact, containerW]);

  // Re-centre the canvas on the focused task whenever it changes (a Next
  // press, or an auto-advance) — not on every now-tick, so the cook can
  // still pan around freely between advances.
  useEffect(() => {
    if (!focusTaskId) return;
    const pos = view.stationPos.get(focusTaskId);
    const el = scrollRef.current;
    if (!pos || !el) return;
    el.scrollTo({
      left: pos.centerX - el.clientWidth / 2,
      top: pos.y - el.clientHeight / 2,
      behavior: 'smooth',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId]);

  const { g, recipes, width, height } = view;
  const axisRight = width - g.rightPad;

  return (
    <div className="tube">
      <div className="tube__head">
        <div className="tube__legend">
        {recipes.map((r) => (
          <span key={r.recipeId} className="tube__legend-item">
            <span className="tube__legend-line" style={{ background: r.color }} />
            {r.title}
          </span>
        ))}
        <span className="tube__legend-item tube__legend-item--note">
          <span className="tube__legend-line tube__legend-line--focus" />
          Focus
        </span>
        <span className="tube__legend-item tube__legend-item--note">
          <span className="tube__legend-line tube__legend-line--monitor" />
          Monitor
        </span>
        <span className="tube__legend-item tube__legend-item--note">
          <span className="tube__legend-line tube__legend-line--dormant" />
          Dormant
        </span>
        </div>
        <div
          className="tube__modes"
          role="radiogroup"
          aria-label="Timeline view"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'tracks'}
            className={
              mode === 'tracks' ? 'tube__mode tube__mode--on' : 'tube__mode'
            }
            onClick={() => setMode('tracks')}
          >
            Tracks
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'journey'}
            className={
              mode === 'journey' ? 'tube__mode tube__mode--on' : 'tube__mode'
            }
            onClick={() => setMode('journey')}
          >
            Journey
          </button>
        </div>
      </div>

      <div className="tube__scroll" ref={scrollRef}>
        <svg
          className="tube__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Cooking timeline as a vertical tube map"
        >
          {/* Time axis */}
          {view.ticks.map((tick, i) => (
            <g key={`tick-${i}`}>
              <line
                className="tube__tick"
                x1={g.leftAxis - 8}
                y1={tick.y}
                x2={axisRight}
                y2={tick.y}
              />
              <text className="tube__tick-label" x={10} y={tick.y} dominantBaseline="middle">
                {tick.label}
              </text>
            </g>
          ))}

          {/* Serve marker */}
          <line
            className="tube__serve"
            x1={g.leftAxis - 8}
            y1={view.serveY}
            x2={axisRight}
            y2={view.serveY}
          />
          <text
            className="tube__serve-label"
            x={10}
            y={view.serveY + 12}
            dominantBaseline="middle"
          >
            Serve
          </text>

          {/* Recipe titles — only in Tracks; the Journey bundle shares one
              central group, so the legend carries the colour key instead. */}
          {!view.isJourney &&
            recipes.map((r) => (
            <text
              key={`title-${r.recipeId}`}
              className="tube__recipe-title"
              x={r.trackLeft}
              y={g.mainStart - 26}
              fill={r.color}
            >
              {r.title}
            </text>
          ))}

          {/* Layer 1: track segments + connectors per recipe. Stations
              come later so they never sit under a track or a hop. */}
          {recipes.map((recipe) => {
            const startY = (taskId: string) => view.startOf(recipe.recipeId, taskId);
            const endY = (taskId: string) => view.endOf(recipe.recipeId, taskId);
            return (
              <g key={`tracks-${recipe.recipeId}`}>
                {/* Track segments */}
                {recipe.tasks.map((task) => {
                  const x = recipe.subLaneX(task.subLane);
                  const y1 = startY(task.taskId);
                  const y2 = endY(task.taskId);
                  const style = trackStyle(task.kind);
                  const title = (
                    <title>
                      {task.label} · {task.kind} ·{' '}
                      {formatDuration(task.duration)}
                    </title>
                  );
                  if (style === 'dormant') {
                    // Hollow outlined track — left to its own devices.
                    return (
                      <rect
                        key={`seg-${recipe.recipeId}:${task.taskId}`}
                        x={x - 4}
                        y={y1}
                        width={8}
                        height={Math.max(2, y2 - y1)}
                        fill="var(--color-surface)"
                        stroke={recipe.color}
                        strokeWidth={1.8}
                      >
                        {title}
                      </rect>
                    );
                  }
                  return (
                    <line
                      key={`seg-${recipe.recipeId}:${task.taskId}`}
                      x1={x}
                      y1={y1}
                      x2={x}
                      y2={y2}
                      stroke={recipe.color}
                      strokeWidth={8}
                      strokeLinecap="butt"
                      strokeDasharray={style === 'monitor' ? DASH : undefined}
                    >
                      {title}
                    </line>
                  );
                })}

                {/* Connectors — over the track. Dormant (hollow) when the
                    dish is just sitting between its own steps: either a
                    real idle gap, OR the cook has stepped away to another
                    recipe's hands-on task during the gap. The cross-
                    recipe check matters because the schedule interleaves
                    short hops the gap-length alone wouldn't catch — those
                    used to draw as solid focus on both recipes at once,
                    which read as "active on two dishes simultaneously"
                    even though the cook can only be on one. */}
                {recipe.tasks.flatMap((task) =>
                  task.dependsOn.flatMap((depId) => {
                    const dep = recipe.byTaskId.get(depId);
                    if (!dep) return [];
                    const gap = task.startOffset - dep.endOffset;
                    const crossOccupied =
                      gap > 0 &&
                      schedule.tasks.some(
                        (o) =>
                          o.recipeId !== recipe.recipeId &&
                          occupiesCook(o.kind) &&
                          o.startOffset < task.startOffset &&
                          o.startOffset + o.duration > dep.endOffset,
                      );
                    const dormant = crossOccupied || gap > 45;
                    const sameLane = dep.subLane === task.subLane;
                    const key = `${recipe.recipeId}:${depId}->${task.taskId}`;
                    const depX = recipe.subLaneX(dep.subLane);
                    const y1 = endY(depId);
                    const y2 = startY(task.taskId);

                    if (dormant && sameLane) {
                      // A straight idle stretch — hollow outlined track.
                      return [
                        <rect
                          key={key}
                          x={depX - 4}
                          y={y1}
                          width={8}
                          height={Math.max(2, y2 - y1)}
                          fill="var(--color-surface)"
                          stroke={recipe.color}
                          strokeWidth={1.8}
                        />,
                      ];
                    }

                    const d = roundedPath(
                      connectorPoints(
                        y1,
                        depX,
                        y2,
                        recipe.subLaneX(task.subLane),
                        g.cornerRadius,
                      ).map((p) => ({ x: p.cross, y: p.main })),
                      g.cornerRadius,
                    );

                    if (dormant) {
                      // Cross-lane idle stretch — hollowed by stacking a
                      // surface-coloured inner stroke over the coloured one.
                      return [
                        <path
                          key={`${key}-o`}
                          d={d}
                          fill="none"
                          stroke={recipe.color}
                          strokeWidth={8}
                          strokeLinecap="butt"
                          strokeLinejoin="round"
                        />,
                        <path
                          key={`${key}-i`}
                          d={d}
                          fill="none"
                          stroke="var(--color-surface)"
                          strokeWidth={5}
                          strokeLinecap="butt"
                          strokeLinejoin="round"
                        />,
                      ];
                    }
                    return [
                      <path
                        key={key}
                        d={d}
                        fill="none"
                        stroke={recipe.color}
                        strokeWidth={8}
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                      />,
                    ];
                  }),
                )}

              </g>
            );
          })}

          {/* Layer 2: journey hops. One smoothly-rounded connector per
              hop, stroked with a linear gradient from the source colour
              to the destination colour — so the handover reads
              continuously along the line rather than at a sharp split
              point. Gradients are user-space so they follow the path's
              actual start/end coordinates. */}
          <defs>
            {view.hops.map((hop, i) => (
              <linearGradient
                key={`hop-grad-${i}`}
                id={`tube-hop-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={hop.x1}
                y1={hop.y1}
                x2={hop.x2}
                y2={hop.y2}
              >
                <stop offset="0%" stopColor={hop.colorA} />
                <stop offset="100%" stopColor={hop.colorB} />
              </linearGradient>
            ))}
          </defs>
          {view.hops.map((hop, i) => (
            <path
              key={`hop-${i}`}
              d={hop.d}
              fill="none"
              stroke={`url(#tube-hop-grad-${i})`}
              strokeWidth={8}
              strokeLinecap="butt"
              strokeLinejoin="round"
            />
          ))}

          {/* Layer 3: stations + labels per recipe, drawn last so they
              sit on top of tracks, connectors, and hops. */}
          {recipes.map((recipe) => {
            const startY = (taskId: string) => view.startOf(recipe.recipeId, taskId);
            const endY = (taskId: string) => view.endOf(recipe.recipeId, taskId);
            // Terminal tasks — no one in this recipe depends on them. Each
            // gets a T-cap drawn at its endY, the way a tube map closes
            // off a line. Reads as "this dish ends here."
            const hasSuccessor = new Set<string>();
            for (const t of recipe.tasks) {
              for (const dep of t.dependsOn) hasSuccessor.add(dep);
            }
            const terminals = recipe.tasks.filter(
              (t) => !hasSuccessor.has(t.taskId),
            );
            return (
              <g key={`stations-${recipe.recipeId}`}>
                {terminals.map((t) => {
                  const x = recipe.subLaneX(t.subLane);
                  const y = endY(t.taskId);
                  return (
                    <line
                      key={`term-${recipe.recipeId}:${t.taskId}`}
                      x1={x - 13}
                      y1={y}
                      x2={x + 13}
                      y2={y}
                      stroke={recipe.color}
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                  );
                })}
                {recipe.tasks.map((task) => {
                  const x = recipe.subLaneX(task.subLane);
                  const y = startY(task.taskId);
                  const food = ingredientsText(task.ingredients);
                  const lines: { text: string; kind: string }[] = [];
                  if (task.major && task.group) {
                    lines.push({ text: task.group, kind: 'title' });
                  }
                  lines.push({ text: task.label, kind: 'action' });
                  if (food) lines.push({ text: food, kind: 'food' });
                  const onLeft =
                    recipe.labelSide.get(
                      `${recipe.recipeId}::${task.taskId}`,
                    ) === 'left';
                  const labelX = onLeft
                    ? recipe.leftLabelX
                    : recipe.rightLabelX;
                  // Labels live in an HTML foreignObject so they wrap onto
                  // multiple lines when the gutter is narrow (phone) — SVG
                  // text doesn't auto-wrap. overflow="visible" lets a
                  // taller-than-expected label spill out cleanly.
                  const lblW = Math.max(0, g.instrGutter - 26);
                  const lblH = 84;
                  // Ingredient illustration slot. Sits OUTSIDE the track
                  // bundle on the opposite side of the label — never on
                  // top of a track. No leader: visual context, not a
                  // strict reference to the station. Dashed outline
                  // until art arrives; swap to <image href={...}/>
                  // keyed on ingredientIds (see RECIPES.md).
                  const illR = view.illR;
                  const illCx = view.illXFor(recipe.recipeId, onLeft);
                  const hasIll = task.ingredients.length > 0;
                  return (
                    <g key={`stn-${recipe.recipeId}:${task.taskId}`}>
                      <line
                        className="tube__leader"
                        x1={x}
                        y1={y}
                        x2={onLeft ? labelX + 4 : labelX - 4}
                        y2={y}
                        stroke={recipe.color}
                      />
                      {task.major ? (
                        <circle
                          cx={x}
                          cy={y}
                          r={9}
                          fill="var(--color-surface)"
                          stroke={recipe.color}
                          strokeWidth={3.5}
                        />
                      ) : (
                        <line
                          x1={x - 10}
                          y1={y}
                          x2={x + 10}
                          y2={y}
                          stroke={recipe.color}
                          strokeWidth={3.5}
                          strokeLinecap="butt"
                        />
                      )}
                      {hasIll && (
                        <circle
                          className="tube__ill"
                          cx={illCx}
                          cy={y}
                          r={illR}
                          fill="none"
                          stroke="var(--color-text-muted)"
                          strokeWidth={1}
                          strokeDasharray="3 4"
                          opacity={0.4}
                        />
                      )}
                      <foreignObject
                        x={onLeft ? labelX - lblW : labelX}
                        y={y - lblH / 2}
                        width={lblW}
                        height={lblH}
                        overflow="visible"
                      >
                        <div
                          className={
                            onLeft
                              ? 'tube__lbl tube__lbl--left'
                              : 'tube__lbl tube__lbl--right'
                          }
                        >
                          {lines.map((line, i) => (
                            <div
                              key={i}
                              className={`tube__ln tube__ln--${line.kind}`}
                              style={
                                line.kind === 'title'
                                  ? { color: recipe.color }
                                  : undefined
                              }
                            >
                              {line.text}
                            </div>
                          ))}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* "You are here" */}
          {view.nowY !== null && (
            <>
              <line
                className="tube__now"
                x1={g.leftAxis - 8}
                y1={view.nowY}
                x2={axisRight}
                y2={view.nowY}
              />
              <text
                className="tube__now-label"
                x={10}
                y={view.nowY}
                dominantBaseline="middle"
              >
                now
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
