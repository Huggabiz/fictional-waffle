import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePlanSchedule } from '../store/selectors';
import { formatDuration } from '../lib/recipeMetrics';
import { formatServeAt } from '../lib/planTime';
import { TubeMap } from '../components/TubeMap';
import './Section.css';
import './CookSection.css';

const TICK_MS = 1_000; // the now-line should creep smoothly

export function CookSection() {
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const updatePlan = useAppStore((s) => s.updatePlan);

  // The now-line ticks; re-projection when the cook falls behind comes later.
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

  const status = useMemo(() => {
    if (startMs === null || serveMs === null) return null;
    if (now < startMs)
      return `Starts in ${formatDuration((startMs - now) / 1000)}`;
    if (now > serveMs) return 'Serve time has passed';
    return 'Cook in progress';
  }, [now, startMs, serveMs]);

  // --- Empty states (after all hooks — CLAUDE.md: hooks before early returns) ---

  if (!activePlan) {
    return (
      <CookShell>
        <div className="empty-state">
          <p className="empty-state__title">No plan to cook</p>
          <p className="empty-state__hint">
            Build a meal in the Planner first, then come back here to cook it.
          </p>
          <button
            type="button"
            className="empty-state__action"
            onClick={() => setActiveSection('planner')}
          >
            Open Planner
          </button>
        </div>
      </CookShell>
    );
  }

  if (!schedule || schedule.tasks.length === 0) {
    return (
      <CookShell>
        <div className="empty-state">
          <p className="empty-state__title">
            &ldquo;{activePlan.name}&rdquo; has no dishes yet
          </p>
          <p className="empty-state__hint">
            Add recipes to this plan in the Planner to see a timeline.
          </p>
          <button
            type="button"
            className="empty-state__action"
            onClick={() => setActiveSection('planner')}
          >
            Open Planner
          </button>
        </div>
      </CookShell>
    );
  }

  const started = activePlan.startedAt !== null;
  const planId = activePlan.id;
  const startCook = () =>
    updatePlan(planId, (p) => ({ ...p, startedAt: new Date().toISOString() }));
  const stopCook = () =>
    updatePlan(planId, (p) => ({ ...p, startedAt: null }));

  return (
    <CookShell>
      <div className="cook-readout">
        <div>
          <div className="cook-readout__label">Plan</div>
          <div className="cook-readout__value">{activePlan.name}</div>
        </div>
        <div>
          <div className="cook-readout__label">Start cooking</div>
          <div className="cook-readout__value">
            {startMs !== null
              ? formatServeAt(new Date(startMs).toISOString())
              : '—'}
          </div>
        </div>
        <div>
          <div className="cook-readout__label">Serve</div>
          <div className="cook-readout__value">
            {serveMs !== null
              ? formatServeAt(new Date(serveMs).toISOString())
              : 'Not set'}
          </div>
        </div>
        <div>
          <div className="cook-readout__label">Total</div>
          <div className="cook-readout__value">
            {formatDuration(schedule.totalDuration)}
          </div>
        </div>
      </div>

      <div className="cook-controls">
        {started ? (
          <>
            <span className="cook-controls__state">
              Cooking — started {formatServeAt(activePlan.startedAt)}
            </span>
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

      {status && <p className="cook-status">{status}</p>}

      {startMs === null && (
        <p className="cook-note">
          The timeline below is relative — set a serve time in the Planner, or
          press &ldquo;Start cook now&rdquo; to anchor it to the clock.
        </p>
      )}

      {schedule.cyclicRecipeIds.length > 0 && (
        <p className="cook-warning">
          {schedule.cyclicRecipeIds.length} recipe
          {schedule.cyclicRecipeIds.length === 1 ? '' : 's'} skipped — their
          task steps depend on each other in a loop.
        </p>
      )}

      <TubeMap
        schedule={schedule}
        lanes={lanes}
        startMs={startMs}
        nowMs={now}
      />
    </CookShell>
  );
}

function CookShell({ children }: { children: ReactNode }) {
  return (
    <section className="section section--wide">
      <header className="section__header">
        <h1 className="section__title">Cook</h1>
        <p className="section__subtitle">
          Your plan as a tube map — each dish a line, each task a length of
          track, each station an instruction. The now-line creeps toward serve.
        </p>
      </header>
      <div className="section__body">{children}</div>
    </section>
  );
}
