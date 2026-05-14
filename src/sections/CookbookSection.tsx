import { useAppStore } from '../store/useAppStore';
import './Section.css';

export function CookbookSection() {
  const cookbookIds = useAppStore((s) => s.persisted.cookbookIds);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Cookbook</h1>
        <p className="section__subtitle">
          Recipes you&rsquo;ve saved from Explore. Edit, duplicate, or send one to
          the Planner for tonight&rsquo;s meal.
        </p>
      </header>
      <div className="section__body">
        {cookbookIds.length === 0 ? (
          <p className="section__placeholder">
            Nothing here yet &mdash; head to Explore to add recipes.
          </p>
        ) : (
          <p className="section__placeholder">
            {cookbookIds.length} recipe{cookbookIds.length === 1 ? '' : 's'} saved.
            Detail view arrives in the next slice.
          </p>
        )}
      </div>
    </section>
  );
}
