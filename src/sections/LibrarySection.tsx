import { useAppStore } from '../store/useAppStore';
import './Section.css';

export function LibrarySection() {
  const recipes = useAppStore((s) => s.persisted.recipes);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Library</h1>
        <p className="section__subtitle">
          Recipes are stored as task graphs &mdash; nodes are prep / active / passive /
          rest steps, edges are dependencies. The library is empty until we add the
          authoring UI.
        </p>
      </header>
      <div className="section__body">
        {recipes.length === 0 ? (
          <p className="section__placeholder">No recipes yet.</p>
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
