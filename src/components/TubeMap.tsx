import { useEffect, useMemo, useState } from 'react';
import type { Schedule, ScheduledTask } from '../lib/scheduler';
import { occupiesCook } from '../lib/scheduler';
import { formatDuration } from '../lib/recipeMetrics';
import './TubeMap.css';

// The cooking timeline drawn as a tube map. Each recipe is a coloured line;
// each task is a length of track (long task = long track); each station is an
// instruction. A phase change is a big interchange circle, a sub-step a small
// tick. Hands-on track (prep/active) is solid; hands-free track (passive/rest)
// is dashed — that's also when you'd be free to work another line.
//
// Layout is computed in orientation-agnostic (main, cross) coordinates — main
// is the time axis — then mapped to (x, y). Horizontal on wide screens,
// vertical on phones.

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

type Orientation = 'horizontal' | 'vertical';

const NARROW_BREAKPOINT = 760;

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

interface LaidTask extends ScheduledTask {
  endOffset: number;
  subLane: number;
  major: boolean;
  labelText: string;
  /** Absolute coordinates (px) along each axis. */
  startMain: number;
  endMain: number;
  cross: number;
}

interface LaidConnector {
  color: string;
  fromMain: number;
  fromCross: number;
  toMain: number;
  toCross: number;
  dashed: boolean;
}

interface LaidRecipe {
  recipeId: string;
  title: string;
  color: string;
  tasks: LaidTask[];
}

const GEO = {
  horizontal: {
    pxPerSec: 0.5,
    mainStart: 26,
    mainEndPad: 86,
    axisGutter: 36,
    bandHeadPad: 62,
    subLaneGap: 46,
    bandTailPad: 26,
    crossEndPad: 18,
  },
  vertical: {
    pxPerSec: 0.4,
    mainStart: 26,
    mainEndPad: 64,
    axisGutter: 30,
    bandHeadPad: 22,
    subLaneGap: 64,
    bandTailPad: 176,
    crossEndPad: 18,
  },
} as const;

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

