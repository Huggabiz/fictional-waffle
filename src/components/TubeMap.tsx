import { useEffect, useMemo, useRef } from 'react';
import type { Schedule, ScheduledIngredient } from '../lib/scheduler';
import {
  connectorPoints,
  layoutLanes,
  roundedPath,
} from '../lib/tubeLayout';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => {
    const g = GEO;
    const total = Math.max(schedule.totalDuration, 60);
    const laid = layoutLanes(schedule, lanes);

    // Time-warp: a tube map bends geography for clarity. The map stays mostly
    // proportional to real time — so the cook still feels how long the cook
    // is — but two station events are never drawn closer than `minEventGap`,
    // so steps that happen in quick succession stay legible.
    const events = new Set<number>([0, total]);
    for (const lane of laid) {
      for (const t of lane.tasks) {
        if (t.startOffset > 0 && t.startOffset < total) events.add(t.startOffset);
        if (t.endOffset > 0 && t.endOffset < total) events.add(t.endOffset);
      }
    }
    const sortedEvents = [...events].sort((a, b) => a - b);
    const drawnAt = new Map<number, number>();
    drawnAt.set(sortedEvents[0], 0);
    let drawn = 0;
    for (let i = 1; i < sortedEvents.length; i++) {
      const realGap = sortedEvents[i] - sortedEvents[i - 1];
      drawn += Math.max(realGap * g.pxPerSec, g.minEventGap);
      drawnAt.set(sortedEvents[i], drawn);
    }
    const mainOf = (sec: number) => {
      const clamped = Math.max(0, Math.min(total, sec));
      let lo = sortedEvents[0];
      let hi = sortedEvents[sortedEvents.length - 1];
      for (let i = 1; i < sortedEvents.length; i++) {
        if (sortedEvents[i] >= clamped) {
          lo = sortedEvents[i - 1];
          hi = sortedEvents[i];
          break;
        }
      }
      const loY = drawnAt.get(lo)!;
      const hiY = drawnAt.get(hi)!;
      const frac = hi > lo ? (clamped - lo) / (hi - lo) : 0;
      return g.mainStart + loY + frac * (hiY - loY);
    };

    let bandLeft = g.leftAxis;
    const recipes = laid.map((lane) => {
      const color = lineColor(lane.laneIndex);
      // Every band keeps an instruction gutter on BOTH sides. The cook works
      // one task at a time, so a station's label can sit on either side — we
      // place it in whichever column has vertical room (preferring the
      // right), so steps in quick succession don't stack their labels on top
      // of one another.
      const trackLeft = bandLeft + g.instrGutter + g.trackPad;
      const subLaneX = (subLane: number) => trackLeft + subLane * g.subLaneGap;
      const trackRight = subLaneX(lane.subLaneCount - 1);

      const labelSide = new Map<string, 'left' | 'right'>();
      let rightBottom = -Infinity;
      let leftBottom = -Infinity;
      for (const t of [...lane.tasks].sort(
        (a, b) => a.startOffset - b.startOffset,
      )) {
        const lineCount =
          1 +
          (t.major && t.group ? 1 : 0) +
          (ingredientsText(t.ingredients) ? 1 : 0);
        const half = (lineCount * 15) / 2;
        const y = mainOf(t.startOffset);
        let chosen: 'left' | 'right';
        if (y - half >= rightBottom) chosen = 'right';
        else if (y - half >= leftBottom) chosen = 'left';
        else chosen = rightBottom <= leftBottom ? 'right' : 'left';
        if (chosen === 'right') rightBottom = y + half + 6;
        else leftBottom = y + half + 6;
        labelSide.set(t.taskId, chosen);
      }

      const out = {
        ...lane,
        color,
        bandLeft,
        trackLeft,
        subLaneX,
        labelSide,
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

    const width = bandLeft + g.rightPad;
    const height = mainOf(total) + g.bottomPad;

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

    const stationPos = new Map<string, { x: number; y: number }>();
    for (const r of recipes) {
      for (const t of r.tasks) {
        stationPos.set(`${r.recipeId}::${t.taskId}`, {
          x: r.subLaneX(t.subLane),
          y: mainOf(t.startOffset),
        });
      }
    }

    return { g, recipes, width, height, ticks, serveY, nowY, mainOf, stationPos };
  }, [schedule, lanes, startMs, nowMs]);

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

          {/* Recipe titles */}
          {recipes.map((r) => (
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
            const stationY = (offset: number) => view.mainOf(offset);
            return (
              <g key={recipe.recipeId}>
                {/* Track segments */}
                {recipe.tasks.map((task) => {
                  const x = recipe.subLaneX(task.subLane);
                  const y1 = stationY(task.startOffset);
                  const y2 = stationY(task.endOffset);
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
                    const y1 = stationY(dep.endOffset);
                    const y2 = stationY(task.startOffset);

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
                        stationY(dep.startOffset),
                        stationY(task.endOffset),
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
                  const y = stationY(task.startOffset);
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
                  const onLeft = recipe.labelSide.get(task.taskId) === 'left';
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
