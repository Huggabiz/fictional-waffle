import { useMemo } from 'react';
import type { Schedule, ScheduledIngredient } from '../lib/scheduler';
import { occupiesCook } from '../lib/scheduler';
import {
  connectorPoints,
  layoutLanes,
  roundedPath,
} from '../lib/tubeLayout';
import { formatDuration } from '../lib/recipeMetrics';
import './TubeMap.css';

// The kitchen timeline as a vertical tube map. Time runs top → bottom. Each
// dish is a coloured line; each task is a length of track; each instruction
// is a station (big interchange = phase change, small tick = sub-step). The
// food sits to the LEFT of the track, the instruction to the RIGHT. Branches
// split off as 45° spurs with rounded corners. Hands-on track (prep/active)
// is solid; hands-free (passive/rest) is dashed.

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
  pxPerSec: 0.7,
  leftAxis: 52,
  mainStart: 56,
  bottomPad: 52,
  rightPad: 20,
  foodGutter: 116,
  trackPad: 22,
  subLaneGap: 34,
  instrGutter: 262,
  cornerRadius: 13,
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

function foodText(ingredients: ScheduledIngredient[]): string {
  const parts = ingredients.map((ing) =>
    [formatQty(ing.quantity), ing.unit, ing.label].filter(Boolean).join(' '),
  );
  const joined = parts.join(', ');
  return joined.length > 26 ? `${joined.slice(0, 25)}…` : joined;
}

export function TubeMap({ schedule, lanes, startMs, nowMs }: TubeMapProps) {
  const view = useMemo(() => {
    const g = GEO;
    const total = Math.max(schedule.totalDuration, 60);
    const mainOf = (sec: number) => g.mainStart + sec * g.pxPerSec;
    const laid = layoutLanes(schedule, lanes);

    let bandLeft = g.leftAxis;
    const recipes = laid.map((lane) => {
      const color = lineColor(lane.laneIndex);
      const trackLeft = bandLeft + g.foodGutter + g.trackPad;
      const subLaneX = (subLane: number) => trackLeft + subLane * g.subLaneGap;
      const trackRight = subLaneX(lane.subLaneCount - 1);
      const out = {
        ...lane,
        color,
        bandLeft,
        foodX: bandLeft + g.foodGutter - 12,
        instrX: trackRight + 22,
        subLaneX,
      };
      bandLeft +=
        g.foodGutter +
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

    return { g, recipes, width, height, ticks, serveY, nowY, mainOf };
  }, [schedule, lanes, startMs, nowMs]);

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
          <span className="tube__legend-line tube__legend-line--solid" />
          hands-on
        </span>
        <span className="tube__legend-item tube__legend-item--note">
          <span className="tube__legend-line tube__legend-line--dashed" />
          hands-free
        </span>
      </div>

      <div className="tube__scroll">
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
              x={r.bandLeft + g.foodGutter + g.trackPad}
              y={g.mainStart - 26}
              fill={r.color}
            >
              {r.title}
            </text>
          ))}

          {/* Per recipe: connectors, then track, then stations + labels */}
          {recipes.map((recipe) => {
            const stationY = (offset: number) => view.mainOf(offset);
            return (
              <g key={recipe.recipeId}>
                {/* Connectors (under the track) */}
                {recipe.tasks.flatMap((task) =>
                  task.dependsOn.flatMap((depId) => {
                    const dep = recipe.byTaskId.get(depId);
                    if (!dep) return [];
                    const pts = connectorPoints(
                      stationY(dep.endOffset),
                      recipe.subLaneX(dep.subLane),
                      stationY(task.startOffset),
                      recipe.subLaneX(task.subLane),
                      stationY(dep.startOffset),
                      stationY(task.endOffset),
                    ).map((p) => ({ x: p.cross, y: p.main }));
                    // The branch into a hands-free task (or across an idle
                    // gap) is dashed — that's the part of the split you walk
                    // away from.
                    const dashed =
                      !occupiesCook(task.kind) ||
                      task.startOffset - dep.endOffset > 60;
                    return [
                      <path
                        key={`${recipe.recipeId}:${depId}->${task.taskId}`}
                        d={roundedPath(pts, g.cornerRadius)}
                        fill="none"
                        stroke={recipe.color}
                        strokeWidth={5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={dashed ? '1 11' : undefined}
                        opacity={0.9}
                      />,
                    ];
                  }),
                )}

                {/* Track segments */}
                {recipe.tasks.map((task) => {
                  const x = recipe.subLaneX(task.subLane);
                  const handsFree = !occupiesCook(task.kind);
                  return (
                    <line
                      key={`seg-${recipe.recipeId}:${task.taskId}`}
                      x1={x}
                      y1={stationY(task.startOffset)}
                      x2={x}
                      y2={stationY(task.endOffset)}
                      stroke={recipe.color}
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeDasharray={handsFree ? '2 12' : undefined}
                    >
                      <title>
                        {task.label} · {task.kind} ·{' '}
                        {formatDuration(task.duration)}
                      </title>
                    </line>
                  );
                })}

                {/* Stations + food (left) + instruction (right) */}
                {recipe.tasks.map((task) => {
                  const x = recipe.subLaneX(task.subLane);
                  const y = stationY(task.startOffset);
                  const food = foodText(task.ingredients);
                  const showTitle = task.major && Boolean(task.group);
                  return (
                    <g key={`stn-${recipe.recipeId}:${task.taskId}`}>
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
                        <circle cx={x} cy={y} r={4.5} fill={recipe.color} />
                      )}
                      {food && (
                        <text
                          className="tube__food"
                          x={recipe.foodX}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="middle"
                        >
                          {food}
                        </text>
                      )}
                      {showTitle ? (
                        // Phase change: group name as a bold section title,
                        // the actual step below it in normal weight.
                        <text
                          x={recipe.instrX}
                          y={y}
                          dominantBaseline="middle"
                        >
                          <tspan
                            className="tube__instr-title"
                            x={recipe.instrX}
                            dy="-0.32em"
                          >
                            {task.group}
                          </tspan>
                          <tspan
                            className="tube__instr-step"
                            x={recipe.instrX}
                            dy="1.28em"
                          >
                            {task.label}
                          </tspan>
                        </text>
                      ) : (
                        <text
                          className={
                            task.major
                              ? 'tube__instr-step tube__instr-step--solo'
                              : 'tube__instr-step tube__instr-step--minor'
                          }
                          x={recipe.instrX}
                          y={y}
                          dominantBaseline="middle"
                        >
                          {task.label}
                        </text>
                      )}
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
                y={view.nowY - 7}
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