function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() =>
    typeof window !== 'undefined' && window.innerWidth < NARROW_BREAKPOINT
      ? 'vertical'
      : 'horizontal',
  );
  useEffect(() => {
    const onResize = () => {
      setOrientation(
        window.innerWidth < NARROW_BREAKPOINT ? 'vertical' : 'horizontal',
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return orientation;
}

export function TubeMap({ schedule, lanes, startMs, nowMs }: TubeMapProps) {
  const orientation = useOrientation();

  const layout = useMemo(() => {
    const geo = GEO[orientation];
    const total = Math.max(schedule.totalDuration, 60);
    const mainOf = (sec: number) => geo.mainStart + sec * geo.pxPerSec;

    // Tasks grouped by recipe, in lane order.
    const tasksByRecipe = new Map<string, ScheduledTask[]>();
    for (const lane of lanes) tasksByRecipe.set(lane.recipeId, []);
    for (const task of schedule.tasks) {
      tasksByRecipe.get(task.recipeId)?.push(task);
    }

    const recipes: LaidRecipe[] = [];
    const connectors: LaidConnector[] = [];
    let bandCursor = geo.axisGutter;

    lanes.forEach((lane, laneIndex) => {
      const color = lineColor(laneIndex);
      const raw = tasksByRecipe.get(lane.recipeId) ?? [];
      const sorted = [...raw].sort(
        (a, b) => a.startOffset - b.startOffset || b.duration - a.duration,
      );

      // Greedy sub-lane assignment so parallel tasks don't stack on each other.
      const subLaneEnd: number[] = [];
      const subLaneOf = new Map<string, number>();
      for (const task of sorted) {
        let lane2 = subLaneEnd.findIndex((end) => end <= task.startOffset + 1);
        if (lane2 === -1) {
          lane2 = subLaneEnd.length;
          subLaneEnd.push(0);
        }
        subLaneEnd[lane2] = task.startOffset + task.duration;
        subLaneOf.set(task.taskId, lane2);
      }
      const subLaneCount = Math.max(1, subLaneEnd.length);

      // The first task (by start) in each group is the interchange station.
      const groupFirst = new Map<string, string>();
      for (const task of sorted) {
        if (task.group && !groupFirst.has(task.group)) {
          groupFirst.set(task.group, task.taskId);
        }
      }

      const crossOf = (subLane: number) =>
        bandCursor + geo.bandHeadPad + subLane * geo.subLaneGap;

      const laid: LaidTask[] = sorted.map((task) => {
        const subLane = subLaneOf.get(task.taskId) ?? 0;
        const major = !task.group || groupFirst.get(task.group) === task.taskId;
        const labelText =
          major && task.group ? `${task.group}: ${task.label}` : task.label;
        return {
          ...task,
          endOffset: task.startOffset + task.duration,
          subLane,
          major,
          labelText,
          startMain: mainOf(task.startOffset),
          endMain: mainOf(task.startOffset + task.duration),
          cross: crossOf(subLane),
        };
      });

      const byTaskId = new Map(laid.map((t) => [t.taskId, t]));
      for (const task of laid) {
        for (const depId of task.dependsOn) {
          const dep = byTaskId.get(depId);
          if (!dep) continue;
          connectors.push({
            color,
            fromMain: dep.endMain,
            fromCross: dep.cross,
            toMain: task.startMain,
            toCross: task.cross,
            // A gap between a dependency ending and this task starting means
            // the line is idle — nothing happening on this dish.
            dashed: task.startOffset - dep.endOffset > 60,
          });
        }
      }

      recipes.push({
        recipeId: lane.recipeId,
        title: lane.title,
        color,
        tasks: laid,
      });

      bandCursor +=
        geo.bandHeadPad +
        (subLaneCount - 1) * geo.subLaneGap +
        geo.bandTailPad;
    });

    const crossSize = bandCursor + geo.crossEndPad;
    const mainSize = mainOf(total) + geo.mainEndPad;

    const step = tickIntervalSec(total);
    const ticks: { main: number; label: string }[] = [];
    for (let o = 0; o < total - step * 0.4; o += step) {
      ticks.push({
        main: mainOf(o),
        label: startMs
          ? formatClock(startMs + o * 1000)
          : o === 0
            ? 'start'
            : `+${Math.round(o / 60)}m`,
      });
    }

    const serveMain = mainOf(total);
    const nowOffset = startMs !== null ? (nowMs - startMs) / 1000 : null;
    const nowMain =
      nowOffset !== null && nowOffset >= 0 && nowOffset <= total
        ? mainOf(nowOffset)
        : null;

    return { geo, recipes, connectors, crossSize, mainSize, ticks, serveMain, nowMain };
  }, [schedule, lanes, startMs, nowMs, orientation]);

  const horizontal = orientation === 'horizontal';
  const { geo, crossSize, mainSize } = layout;
  const svgWidth = horizontal ? mainSize : crossSize;
  const svgHeight = horizontal ? crossSize : mainSize;

  // (main, cross) → (x, y): main is the time axis, cross stacks the dishes.
  const x = (main: number, cross: number) => (horizontal ? main : cross);
  const y = (main: number, cross: number) => (horizontal ? cross : main);

  const axisEnd = crossSize - geo.crossEndPad / 2;

  return (
    <div className="tube">
      <div className="tube__legend">
        {layout.recipes.map((r) => (
          <span key={r.recipeId} className="tube__legend-item">
            <span
              className="tube__legend-line"
              style={{ background: r.color }}
            />
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
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Cooking timeline as a tube map"
        >
          {/* Axis ticks */}
          {layout.ticks.map((tick, i) => (
            <g key={`tick-${i}`}>
              <line
                className="tube__tick"
                x1={x(tick.main, geo.axisGutter)}
                y1={y(tick.main, geo.axisGutter)}
                x2={x(tick.main, axisEnd)}
                y2={y(tick.main, axisEnd)}
              />
              <text
                className="tube__tick-label"
                x={x(tick.main, 14)}
                y={y(tick.main, 14)}
                textAnchor={horizontal ? 'middle' : 'start'}
                dominantBaseline={horizontal ? 'auto' : 'middle'}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Connectors (drawn under the track) */}
          {layout.connectors.map((c, i) => (
            <line
              key={`conn-${i}`}
              x1={x(c.fromMain, c.fromCross)}
              y1={y(c.fromMain, c.fromCross)}
              x2={x(c.toMain, c.toCross)}
              y2={y(c.toMain, c.toCross)}
              stroke={c.color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={c.dashed ? '1 11' : undefined}
              opacity={0.9}
            />
          ))}

          {/* Track segments + stations + labels */}
          {layout.recipes.map((recipe) =>
            recipe.tasks.map((task) => {
              const handsFree = !occupiesCook(task.kind);
              const sx = x(task.startMain, task.cross);
              const sy = y(task.startMain, task.cross);
              return (
                <g key={`${recipe.recipeId}:${task.taskId}`}>
                  <line
                    x1={sx}
                    y1={sy}
                    x2={x(task.endMain, task.cross)}
                    y2={y(task.endMain, task.cross)}
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
                  {task.major ? (
                    <circle
                      cx={sx}
                      cy={sy}
                      r={9}
                      fill="var(--color-surface)"
                      stroke={recipe.color}
                      strokeWidth={3.5}
                    />
                  ) : (
                    <circle cx={sx} cy={sy} r={4.5} fill={recipe.color} />
                  )}
                  <text
                    className={
                      task.major
                        ? 'tube__label tube__label--major'
                        : 'tube__label tube__label--minor'
                    }
                    x={horizontal ? sx + 10 : sx + 14}
                    y={horizontal ? sy - 8 : sy + 4}
                    textAnchor="start"
                    transform={
                      horizontal
                        ? `rotate(-30 ${sx + 10} ${sy - 8})`
                        : undefined
                    }
                  >
                    {task.labelText}
                  </text>
                </g>
              );
            }),
          )}

          {/* Serve marker */}
          <line
            className="tube__serve"
            x1={x(layout.serveMain, geo.axisGutter)}
            y1={y(layout.serveMain, geo.axisGutter)}
            x2={x(layout.serveMain, axisEnd)}
            y2={y(layout.serveMain, axisEnd)}
          />
          <text
            className="tube__serve-label"
            x={x(layout.serveMain, 14)}
            y={y(layout.serveMain, 14)}
            textAnchor={horizontal ? 'middle' : 'start'}
            dominantBaseline={horizontal ? 'auto' : 'middle'}
          >
            Serve
          </text>

          {/* "You are here" */}
          {layout.nowMain !== null && (
            <>
              <line
                className="tube__now"
                x1={x(layout.nowMain, geo.axisGutter)}
                y1={y(layout.nowMain, geo.axisGutter)}
                x2={x(layout.nowMain, axisEnd)}
                y2={y(layout.nowMain, axisEnd)}
              />
              <text
                className="tube__now-label"
                x={x(layout.nowMain, 14)}
                y={y(layout.nowMain, 14)}
                textAnchor={horizontal ? 'middle' : 'start'}
                dominantBaseline={horizontal ? 'auto' : 'middle'}
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
