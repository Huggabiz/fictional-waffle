import { useEffect, useMemo, useRef, useState } from 'react';
import type { Schedule } from '../lib/scheduler';
import { occupiesCook } from '../lib/scheduler';
import { connectorPoints, layoutLanes, roundedPath } from '../lib/tubeLayout';
import { lineColor } from './TubeMap';
import './PlanSummary.css';

// A compact, text-free horizontal version of the tube map for the Planner.
// It always scales to fit the container width — start on the left, serve on
// the right. Two views the user can switch between:
//  - Tracks:  each dish on its own row, the shape of the cook at a glance.
//  - Journey: the dishes bundled tight together; where the cook moves from
//             one dish to the next their lines converge at an interchange.

interface Lane {
  recipeId: string;
  title: string;
}

interface PlanSummaryProps {
  schedule: Schedule;
  lanes: Lane[];
  startMs: number | null;
  nowMs: number;
}

type Mode = 'tracks' | 'journey';

const G = {
  leftPad: 18,
  rightPad: 58,
  topPad: 26,
  bottomPad: 16,
  cornerRadius: 7,
};

// Tracks spreads the dishes out; Journey bundles them tight together.
const BANDS: Record<Mode, { headPad: number; tailPad: number; rowGap: number }> = {
  tracks: { headPad: 20, tailPad: 16, rowGap: 16 },
  journey: { headPad: 7, tailPad: 7, rowGap: 12 },
};

