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

const TICK_MS = 1_000;

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
  const profile = useAppStore((s) => s.persisted.profile);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setProfile = useAppStore((s) => s.setProfile);
  const updatePlan = useAppStore((s) => s.updatePlan);

  const [realNow, setRealNow] = useState(() => Date.now());
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setRealNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const activePlan = useMemo(
    () => plans.find((p) => p.id === activePlanId),
    [plans, activePlanId],
  );

  const { schedule, lanes, startMs, serveMs } = usePlanSchedule(activePlan);

  const autoAdvance = profile.autoAdvance;
  const started = activePlan?.startedAt != null;
  const pausedAt = activePlan?.pausedAt ?? null;
  const manualStep = activePlan?.manualStep ?? 0;

  // The single-cook sequence — the hands-on tasks, in cooking order.
  // Every scheduled step is a stop point in manual mode — including
  // passive ones like "oven preheats" or "rest the dough". The cook is
  // told to acknowledge each before moving on; nothing is skipped.
  const handsOn = useMemo(
    () =>
      schedule
        ? [...schedule.tasks].sort((a, b) => a.startOffset - b.startOffset)
        : [],
    [schedule],
  );

  // Effective "now": the clock in auto mode (frozen while paused). In manual
  // mode it still moves with the clock — so the cook sees the time the step
  // should take — but clamps at the end of the step's window and waits there
  // for Next, so the recipe never gets ahead of the cook.
  const effectiveNow = useMemo(() => {
    if (!started || startMs === null) return realNow;
    if (!autoAdvance) {
      if (manualStep >= handsOn.length) return serveMs ?? realNow;
      const step = handsOn[manualStep];
      const stepStart = activePlan?.stepStartedAt
        ? Date.parse(activePlan.stepStartedAt)
        : realNow;
      const elapsed = Math.min(
        Math.max(0, (realNow - stepStart) / 1000),
        step.duration,
      );
      return startMs + (step.startOffset + elapsed) * 1000;
    }
    if (pausedAt) {
      const p = Date.parse(pausedAt);
      if (!Number.isNaN(p)) return p;
    }
    return realNow;
  }, [
    started,
    startMs,
    serveMs,
    autoAdvance,
    manualStep,
    handsOn,
    pausedAt,
    realNow,
    activePlan,
  ]);

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
    if (!autoAdvance) {
      if (manualStep >= handsOn.length) return { phase: 'done' as const };
      const task = handsOn[manualStep];
      const stepStart = activePlan?.stepStartedAt
        ? Date.parse(activePlan.stepStartedAt)
        : realNow;
      const elapsed = Math.max(0, (realNow - stepStart) / 1000);
      return {
        phase: 'manual' as const,
        task,
        step: manualStep + 1,
        steps: handsOn.length,
        leftSec: task.duration - elapsed,
      };
    }
    if (effectiveNow < startMs) {
      const first = [...windows]
        .filter((w) => occupiesCook(w.task.kind))
        .sort((a, b) => a.startMs - b.startMs)[0];
      return {
        phase: 'before' as const,
        startsIn: (startMs - effectiveNow) / 1000,
        first: first?.task,
      };
    }
    if (effectiveNow >= serveMs) return { phase: 'done' as const };
    const active = windows.find(
      (w) =>
        occupiesCook(w.task.kind) &&
        w.startMs <= effectiveNow &&
        effectiveNow < w.endMs,
    );
    if (active) {
      return {
        phase: 'cooking' as const,
        task: active.task,
        leftSec: (active.endMs - effectiveNow) / 1000,
      };
    }
    const next = windows
      .filter((w) => occupiesCook(w.task.kind) && w.startMs > effectiveNow)
      .sort((a, b) => a.startMs - b.startMs)[0];
    const cooking = windows.find(
      (w) =>
        !occupiesCook(w.task.kind) &&
        w.startMs <= effectiveNow &&
        effectiveNow < w.endMs,
    );
    return {
      phase: 'waiting' as const,
      next: next
        ? { task: next.task, inSec: (next.startMs - effectiveNow) / 1000 }
        : null,
      cooking: cooking?.task,
    };
  }, [
    autoAdvance,
    manualStep,
    handsOn,
    effectiveNow,
    startMs,
    serveMs,
    windows,
    activePlan,
    realNow,
  ]);

  // The task the canvas should centre on — it re-centres when this changes
  // (a Next press, or an auto-advance), while leaving free scrolling alone.
  const focusTaskId = useMemo(() => {
    if (current.phase === 'cooking' || current.phase === 'manual') {
      return `${current.task.recipeId}::${current.task.taskId}`;
    }
    if (current.phase === 'waiting' && current.next) {
      return `${current.next.task.recipeId}::${current.next.task.taskId}`;
    }
    if (current.phase === 'before' && current.first) {
      return `${current.first.recipeId}::${current.first.taskId}`;
    }
    return null;
  }, [current]);

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

  const planId = activePlan.id;
  const nowIso = () => new Date().toISOString();
  const startCook = () =>
    updatePlan(planId, (p) => ({
      ...p,
      startedAt: nowIso(),
      pausedAt: null,
      manualStep: 0,
      stepStartedAt: nowIso(),
      actuals: [],
    }));
  const stopCook = () =>
    updatePlan(planId, (p) => ({
      ...p,
      startedAt: null,
      pausedAt: null,
      manualStep: 0,
      stepStartedAt: null,
      actuals: [],
    }));
  const pauseCook = () =>
    updatePlan(planId, (p) => ({ ...p, pausedAt: nowIso() }));
  const resumeCook = () =>
    updatePlan(planId, (p) => {
      if (!p.startedAt || !p.pausedAt) return p;
      const shift = Date.now() - Date.parse(p.pausedAt);
      return {
        ...p,
        startedAt: new Date(Date.parse(p.startedAt) + shift).toISOString(),
        pausedAt: null,
      };
    });
  // Advancing records how long the step just finished actually took, so the
  // cook's pace at that task can inform their proficiency later.
  const goNext = () =>
    updatePlan(planId, (p) => {
      const step = p.manualStep ?? 0;
      if (step >= handsOn.length) return p;
      const done = handsOn[step];
      const startedAtMs = p.stepStartedAt
        ? Date.parse(p.stepStartedAt)
        : Date.now();
      const actual = {
        recipeId: done.recipeId,
        taskId: done.taskId,
        expectedSeconds: Math.round(done.duration),
        actualSeconds: Math.max(
          0,
          Math.round((Date.now() - startedAtMs) / 1000),
        ),
      };
      return {
        ...p,
        manualStep: Math.min(step + 1, handsOn.length),
        stepStartedAt: nowIso(),
        actuals: [...p.actuals, actual],
      };
    });
  const goPrev = () =>
    updatePlan(planId, (p) => {
      const step = p.manualStep ?? 0;
      if (step <= 0) return p;
      return {
        ...p,
        manualStep: step - 1,
        stepStartedAt: nowIso(),
        actuals: p.actuals.slice(0, -1),
      };
    });

  const setMode = (auto: boolean) => {
    if (auto === autoAdvance) return;
    setProfile({ ...profile, autoAdvance: auto });
    if (!auto && started && startMs !== null) {
      // Entering manual — land on the task that's current right now.
      let step = handsOn.length;
      for (let i = 0; i < handsOn.length; i++) {
        const endAt =
          startMs + (handsOn[i].startOffset + handsOn[i].duration) * 1000;
        if (realNow < endAt) {
          step = i;
          break;
        }
      }
      updatePlan(planId, (p) => ({
        ...p,
        manualStep: step,
        pausedAt: null,
        stepStartedAt: nowIso(),
      }));
    }
  };

  const paused = pausedAt !== null && autoAdvance;
  const colorFor = (recipeId: string) => {
    const i = lanes.findIndex((l) => l.recipeId === recipeId);
    return i >= 0 ? lineColor(i) : 'var(--color-text-muted)';
  };
  const ingredientsLine = (task: ScheduledTask) =>
    task.ingredients
      .map((ing) => {
        const q =
          ing.quantity > 0 ? `${Math.round(ing.quantity * 10) / 10} ` : '';
        return `${q}${ing.unit ? `${ing.unit} ` : ''}${ing.label}`.trim();
      })
      .join(', ');

  return (
    <div className="cook">
      <header className="cook__header" aria-label="Serve stats">
        <span className="cook__header-pill">
          <span className="cook__header-k">Start</span>
          <span className="cook__header-v">
            {startMs !== null
              ? formatServeAt(new Date(startMs).toISOString())
              : '—'}
          </span>
        </span>
        <span className="cook__header-pill">
          <span className="cook__header-k">Serve</span>
          <span className="cook__header-v">
            {serveMs !== null
              ? formatServeAt(new Date(serveMs).toISOString())
              : 'Not set'}
          </span>
        </span>
        <span className="cook__header-pill">
          <span className="cook__header-k">Total</span>
          <span className="cook__header-v">
            {formatDuration(schedule.totalDuration)}
          </span>
        </span>
      </header>
      <div className="cook__canvas">
        <TubeMap
          schedule={schedule}
          lanes={lanes}
          startMs={startMs}
          nowMs={effectiveNow}
          focusTaskId={focusTaskId}
        />
      </div>

      {schedule.cyclicRecipeIds.length > 0 && (
        <p className="cook__warn">
          {schedule.cyclicRecipeIds.length} recipe
          {schedule.cyclicRecipeIds.length === 1 ? '' : 's'} skipped — a loop in
          their task steps.
        </p>
      )}

      {/* Current-step bar — pinned to the bottom, nearest the thumb. */}
      <div className="cook__bar">
        <div className="cook__bar-main">
          {current.phase === 'unanchored' && (
            <>
              <div className="cook__bar-action">Ready when you are</div>
              <div className="cook__bar-sub">
                Press Start — serve lands{' '}
                {formatCountdown(schedule.totalDuration)} later.
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
          {(current.phase === 'cooking' || current.phase === 'manual') && (
            <>
              <div className="cook__bar-action">
                <span
                  className="cook__bar-dot"
                  style={{ background: colorFor(current.task.recipeId) }}
                />
                {current.task.label}
                {paused && <span className="cook__paused-tag">paused</span>}
              </div>
              <div className="cook__bar-sub">
                {current.phase === 'manual'
                  ? `Step ${current.step} of ${current.steps} · `
                  : ''}
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
            <div className="cook__bar-timer-label">
              {paused ? 'paused' : 'left'}
            </div>
          </div>
        )}
        {current.phase === 'manual' && (
          <div className="cook__bar-timer">
            <div
              className={
                current.leftSec >= 0
                  ? 'cook__bar-timer-value'
                  : 'cook__bar-timer-value cook__bar-timer-value--over'
              }
            >
              {formatCountdown(Math.abs(current.leftSec))}
            </div>
            <div className="cook__bar-timer-label">
              {current.leftSec >= 0 ? 'left' : 'over'}
            </div>
          </div>
        )}

        {!autoAdvance && started && (
          <div className="cook__steps">
            {manualStep > 0 && (
              <button
                type="button"
                className="cook__prev"
                onClick={goPrev}
                aria-label="Back a step"
              >
                ← Prev
              </button>
            )}
            {manualStep < handsOn.length && (
              <button type="button" className="cook__next" onClick={goNext}>
                Next →
              </button>
            )}
          </div>
        )}

        {!started && (
          <button
            type="button"
            className="cook-btn cook-btn--primary"
            onClick={startCook}
          >
            ▶ Start cook now
          </button>
        )}
        {started && autoAdvance && (
          <button
            type="button"
            className="cook-btn"
            onClick={paused ? resumeCook : pauseCook}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}

        {/* Restart, Stop and the Auto/Manual switch tuck behind the expander. */}
        <div className="cook__more">
          <button
            type="button"
            className="cook__more-btn"
            aria-label="More controls"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            ⋯
          </button>
          {showMore && (
            <div className="cook__more-panel">
              <div className="cook__more-row">
                <span className="cook__more-label">Flow</span>
                <div
                  className="cook__mode"
                  role="radiogroup"
                  aria-label="Cook flow"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={autoAdvance}
                    className={
                      autoAdvance
                        ? 'cook__mode-opt cook__mode-opt--on'
                        : 'cook__mode-opt'
                    }
                    onClick={() => setMode(true)}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!autoAdvance}
                    className={
                      !autoAdvance
                        ? 'cook__mode-opt cook__mode-opt--on'
                        : 'cook__mode-opt'
                    }
                    onClick={() => setMode(false)}
                  >
                    Manual
                  </button>
                </div>
              </div>
              {started && (
                <div className="cook__more-row">
                  <button
                    type="button"
                    className="cook-btn"
                    onClick={startCook}
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    className="cook-btn cook-btn--ghost"
                    onClick={stopCook}
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
