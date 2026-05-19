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

const GEO = {
  pxPerSec: 0.85,
  leftAxis: 52,
  mainStart: 56,
  bottomPad: 52,
  rightPad: 20,
  trackPad: 24,
  subLaneGap: 34,
  instrGutter: 286,
  cornerRadius: 13,
  // Minimum drawn gap between adjacent task boundaries. The map stays mostly
  // time-proportional, but — like a tube map bends geography — close stations
  // get spaced out so they stay legible.
  minEventGap: 30,
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
  const [mode, setMode] = useState<Mode>('tracks');
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => {
    const g = GEO;
    const isJourney = mode === 'journey';
    const total = Math.max(schedule.totalDuration, 60);
    const laid = layoutLanes(schedule, lanes);

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

    // --- Pass 4: label sides. Uses station ys to avoid stacking labels.
    const assignSides = (
      entries: { recipeId: string; task: SubLanedTask }[],
    ): Map<string, 'left' | 'right'> => {
      const side = new Map<string, 'left' | 'right'>();
      let rightBottom = -Infinity;
      let leftBottom = -Infinity;
      for (const { recipeId, task } of [...entries].sort(
        (a, b) => a.task.startOffset - b.task.startOffset,
      )) {
        const lineCount =
          1 +
          (task.major && task.group ? 1 : 0) +
          (ingredientsText(task.ingredients) ? 1 : 0);
        const half = (lineCount * 15) / 2;
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
    const nowY =
      nowOffset !== null && nowOffset >= 0 && nowOffset <= total
        ? mainOf(nowOffset)
        : null;

    // Journey: where the cook moves from one dish to another, the two lines
    // converge at a shared interchange. Walk the hands-on tasks in cooking
    // order; a change of dish between two consecutive ones is a hop.
    interface Hop {
      dA: string;
      colorA: string;
      dB: string;
      colorB: string;
      mx: number;
      my: number;
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
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const dA = roundedPath(
          connectorPoints(ay, ax, my, mx, g.cornerRadius).map(
            (p) => ({ x: p.cross, y: p.main }),
          ),
          g.cornerRadius,
        );
        const dB = roundedPath(
          connectorPoints(my, mx, by, bx, g.cornerRadius).map(
            (p) => ({ x: p.cross, y: p.main }),
          ),
          g.cornerRadius,
        );
        hops.push({
          dA,
          colorA: a.recipe.color,
          dB,
          colorB: b.recipe.color,
          mx,
          my,
        });
      }
    }

    const stationPos = new Map<string, { x: number; y: number }>();
    for (const r of recipes) {
      for (const t of r.tasks) {
        stationPos.set(`${r.recipeId}::${t.taskId}`, {
          x: r.subLaneX(t.subLane),
          y: startOf(r.recipeId, t.taskId),
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
    };
  }, [schedule, lanes, startMs, nowMs, mode]);

  // Re-centre the canvas on the focused task whenever it changes (a Next
  // press, or an auto-advance) — not on every now-tick, so the cook can
  // still pan around freely between advances.
  useEffect(() => {
    if (!focusTaskId) return;
    const pos = view.stationPos.get(focusTaskId);
    const el = scrollRef.current;
    if (!pos || !el) return;
    el.scrollTo({
      left: pos.x - el.clientWidth / 2,
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

          {/* Per recipe: track segments, then connectors over them, then
              stations + labels on top. */}
          {recipes.map((recipe) => {
            const startY = (taskId: string) => view.startOf(recipe.recipeId, taskId);
            const endY = (taskId: string) => view.endOf(recipe.recipeId, taskId);
            return (
              <g key={recipe.recipeId}>
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

                {/* Connectors — over the track. A real idle gap between two
                    of a dish's steps is the dish sitting DORMANT (hollow), not
                    monitored: the chopped tomatoes aren't going anywhere. */}
                {recipe.tasks.flatMap((task) =>
                  task.dependsOn.flatMap((depId) => {
                    const dep = recipe.byTaskId.get(depId);
                    if (!dep) return [];
                    const dormant = task.startOffset - dep.endOffset > 45;
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

                {/* Stations + labels */}
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
                  const firstDy =
                    lines.length > 1
                      ? `${-(lines.length - 1) * 0.62}em`
                      : '0';
                  // Side chosen by available room — see the memo above.
                  const onLeft =
                    recipe.labelSide.get(
                      `${recipe.recipeId}::${task.taskId}`,
                    ) === 'left';
                  const labelX = onLeft
                    ? recipe.leftLabelX
                    : recipe.rightLabelX;
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
                        // Minor stop — a tick across the track, drawn on top.
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
                      <text
                        x={labelX}
                        y={y}
                        textAnchor={onLeft ? 'end' : 'start'}
                        dominantBaseline="middle"
                      >
                        {lines.map((line, i) => (
                          <tspan
                            key={i}
                            x={labelX}
                            dy={i === 0 ? firstDy : '1.25em'}
                            className={`tube__ln tube__ln--${line.kind}`}
                            fill={line.kind === 'title' ? recipe.color : undefined}
                          >
                            {line.text}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Journey: where the cook hops dishes, the lines converge at a
              shared interchange, each keeping its own colour. */}
          {view.hops.map((hop, i) => (
            <g key={`hop-${i}`}>
              <path
                d={hop.dA}
                fill="none"
                stroke={hop.colorA}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={hop.dB}
                fill="none"
                stroke={hop.colorB}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                className="tube__interchange"
                cx={hop.mx}
                cy={hop.my}
                r={9}
              />
            </g>
          ))}

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
              <text className="tube__now-label" x={10} y={view.nowY - 7}>
                now
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
