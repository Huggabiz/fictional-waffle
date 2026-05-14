import type { Recipe } from '../types';
import { useAppStore } from '../store/useAppStore';
import { criticalPathSeconds, formatDuration } from '../lib/recipeMetrics';
import './RecipeCard.css';

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const inCookbook = useAppStore((s) => s.persisted.cookbookIds.includes(recipe.id));
  const toggleCookbook = useAppStore((s) => s.toggleCookbook);
  const setViewingRecipeId = useAppStore((s) => s.setViewingRecipeId);

  const total = criticalPathSeconds(recipe);

  return (
    <article className="recipe-card">
      <button
        type="button"
        className="recipe-card__body"
        onClick={() => setViewingRecipeId(recipe.id)}
        aria-label={`View ${recipe.title}`}
      >
        <h3 className="recipe-card__title">{recipe.title}</h3>
        <div className="recipe-card__meta">
          <span>{formatDuration(total)}</span>
          <span>&middot;</span>
          <span>
            {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
          </span>
          <span>&middot;</span>
          <span>
            {recipe.tasks.length} step{recipe.tasks.length === 1 ? '' : 's'}
          </span>
        </div>
        {recipe.notes && <p className="recipe-card__notes">{recipe.notes}</p>}
      </button>
      <div className="recipe-card__actions">
        <button
          type="button"
          className={
            inCookbook
              ? 'recipe-card__toggle recipe-card__toggle--saved'
              : 'recipe-card__toggle'
          }
          onClick={() => toggleCookbook(recipe.id)}
          aria-pressed={inCookbook}
        >
          {inCookbook ? '✓ In cookbook' : '+ Add to cookbook'}
        </button>
      </div>
    </article>
  );
}