function tickIntervalSec(totalSec: number): number {
  const minutes = totalSec / 60;
  if (minutes <= 20) return 5 * 60;
  if (minutes <= 60) return 15 * 60;
  if (minutes <= 150) return 30 * 60;
  return 60 * 60;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PlanSummary({ schedule, lanes, startMs, nowMs }: PlanSummaryProps) {
  const [mode, setMode] = useState<Mode>('tracks');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Measure the available width so the timeline can be scaled to fill it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    const band = BANDS[mode];
    const total = Math.max(schedule.totalDuration, 60);
    const width = containerW > 0 ? containerW : 640;
    // Scale time to the width: start at the left, serve near the right.
    const pxPerSec = Math.max(
      0.01,
      (width - G.leftPad - G.rightPad) / total,
    );
    const mainOf = (sec: number) => G.leftPad + sec * pxPerSec;
    const laid = layoutLanes(schedule, lanes);

    let bandTop = G.topPad;
    const recipes = laid.map((lane) => {
      const color = lineColor(lane.laneIndex);
      const rowTop = bandTop + band.headPad;
      const crossOf = (subLane: number) => rowTop + subLane * band.rowGap;
      bandTop +=
        band.headPad + (lane.subLaneCount - 1) * band.rowGap + band.tailPad;
      return { ...lane, color, crossOf };
    });

    const height = bandTop + G.bottomPad;

    const step = tickIntervalSec(total);
    const ticks: { x: number; label: string }[] = [];
    for (let o = 0; o < total - step * 0.4; o += step) {
      ticks.push({
        x: mainOf(o),
        label: startMs
          ? formatClock(startMs + o * 1000)
          : o === 0
            ? 'start'
            : `+${Math.round(o / 60)}m`,
      });
    }

    const serveX = mainOf(total);
    const nowOffset = startMs !== null ? (nowMs - startMs) / 1000 : null;
    const nowX =
      nowOffset !== null && nowOffset >= 0 && nowOffset <= total
        ? mainOf(nowOffset)
        : null;

    // Journey: hands-on tasks in cooking order. Where two consecutive ones
    // are different dishes, the cook hops — their two lines converge at a
    // shared interchange circle, each keeping its own colour.
    interface Hop {
      dA: string;
      colorA: string;
      dB: string;
      colorB: string;
      mx: number;
      my: number;
    }
    const hops: Hop[] = [];
    if (mode === 'journey') {
      const handsOn: {
        task: (typeof recipes)[number]['tasks'][number];
        recipe: (typeof recipes)[number];
      }[] = [];
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
        const ax = mainOf(a.task.endOffset);
        const ay = a.recipe.crossOf(a.task.subLane);
        const bx = mainOf(b.task.startOffset);
        const by = b.recipe.crossOf(b.task.subLane);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const dA = roundedPath(
          connectorPoints(
            ax,
            ay,
            mx,
            my,
            mainOf(a.task.startOffset),
            mx,
          ).map((p) => ({ x: p.main, y: p.cross })),
          G.cornerRadius,
        );
        const dB = roundedPath(
          connectorPoints(
            mx,
            my,
            bx,
            by,
            mx,
            mainOf(b.task.endOffset),
          ).map((p) => ({ x: p.main, y: p.cross })),
          G.cornerRadius,
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

    return { recipes, width, height, ticks, serveX, nowX, mainOf, hops };
  }, [schedule, lanes, startMs, nowMs, mode, containerW]);

  const { width, height } = view;

  return (
    <div className="plan-summary">
      <div className="plan-summary__head">
        <span className="plan-summary__caption">Timeline preview</span>
        <div
          className="plan-summary__modes"
          role="radiogroup"
          aria-label="Timeline view"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'tracks'}
            className={
              mode === 'tracks'
                ? 'plan-summary__mode plan-summary__mode--on'
                : 'plan-summary__mode'
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
              mode === 'journey'
                ? 'plan-summary__mode plan-summary__mode--on'
                : 'plan-summary__mode'
            }
            onClick={() => setMode('journey')}
          >
            Journey
          </button>
        </div>
      </div>
      <div className="plan-summary__scroll" ref={scrollRef}>
        <svg
          className="plan-summary__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Plan timeline summary"
        >
          {view.ticks.map((tick, i) => (
            <g key={`tick-${i}`}>
              <line
                className="plan-summary__tick"
                x1={tick.x}
                y1={G.topPad - 6}
                x2={tick.x}
                y2={height - G.bottomPad}
              />
              <text
                className="plan-summary__tick-label"
                x={tick.x}
                y={G.topPad - 12}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {view.recipes.map((recipe) => (
            <g key={recipe.recipeId}>
              {recipe.tasks.flatMap((task) =>
                task.dependsOn.flatMap((depId) => {
                  const dep = recipe.byTaskId.get(depId);
                  if (!dep) return [];
                  const pts = connectorPoints(
                    view.mainOf(dep.endOffset),
                    recipe.crossOf(dep.subLane),
                    view.mainOf(task.startOffset),
                    recipe.crossOf(task.subLane),
                    view.mainOf(dep.startOffset),
                    view.mainOf(task.endOffset),
                  ).map((p) => ({ x: p.main, y: p.cross }));
                  const dashed =
                    !occupiesCook(task.kind) ||
                    task.startOffset - dep.endOffset > 60;
                  return [
                    <path
                      key={`${recipe.recipeId}:${depId}->${task.taskId}`}
                      d={roundedPath(pts, G.cornerRadius)}
                      fill="none"
                      stroke={recipe.color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={dashed ? '1.5 7' : undefined}
                    />,
                  ];
                }),
              )}
              {recipe.tasks.map((task) => {
                const y = recipe.crossOf(task.subLane);
                return (
                  <line
                    key={`seg-${recipe.recipeId}:${task.taskId}`}
                    x1={view.mainOf(task.startOffset)}
                    y1={y}
                    x2={view.mainOf(task.endOffset)}
                    y2={y}
                    stroke={recipe.color}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={
                      occupiesCook(task.kind) ? undefined : '1.5 7'
                    }
                  />
                );
              })}
              {recipe.tasks.map((task) => {
                const y = recipe.crossOf(task.subLane);
                const x = view.mainOf(task.startOffset);
                return task.major ? (
                  <circle
                    key={`stn-${recipe.recipeId}:${task.taskId}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill="var(--color-surface)"
                    stroke={recipe.color}
                    strokeWidth={2}
                  />
                ) : (
                  <circle
                    key={`stn-${recipe.recipeId}:${task.taskId}`}
                    cx={x}
                    cy={y}
                    r={2.5}
                    fill={recipe.color}
                  />
                );
              })}
            </g>
          ))}

          {/* Journey view: dishes' lines converge at an interchange */}
          {view.hops.map((hop, i) => (
            <g key={`hop-${i}`}>
              <path
                d={hop.dA}
                fill="none"
                stroke={hop.colorA}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={hop.dB}
                fill="none"
                stroke={hop.colorB}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                className="plan-summary__interchange"
                cx={hop.mx}
                cy={hop.my}
                r={5.5}
              />
            </g>
          ))}

          <line
            className="plan-summary__serve"
            x1={view.serveX}
            y1={G.topPad - 6}
            x2={view.serveX}
            y2={height - G.bottomPad}
          />
          <text
            className="plan-summary__serve-label"
            x={view.serveX + 6}
            y={G.topPad - 2}
          >
            Serve
          </text>

          {view.nowX !== null && (
            <line
              className="plan-summary__now"
              x1={view.nowX}
              y1={G.topPad - 6}
              x2={view.nowX}
              y2={height - G.bottomPad}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
