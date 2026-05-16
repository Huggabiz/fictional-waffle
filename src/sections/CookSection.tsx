import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAllRecipes } from '../store/selectors';
import { buildSchedule } from '../lib/scheduler';
import { formatDuration } from '../lib/recipeMetrics';
import { formatServeAt } from '../lib/planTime';
import { Timeline } from '../components/Timeline';
import type { TaskKind } from '../types';
import './Section.css';
import './CookSection.css';

const TICK_MS = 30_000;

const KIND_LEGEND: { kind: TaskKind; label: string }[] = [
  { kind: 'prep', label: 'Prep' },
  { kind: 'active', label: 'Active cooking' },
  { kind: 'passive', label: 'Passive (hands-free)' },
  { kind: 'rest', label: 'Rest' },
];

export function CookSection() {
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const profile = useAppStore((s) => s.persisted.profile);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const allRecipes = useAllRecipes();

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

  const recipesById = useMemo(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );

  const schedule = useMemo(
    () => (activePlan ? buildSchedule(activePlan, recipesById, profile) : null),
    [activePlan, recipesById, profile],
  );

  const lanes = useMemo(() => {
    if (!activePlan || !schedule) return [];
    const cyclic = new Set(schedule.cyclicRecipeIds);
    return activePlan.entries
      .map((e) => recipesById.get(e.recipeId))
      .filter(
        (r): r is NonNullable<typeof r> => Boolean(r) && !cyclic.has(r!.id),
      )
      .map((r) => ({ recipeId: r.id, title: r.title }));
  }, [activePlan, schedule, recipesById]);

  const serveMs = activePlan?.serveAt
    ? new Date(activePlan.serveAt).getTime()
    : null;
  const startMs =
    serveMs !== null && schedule
      ? serveMs - schedule.totalDuration * 1000
      : null;

  const conflictSeconds = schedule
    ? schedule.conflicts.reduce(
        (sum, c) => sum + (c.endOffset - c.startOffset),
        0,
      )
    : 0;

  const status = useMemo(() => {
    if (startMs === null || serveMs === null) return null;
    if (now < startMs) return `Starts in ${formatDuration((startMs - now) / 1000)}`;
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
            {startMs !== null ? formatServeAt(new Date(startMs).toISOString()) : '—'}
          </div>
        </div>
        <div>
          <div className="cook-readout__label">Serve</div>
          <div className="cook-readout__value">
            {formatServeAt(activePlan.serveAt)}
          </div>
        </div>
        <div>
          <div className="cook-readout__label">Total</div>
          <div className="cook-readout__value">
            {formatDuration(schedule.totalDuration)}
          </div>
        </div>
      </div>

      {status && <p className="cook-status">{status}</p>}

      {activePlan.serveAt === null && (
        <p className="cook-note">
          No serve time set — the timeline below is relative. Set one in the
          Planner to anchor it to the clock and show the now-line.
        </p>
      )}

      {schedule.cyclicRecipeIds.length > 0 && (
        <p className="cook-warning">
          {schedule.cyclicRecipeIds.length} recipe
          {schedule.cyclicRecipeIds.length === 1 ? '' : 's'} skipped — their task
          steps depend on each other in a loop.
        </p>
      )}

      {schedule.conflicts.length > 0 && (
        <p className="cook-warning">
          Cook double-booked for ~{formatDuration(conflictSeconds)} total. v0
          schedules every task as late as possible; interleaving prep into
          hands-free gaps to clear these conflicts is the next step.
        </p>
      )}

      <Timeline schedule={schedule} lanes={lanes} startMs={startMs} nowMs={now} />

      <ul className="cook-legend">
        {KIND_LEGEND.map((item) => (
          <li key={item.kind} className="cook-legend__item">
            <span className={`cook-legend__swatch cook-legend__swatch--${item.kind}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </CookShell>
  );
}

function CookShell({ children }: { children: ReactNode }) {
  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Cook</h1>
        <p className="section__subtitle">
          Your plan as one merged timeline — dishes stacked as lanes, the
          now-line creeping toward serve time.
        </p>
      </header>
      <div className="section__body">{children}</div>
    </section>
  );
}
