import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePlanSchedule } from '../store/selectors';
import { occupiesCook } from '../lib/scheduler';
import type { ScheduledTask } from '../lib/scheduler';
import { formatDuration } from '../lib/recipeMetrics';
import { formatServeAt } from '../lib/planTime';
import { TubeMap, lineColor } from '../components/TubeMap';
import './CookSection.css';

const TICK_MS = 1_000; // the now-line and countdown creep smoothly

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

interface TaskWindow {
  task: ScheduledTask;
  startMs: number;
  endMs: number;
}

export function CookSection() {
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const updatePlan = useAppStore((s) => s.updatePlan);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const activePlan = useMemo(
    () => plans.find((p) => p.id === activePlanId),
    [plans, activePlanId],
  );

  const { schedule, lanes, startMs, serveMs } = usePlanSchedule(activePlan);

  const windows: TaskWindow[] = useMemo(() => {
    if (!schedule || startMs === null) return [];
    return schedule.tasks.map((task) => ({
      task,
      startMs: startMs + task.startOffset * 1000,
      endMs: startMs + (task.startOffset + task.duration) * 1000,
    }));
  }, [schedule, startMs]);

  const current = useMemo(() => {
    if (startMs === null || serveMs === null) {
      return { phase: 'unanchored' as const };
    }
    if (now < startMs) {
      const first = windows
        .filter((w) => occupiesCook(w.task.kind))
        .sort((a, b) => a.startMs - b.startMs)[0];
      return {
        phase: 'before' as const,
        startsIn: (startMs - now) / 1000,
        first: first?.task,
      };
    }
    if (now >= serveMs) return { phase: 'done' as const };
    const active = windows.find(
      (w) => occupiesCook(w.task.kind) && w.startMs <= now && now < w.endMs,
    );
    if (active) {
      return {
        phase: 'cooking' as const,
        task: active.task,
        leftSec: (active.endMs - now) / 1000,
      };
    }
    const next = windows
      .filter((w) => occupiesCook(w.task.kind) && w.startMs > now)
      .sort((a, b) => a.startMs - b.startMs)[0];
    const cooking = windows.find(
      (w) => !occupiesCook(w.task.kind) && w.startMs <= now && now < w.endMs,
    );
    return {
      phase: 'waiting' as const,
      next: next ? { task: next.task, inSec: (next.startMs - now) / 1000 } : null,
      cooking: cooking?.task,
    };
  }, [now, startMs, serveMs, windows]);

  // --- Empty states (after all hooks — CLAUDE.md: hooks before early returns) ---

  if (!activePlan) {
    return (
      <CookShell>
        <CookEmpty
          title="No plan to cook"
          hint="Build a meal in the Planner first, then come back here to cook it."
          onOpen={() => setActiveSection('planner')}
        />
      </CookShell>
    );
  }
  if (!schedule || schedule.tasks.length === 0) {
    return (
      <CookShell>
        <CookEmpty
          title={`"${activePlan.name}" has no dishes yet`}
          hint="Add recipes to this plan in the Planner to see a timeline."
          onOpen={() => setActiveSection('planner')}
        />
      </CookShell>
    );
  }

  const started = activePlan.startedAt !== null;
  const planId = activePlan.id;
  const startCook = () =>
    updatePlan(planId, (p) => ({ ...p, startedAt: new Date().toISOString() }));
  const stopCook = () =>
    updatePlan(planId, (p) => ({ ...p, startedAt: null }));

  const colorFor = (recipeId: string) => {
    const i = lanes.findIndex((l) => l.recipeId === recipeId);
    return i >= 0 ? lineColor(i) : 'var(--color-text-muted)';
  };

  const ingredientsLine = (task: ScheduledTask) =>
    task.ingredients
      .map((ing) => {
        const q = ing.quantity > 0 ? `${Math.round(ing.quantity * 10) / 10} ` : '';
        return `${q}${ing.unit ? `${ing.unit} ` : ''}${ing.label}`.trim();
      })
      .join(', ');

  return (
    <div className="cook">
      <div className="cook__bar">
        <div className="cook__bar-main">
          {current.phase === 'unanchored' && (
            <>
              <div className="cook__bar-action">Ready when you are</div>
              <div className="cook__bar-sub">
                Press Start to begin — serve lands {formatCountdown(
                  schedule.totalDuration,
                )} later.
              </div>
            </>
          )}
          {current.phase === 'before' && (
            <>
              <div className="cook__bar-action">
                First up: {current.first?.label ?? 'getting ready'}
              </div>
              <div className="cook__bar-sub">
                Starts in {formatCountdown(current.startsIn)}
              </div>
            </>
          )}
          {current.phase === 'cooking' && (
            <>
              <div className="cook__bar-action">
                <span
                  className="cook__bar-dot"
                  style={{ background: colorFor(current.task.recipeId) }}
                />
                {current.task.label}
              </div>
              <div className="cook__bar-sub">
                {current.task.recipeTitle}
                {ingredientsLine(current.task)
                  ? ` · ${ingredientsLine(current.task)}`
                  : ''}
              </div>
            </>
          )}
          {current.phase === 'waiting' && (
            <>
              <div className="cook__bar-action">
                Hands free
                {current.cooking ? ` — ${current.cooking.label}` : ''}
              </div>
              <div className="cook__bar-sub">
                {current.next
                  ? `Next: ${current.next.task.label} in ${formatCountdown(
                      current.next.inSec,
                    )}`
                  : 'Nothing left to start — waiting on the last cook.'}
              </div>
            </>
          )}
          {current.phase === 'done' && (
            <>
              <div className="cook__bar-action">Served</div>
              <div className="cook__bar-sub">Everything should be ready.</div>
            </>
          )}
        </div>

        {current.phase === 'cooking' && (
          <div className="cook__bar-timer">
            <div className="cook__bar-timer-value">
              {formatCountdown(current.leftSec)}
            </div>
            <div className="cook__bar-timer-label">left</div>
          </div>
        )}

        <div className="cook__bar-controls">
          {started ? (
            <>
              <button type="button" className="cook-btn" onClick={startCook}>
                Restart
              </button>
              <button
                type="button"
                className="cook-btn cook-btn--ghost"
                onClick={stopCook}
              >
                Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cook-btn cook-btn--primary"
              onClick={startCook}
            >
              ▶ Start cook now
            </button>
          )}
        </div>
      </div>

      {schedule.cyclicRecipeIds.length > 0 && (
        <p className="cook__warn">
          {schedule.cyclicRecipeIds.length} recipe
          {schedule.cyclicRecipeIds.length === 1 ? '' : 's'} skipped — a loop in
          their task steps.
        </p>
      )}

      <div className="cook__canvas">
        <div className="cook__hud" aria-label="Serve stats">
          <div className="cook__hud-row">
            <span className="cook__hud-k">Serve</span>
            <span className="cook__hud-v">
              {serveMs !== null
                ? formatServeAt(new Date(serveMs).toISOString())
                : 'Not set'}
            </span>
          </div>
          <div className="cook__hud-row">
            <span className="cook__hud-k">Start</span>
            <span className="cook__hud-v">
              {startMs !== null
                ? formatServeAt(new Date(startMs).toISOString())
                : '—'}
            </span>
          </div>
          <div className="cook__hud-row">
            <span className="cook__hud-k">Total</span>
            <span className="cook__hud-v">
              {formatDuration(schedule.totalDuration)}
            </span>
          </div>
        </div>
        <TubeMap schedule={schedule} lanes={lanes} startMs={startMs} nowMs={now} />
      </div>
    </div>
  );
}

function CookShell({ children }: { children: ReactNode }) {
  return <div className="cook cook--empty">{children}</div>;
}

function CookEmpty({
  title,
  hint,
  onOpen,
}: {
  title: string;
  hint: string;
  onOpen: () => void;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__hint">{hint}</p>
      <button type="button" className="empty-state__action" onClick={onOpen}>
        Open Planner
      </button>
    </div>
  );
}
