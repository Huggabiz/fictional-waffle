import { useAllRecipes } from '../store/selectors';
import { RecipeCard } from '../components/RecipeCard';
import '../components/RecipeGrid.css';
import './Section.css';

export function ExploreSection() {
  const recipes = useAllRecipes();

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Explore</h1>
        <p className="section__subtitle">
          Browse the recipe catalogue. Tap a card for the full recipe, or save one
          to your cookbook to plan a meal around it.
        </p>
      </header>
      <div className="section__body">
        {recipes.length === 0 ? (
          <p className="section__placeholder">Catalogue is empty.</p>
        ) : (
          <div className="recipe-grid">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
