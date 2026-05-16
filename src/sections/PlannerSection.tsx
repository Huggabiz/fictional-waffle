import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAllRecipes, usePlanSchedule } from '../store/selectors';
import { PlanComposer } from '../components/PlanComposer';
import { PlanSummary } from '../components/PlanSummary';
import type { MealPlan } from '../types';
import './Section.css';

export function PlannerSection() {
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const createPlan = useAppStore((s) => s.createPlan);

  const allRecipes = useAllRecipes();

  const recipesById = useMemo(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );

  const activePlan: MealPlan | undefined = useMemo(
    () => plans.find((p) => p.id === activePlanId),
    [plans, activePlanId],
  );

  const { schedule, lanes, startMs } = usePlanSchedule(activePlan);

  return (
    <section className="section section--wide">
      <header className="section__header">
        <h1 className="section__title">Planner</h1>
        <p className="section__subtitle">
          Pull a meal together from your cookbook recipes, then say when you
          want to serve it. The preview is the same tube map you&rsquo;ll cook
          from.
        </p>
      </header>

      <div className="section__body">
        {!activePlan ? (
          <div className="empty-state">
            <p className="empty-state__title">No active plan</p>
            <p className="empty-state__hint">
              Start a plan, then add recipes to it from your Cookbook.
            </p>
            <button
              type="button"
              className="empty-state__action"
              onClick={() => createPlan('Dinner')}
            >
              Start a plan
            </button>
          </div>
        ) : (
          <>
            <PlanComposer plan={activePlan} recipesById={recipesById} />

            {activePlan.entries.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">This plan is empty</p>
                <p className="empty-state__hint">
                  Open your Cookbook and use &ldquo;Add to planner&rdquo; on the
                  recipes you want to cook.
                </p>
                <button
                  type="button"
                  className="empty-state__action"
                  onClick={() => setActiveSection('cookbook')}
                >
                  Open Cookbook
                </button>
              </div>
            ) : (
              <>
                {schedule && schedule.tasks.length > 0 && (
                  <PlanSummary
                    schedule={schedule}
                    lanes={lanes}
                    startMs={startMs}
                    nowMs={Date.now()}
                  />
                )}
                <div className="planner-cook-cta">
                  <button
                    type="button"
                    className="empty-state__action"
                    onClick={() => setActiveSection('cook')}
                  >
                    Cook this plan →
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
