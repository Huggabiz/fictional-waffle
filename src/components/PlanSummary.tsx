import { useMemo } from 'react';
import type { Schedule } from '../lib/scheduler';
import { occupiesCook } from '../lib/scheduler';
import { connectorPoints, layoutLanes, roundedPath } from '../lib/tubeLayout';
import { lineColor } from './TubeMap';
import './PlanSummary.css';

// A compact, text-free horizontal version of the tube map for the Planner —
// the shape of the cook at a glance. Same lines and 45° branches as the Cook
// view, just shrunk and without instructions. Time runs left → right.

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

const G = {
  pxPerSec: 0.16,
  leftPad: 18,
  rightPad: 58,
  topPad: 26,
  bottomPad: 16,
  bandHeadPad: 20,
  bandTailPad: 16,
  subLaneRowGap: 16,
  cornerRadius: 7,
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
  const view = useMemo(() => {
    const total = Math.max(schedule.totalDuration, 60);
    const mainOf = (sec: number) => G.leftPad + sec * G.pxPerSec;
    const laid = layoutLanes(schedule, lanes);

    let bandTop = G.topPad;
    const recipes = laid.map((lane) => {
      const color = lineColor(lane.laneIndex);
      const rowTop = bandTop + G.bandHeadPad;
      const crossOf = (subLane: number) => rowTop + subLane * G.subLaneRowGap;
      bandTop +=
        G.bandHeadPad +
        (lane.subLaneCount - 1) * G.subLaneRowGap +
        G.bandTailPad;
      return { ...lane, color, crossOf };
    });

    const width = mainOf(total) + G.rightPad;
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

    return { recipes, width, height, ticks, serveX, nowX, mainOf };
  }, [schedule, lanes, startMs, nowMs]);

  const { width, height } = view;

  return (
    <div className="plan-summary">
      <div className="plan-summary__caption">Timeline preview</div>
      <div className="plan-summary__scroll">
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
              <text className="plan-summary__tick-label" x={tick.x} y={G.topPad - 12} textAnchor="middle">
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
                  ).map((p) => ({ x: p.main, y: p.cross }));
                  return [
                    <path
                      key={`${recipe.recipeId}:${depId}->${task.taskId}`}
                      d={roundedPath(pts, G.cornerRadius)}
                      fill="none"
                      stroke={recipe.color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
                    strokeDasharray={occupiesCook(task.kind) ? undefined : '1.5 7'}
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
