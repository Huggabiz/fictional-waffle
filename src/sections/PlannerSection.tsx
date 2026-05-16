import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAllRecipes } from '../store/selectors';
import { PlanComposer } from '../components/PlanComposer';
import { RecipeCard } from '../components/RecipeCard';
import type { MealPlan } from '../types';
import '../components/RecipeGrid.css';
import './Section.css';

export function PlannerSection() {
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const cookbookIds = useAppStore((s) => s.persisted.cookbookIds);
  const profile = useAppStore((s) => s.persisted.profile);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const createPlan = useAppStore((s) => s.createPlan);
  const updatePlan = useAppStore((s) => s.updatePlan);

  const allRecipes = useAllRecipes();

  const recipesById = useMemo(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );

  const activePlan: MealPlan | undefined = useMemo(
    () => plans.find((p) => p.id === activePlanId),
    [plans, activePlanId],
  );

  const cookbookRecipes = useMemo(
    () =>
      cookbookIds
        .map((id) => recipesById.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    [cookbookIds, recipesById],
  );

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Planner</h1>
        <p className="section__subtitle">
          Compose a meal: pick recipes from your cookbook and set a serve time.
          The full scheduler (merged DAG, single-cook constraint) lands next.
        </p>
      </header>

      <div className="section__body">
        {!activePlan ? (
          <div className="empty-state">
            <p className="empty-state__title">No active plan</p>
            <p className="empty-state__hint">
              Start a plan to begin composing tonight&rsquo;s meal.
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
          <PlanComposer plan={activePlan} recipesById={recipesById} />
        )}

        {activePlan && activePlan.entries.length > 0 && (
          <div className="planner-cook-cta">
            <button
              type="button"
              className="empty-state__action"
              onClick={() => setActiveSection('cook')}
            >
              Cook this plan →
            </button>
          </div>
        )}

        {activePlan && (
          <>
            <h2 className="section__sub-title">Add from your cookbook</h2>
            {cookbookRecipes.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">Cookbook is empty</p>
                <p className="empty-state__hint">
                  Save some recipes from Explore first.
                </p>
                <button
                  type="button"
                  className="empty-state__action"
                  onClick={() => setActiveSection('explore')}
                >
                  Open Explore
                </button>
              </div>
            ) : (
              <div className="recipe-grid">
                {cookbookRecipes.map((r) => {
                  const inPlan = activePlan.entries.some(
                    (e) => e.recipeId === r.id,
                  );
                  return (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      footer={
                        <button
                          type="button"
                          className={
                            inPlan
                              ? 'recipe-card__toggle recipe-card__toggle--saved'
                              : 'recipe-card__toggle'
                          }
                          aria-pressed={inPlan}
                          onClick={() =>
                            updatePlan(activePlan.id, (p) =>
                              inPlan
                                ? {
                                    ...p,
                                    entries: p.entries.filter(
                                      (e) => e.recipeId !== r.id,
                                    ),
                                  }
                                : {
                                    ...p,
                                    entries: [
                                      ...p.entries,
                                      {
                                        recipeId: r.id,
                                        servings: profile.defaultServings,
                                      },
                                    ],
                                  },
                            )
                          }
                        >
                          {inPlan ? '✓ In plan' : '+ Add to plan'}
                        </button>
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
