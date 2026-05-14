import { useAppStore } from '../store/useAppStore';
import './Section.css';

export function ExploreSection() {
  const recipes = useAppStore((s) => s.persisted.recipes);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Explore</h1>
        <p className="section__subtitle">
          Browse the recipe catalogue. Tap a recipe to add it to your cookbook,
          then plan a meal around it.
        </p>
      </header>
      <div className="section__body">
        {recipes.length === 0 ? (
          <p className="section__placeholder">
            Catalogue is empty. Seed recipes arrive in the next slice.
          </p>
        ) : (
          <ul className="recipe-list">
            {recipes.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong> &middot; {r.tasks.length} tasks &middot;{' '}
                {r.servings} serving{r.servings === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
