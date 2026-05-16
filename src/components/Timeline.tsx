import { useMemo } from 'react';
import type { Schedule } from '../lib/scheduler';
import './Timeline.css';

interface Lane {
  recipeId: string;
  title: string;
}

interface TimelineProps {
  schedule: Schedule;
  /** Lane order — one row per dish. */
  lanes: Lane[];
  /** Wall-clock ms of the schedule's start, or null if the plan has no serve time. */
  startMs: number | null;
  /** Current time in ms, for the now-line. */
  nowMs: number;
}

const LABEL_GUTTER = 128;
const RIGHT_PAD = 64;
const AXIS_HEIGHT = 34;
const LANE_HEIGHT = 56;
const TASK_INSET = 9;
const PX_PER_MIN = 15;
const MIN_PLOT = 320;
const CHAR_PX = 6.6;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tickIntervalSec(totalSec: number): number {
  const minutes = totalSec / 60;
  if (minutes <= 30) return 5 * 60;
  if (minutes <= 90) return 15 * 60;
  if (minutes <= 240) return 30 * 60;
  return 60 * 60;
}

function truncate(text: string, maxChars: number): string {
  if (maxChars < 2) return '';
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function Timeline({ schedule, lanes, startMs, nowMs }: TimelineProps) {
  const v = useMemo(() => {
    const total = Math.max(schedule.totalDuration, 60);
    const plotWidth = Math.max(MIN_PLOT, (total / 60) * PX_PER_MIN);
    const scale = plotWidth / total; // px per second
    const width = LABEL_GUTTER + plotWidth + RIGHT_PAD;
    const height = AXIS_HEIGHT + lanes.length * LANE_HEIGHT + 12;
    const x = (sec: number) => LABEL_GUTTER + sec * scale;
    const laneIndexById = new Map(lanes.map((l, i) => [l.recipeId, i]));

    const step = tickIntervalSec(total);
    const ticks: { offset: number; label: string }[] = [];
    for (let o = 0; o < total - step * 0.35; o += step) {
      ticks.push({
        offset: o,
        label: startMs
          ? formatClock(startMs + o * 1000)
          : o === 0
            ? 'start'
            : `+${Math.round(o / 60)}m`,
      });
    }

    const nowOffset =
      startMs !== null ? (nowMs - startMs) / 1000 : null;
    const showNow = nowOffset !== null && nowOffset >= 0 && nowOffset <= total;

    return {
      total,
      scale,
      width,
      height,
      x,
      laneIndexById,
      ticks,
      nowOffset,
      showNow,
    };
  }, [schedule.totalDuration, lanes, startMs, nowMs]);

  return (
    <div className="timeline">
      <svg
        className="timeline__svg"
        viewBox={`0 0 ${v.width} ${v.height}`}
        width={v.width}
        height={v.height}
        role="img"
        aria-label="Cooking timeline"
      >
        {/* Lane background stripes + dish labels */}
        {lanes.map((lane, i) => {
          const y = AXIS_HEIGHT + i * LANE_HEIGHT;
          return (
            <g key={lane.recipeId}>
              <rect
                className={i % 2 === 0 ? 'tl-lane' : 'tl-lane tl-lane--alt'}
                x={0}
                y={y}
                width={v.width}
                height={LANE_HEIGHT}
              />
              <text
                className="tl-lane-label"
                x={12}
                y={y + LANE_HEIGHT / 2}
                dominantBaseline="middle"
              >
                {truncate(lane.title, 18)}
              </text>
            </g>
          );
        })}

        {/* Conflict bands — cook double-booked */}
        {schedule.conflicts.map((c, i) => (
          <rect
            key={`conflict-${i}`}
            className="tl-conflict"
            x={v.x(c.startOffset)}
            y={AXIS_HEIGHT}
            width={Math.max(2, (c.endOffset - c.startOffset) * v.scale)}
            height={lanes.length * LANE_HEIGHT}
          >
            <title>Cook double-booked here</title>
          </rect>
        ))}

        {/* Axis ticks */}
        {v.ticks.map((tick, i) => (
          <g key={`tick-${i}`}>
            <line
              className="tl-tick"
              x1={v.x(tick.offset)}
              y1={AXIS_HEIGHT - 6}
              x2={v.x(tick.offset)}
              y2={AXIS_HEIGHT + lanes.length * LANE_HEIGHT}
            />
            <text
              className="tl-tick-label"
              x={v.x(tick.offset)}
              y={AXIS_HEIGHT - 12}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Task blocks */}
        {schedule.tasks.map((task) => {
          const laneIndex = v.laneIndexById.get(task.recipeId);
          if (laneIndex === undefined) return null;
          const y = AXIS_HEIGHT + laneIndex * LANE_HEIGHT + TASK_INSET;
          const h = LANE_HEIGHT - TASK_INSET * 2;
          const w = Math.max(3, task.duration * v.scale);
          const x = v.x(task.startOffset);
          const minutes = Math.max(1, Math.round(task.duration / 60));
          const labelChars = Math.floor((w - 12) / CHAR_PX);
          return (
            <g key={`${task.recipeId}:${task.taskId}`}>
              <rect
                className={`tl-task tl-task--${task.kind}`}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={5}
              >
                <title>
                  {task.label} · {task.kind} · {minutes} min
                </title>
              </rect>
              {labelChars >= 3 && (
                <text
                  className={`tl-task-label tl-task-label--${task.kind}`}
                  x={x + 6}
                  y={y + h / 2}
                  dominantBaseline="middle"
                >
                  {truncate(task.label, labelChars)}
                </text>
              )}
            </g>
          );
        })}

        {/* Serve marker at the right edge */}
        <g>
          <line
            className="tl-serve"
            x1={v.x(v.total)}
            y1={AXIS_HEIGHT - 6}
            x2={v.x(v.total)}
            y2={AXIS_HEIGHT + lanes.length * LANE_HEIGHT}
          />
          <text
            className="tl-serve-label"
            x={v.x(v.total) + 6}
            y={AXIS_HEIGHT + 4}
          >
            Serve
          </text>
        </g>

        {/* Now-line */}
        {v.showNow && v.nowOffset !== null && (
          <g>
            <line
              className="tl-now"
              x1={v.x(v.nowOffset)}
              y1={AXIS_HEIGHT - 6}
              x2={v.x(v.nowOffset)}
              y2={AXIS_HEIGHT + lanes.length * LANE_HEIGHT}
            />
            <text
              className="tl-now-label"
              x={v.x(v.nowOffset) + 5}
              y={AXIS_HEIGHT - 12}
            >
              now
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
