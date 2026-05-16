import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAllRecipes } from '../store/selectors';
import { RecipeView } from '../components/RecipeView';
import './Section.css';
import './CookbookSection.css';

export function CookbookSection() {
  const cookbookIds = useAppStore((s) => s.persisted.cookbookIds);
  const plans = useAppStore((s) => s.persisted.plans);
  const activePlanId = useAppStore((s) => s.persisted.activePlanId);
  const profile = useAppStore((s) => s.persisted.profile);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const toggleCookbook = useAppStore((s) => s.toggleCookbook);
  const createPlan = useAppStore((s) => s.createPlan);
  const updatePlan = useAppStore((s) => s.updatePlan);
  const allRecipes = useAllRecipes();

  const saved = useMemo(() => {
    // Cookbook-added order, so the newest additions sit at the bottom.
    return cookbookIds
      .map((id) => allRecipes.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
  }, [cookbookIds, allRecipes]);

  const activePlan = plans.find((p) => p.id === activePlanId);

  function addToPlanner(recipeId: string) {
    let planId = activePlanId;
    if (!planId || !plans.some((p) => p.id === planId)) {
      planId = createPlan('Dinner');
    }
    updatePlan(planId, (p) =>
      p.entries.some((e) => e.recipeId === recipeId)
        ? p
        : {
            ...p,
            entries: [
              ...p.entries,
              { recipeId, servings: profile.defaultServings },
            ],
          },
    );
  }

  return (
    <section className="section section--wide">
      <header className="section__header">
        <h1 className="section__title">Cookbook</h1>
        <p className="section__subtitle">
          Recipes you&rsquo;ve saved, shown in full. Send one to the Planner when
          you&rsquo;re ready to cook.
        </p>
      </header>

      <div className="section__body">
        {saved.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">Nothing saved yet</p>
            <p className="empty-state__hint">
              Head to Explore to add some recipes to your cookbook.
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
          <div className="cookbook-list">
            {saved.map((recipe) => {
              const inPlanner = activePlan
                ? activePlan.entries.some((e) => e.recipeId === recipe.id)
                : false;
              return (
                <div key={recipe.id} className="cookbook-entry">
                  <RecipeView
                    recipe={recipe}
                    headerActions={
                      <>
                        <button
                          type="button"
                          className={
                            inPlanner
                              ? 'cookbook-btn cookbook-btn--done'
                              : 'cookbook-btn cookbook-btn--primary'
                          }
                          onClick={() => addToPlanner(recipe.id)}
                          disabled={inPlanner}
                        >
                          {inPlanner ? '✓ In planner' : 'Add to planner'}
                        </button>
                        <button
                          type="button"
                          className="cookbook-btn"
                          onClick={() => toggleCookbook(recipe.id)}
                        >
                          Remove
                        </button>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
