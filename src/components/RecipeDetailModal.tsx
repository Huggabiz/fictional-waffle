import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useRecipeById } from '../store/selectors';
import { criticalPathSeconds, formatDuration } from '../lib/recipeMetrics';
import type { TaskKind } from '../types';
import './RecipeDetailModal.css';

const KIND_LABEL: Record<TaskKind, string> = {
  prep: 'Prep',
  active: 'Active',
  passive: 'Passive',
  rest: 'Rest',
};

function formatQuantity(quantity: number, unit: string): string {
  if (quantity <= 0) return unit || '—';
  // Drop trailing zeros: 0.5 → "0.5", 200 → "200".
  const q = Number.isInteger(quantity) ? quantity.toString() : quantity.toString();
  return unit ? `${q} ${unit}` : q;
}

export function RecipeDetailModal() {
  const recipeId = useAppStore((s) => s.viewingRecipeId);
  const setViewingRecipeId = useAppStore((s) => s.setViewingRecipeId);
  const toggleCookbook = useAppStore((s) => s.toggleCookbook);
  const recipe = useRecipeById(recipeId);
  const inCookbook = useAppStore((s) =>
    recipeId ? s.persisted.cookbookIds.includes(recipeId) : false,
  );

  // Esc to close. Keep the listener attached regardless of recipeId so the
  // hook order is stable (CLAUDE.md: hooks before early returns).
  useEffect(() => {
    if (!recipeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewingRecipeId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [recipeId, setViewingRecipeId]);

  if (!recipe) return null;

  const total = criticalPathSeconds(recipe);

  return (
    <div
      className="modal-backdrop"
      // onMouseDown (not onClick): the user can drag a text selection inside
      // the panel and release outside without closing the modal.
      onMouseDown={() => setViewingRecipeId(null)}
      role="presentation"
    >
      <div
        className="modal-panel recipe-detail"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-detail-title"
      >
        <header className="recipe-detail__header">
          <div>
            <h2 id="recipe-detail-title" className="recipe-detail__title">
              {recipe.title}
            </h2>
            <div className="recipe-detail__meta">
              <span>{formatDuration(total)}</span>
              <span>&middot;</span>
              <span>
                {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
              </span>
              {recipe.source === 'builtin' && (
                <>
                  <span>&middot;</span>
                  <span className="recipe-detail__badge">built-in</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className="recipe-detail__close"
            onClick={() => setViewingRecipeId(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {recipe.notes && (
          <p className="recipe-detail__notes">{recipe.notes}</p>
        )}

        <div className="recipe-detail__columns">
          <section className="recipe-detail__col">
            <h3 className="recipe-detail__heading">Ingredients</h3>
            {recipe.ingredients.length === 0 ? (
              <p className="recipe-detail__placeholder">No ingredients listed.</p>
            ) : (
              <ul className="recipe-detail__ingredients">
                {recipe.ingredients.map((ing) => (
                  <li key={ing.id}>
                    <span className="recipe-detail__ingredient-qty">
                      {formatQuantity(ing.quantity, ing.unit)}
                    </span>
                    <span className="recipe-detail__ingredient-label">
                      {ing.label}
                      {ing.notes && (
                        <span className="recipe-detail__ingredient-notes">
                          {' '}({ing.notes})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="recipe-detail__col">
            <h3 className="recipe-detail__heading">Steps</h3>
            {recipe.tasks.length === 0 ? (
              <p className="recipe-detail__placeholder">No steps yet.</p>
            ) : (
              <ol className="recipe-detail__tasks">
                {recipe.tasks.map((task) => (
                  <li key={task.id} className={`task task--${task.kind}`}>
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
            <p className="recipe-detail__hint">
              Task dependencies form a graph; the timeline view renders it
              left-to-right when you add this to a plan.
            </p>
          </section>
        </div>

        <footer className="recipe-detail__footer">
          <button
            type="button"
            className={
              inCookbook
                ? 'recipe-detail__action recipe-detail__action--saved'
                : 'recipe-detail__action'
            }
            onClick={() => toggleCookbook(recipe.id)}
            aria-pressed={inCookbook}
          >
            {inCookbook ? '✓ In cookbook' : '+ Add to cookbook'}
          </button>
        </footer>
      </div>
    </div>
  );
}
