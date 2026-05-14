import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAllRecipes } from '../store/selectors';
import { RecipeCard } from '../components/RecipeCard';
import '../components/RecipeGrid.css';
import './Section.css';

export function CookbookSection() {
  const cookbookIds = useAppStore((s) => s.persisted.cookbookIds);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const allRecipes = useAllRecipes();

  const saved = useMemo(() => {
    const idSet = new Set(cookbookIds);
    // Preserve cookbook order (the order the user added them) rather than the
    // catalogue order, so the most-recent additions are easy to find at the end.
    return cookbookIds
      .map((id) => allRecipes.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r) && idSet.has(r!.id));
  }, [cookbookIds, allRecipes]);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Cookbook</h1>
        <p className="section__subtitle">
          Recipes you&rsquo;ve saved from Explore. Send one to the Planner when
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
          <div className="recipe-grid">
            {saved.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
