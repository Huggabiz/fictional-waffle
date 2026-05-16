import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useRecipeById } from '../store/selectors';
import { RecipeView } from './RecipeView';
import './RecipeDetailModal.css';

export function RecipeDetailModal() {
  const recipeId = useAppStore((s) => s.viewingRecipeId);
  const setViewingRecipeId = useAppStore((s) => s.setViewingRecipeId);
  const toggleCookbook = useAppStore((s) => s.toggleCookbook);
  const recipe = useRecipeById(recipeId);
  const inCookbook = useAppStore((s) =>
    recipeId ? s.persisted.cookbookIds.includes(recipeId) : false,
  );

  // Esc to close. Listener attached conditionally but the hook itself always
  // runs, so hook order stays stable (CLAUDE.md: hooks before early returns).
  useEffect(() => {
    if (!recipeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewingRecipeId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [recipeId, setViewingRecipeId]);

  if (!recipe) return null;

  return (
    <div
      className="modal-backdrop"
      // onMouseDown (not onClick): the user can drag a text selection inside
      // the panel and release outside without closing the modal.
      onMouseDown={() => setViewingRecipeId(null)}
      role="presentation"
    >
      <div
        className="modal-panel"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={recipe.title}
      >
        <button
          type="button"
          className="modal-close"
          onClick={() => setViewingRecipeId(null)}
          aria-label="Close"
        >
          ✕
        </button>

        <RecipeView recipe={recipe} />

        <footer className="modal-footer">
          <button
            type="button"
            className={
              inCookbook
                ? 'modal-footer__action modal-footer__action--saved'
                : 'modal-footer__action'
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
