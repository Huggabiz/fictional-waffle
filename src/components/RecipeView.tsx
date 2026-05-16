import type { ReactNode } from 'react';
import type { Recipe, TaskKind } from '../types';
import { criticalPathSeconds, formatDuration } from '../lib/recipeMetrics';
import './RecipeView.css';

// The full recipe content — header, notes, ingredients, steps. Shared by the
// detail modal (Explore) and the inline panels in the Cookbook, so the two
// can't drift apart. The container supplies context-specific actions.

const KIND_LABEL: Record<TaskKind, string> = {
  prep: 'Prep',
  active: 'Active',
  passive: 'Passive',
  rest: 'Rest',
};

function formatQuantity(quantity: number, unit: string): string {
  if (quantity <= 0) return unit || '—';
  return unit ? `${quantity} ${unit}` : `${quantity}`;
}

interface RecipeViewProps {
  recipe: Recipe;
  /** Buttons/toggles rendered in the header's top-right. */
  headerActions?: ReactNode;
}

export function RecipeView({ recipe, headerActions }: RecipeViewProps) {
  const total = criticalPathSeconds(recipe);

  return (
    <article className="recipe-view">
      <header className="recipe-view__header">
        <div className="recipe-view__heading">
          <h2 className="recipe-view__title">{recipe.title}</h2>
          <div className="recipe-view__meta">
            <span>{formatDuration(total)}</span>
            <span>&middot;</span>
            <span>
              {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
            </span>
            <span>&middot;</span>
            <span>
              {recipe.tasks.length} step{recipe.tasks.length === 1 ? '' : 's'}
            </span>
            {recipe.source === 'builtin' && (
              <span className="recipe-view__badge">built-in</span>
            )}
          </div>
        </div>
        {headerActions && (
          <div className="recipe-view__actions">{headerActions}</div>
        )}
      </header>

      {recipe.notes && <p className="recipe-view__notes">{recipe.notes}</p>}

      <div className="recipe-view__columns">
        <section className="recipe-view__col">
          <h3 className="recipe-view__col-title">Ingredients</h3>
          {recipe.ingredients.length === 0 ? (
            <p className="recipe-view__placeholder">No ingredients listed.</p>
          ) : (
            <ul className="recipe-view__ingredients">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id}>
                  <span className="recipe-view__ingredient-qty">
                    {formatQuantity(ing.quantity, ing.unit)}
                  </span>
                  <span className="recipe-view__ingredient-label">
                    {ing.label}
                    {ing.notes && (
                      <span className="recipe-view__ingredient-notes">
                        {' '}
                        ({ing.notes})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="recipe-view__col">
          <h3 className="recipe-view__col-title">Steps</h3>
          {recipe.tasks.length === 0 ? (
            <p className="recipe-view__placeholder">No steps yet.</p>
          ) : (
            <ol className="recipe-view__tasks">
              {recipe.tasks.map((task) => (
                <li key={task.id} className="task">
                  <span className={`task__kind task__kind--${task.kind}`}>
                    {KIND_LABEL[task.kind]}
                  </span>
                  <span className="task__label">{task.label}</span>
                  <span className="task__duration">
                    {formatDuration(task.baselineSeconds)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </article>
  );
}
