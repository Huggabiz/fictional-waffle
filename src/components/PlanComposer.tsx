import { useMemo } from 'react';
import type { MealPlan, Recipe } from '../types';
import { useAppStore } from '../store/useAppStore';
import { criticalPathSeconds, formatDuration } from '../lib/recipeMetrics';
import { formatServeAt, isoFromTimeInput, timeInputValue } from '../lib/planTime';
import './PlanComposer.css';

interface PlanComposerProps {
  plan: MealPlan;
  recipesById: Map<string, Recipe>;
}

export function PlanComposer({ plan, recipesById }: PlanComposerProps) {
  const updatePlan = useAppStore((s) => s.updatePlan);
  const setViewingRecipeId = useAppStore((s) => s.setViewingRecipeId);

  // Sum of critical-paths is a crude over-estimate (assumes you cook one
  // dish at a time end-to-end). Once the real scheduler lands it'll replace
  // this with merged-DAG duration accounting for parallelism.
  const longestSingle = useMemo(() => {
    let max = 0;
    for (const entry of plan.entries) {
      const r = recipesById.get(entry.recipeId);
      if (!r) continue;
      const cp = criticalPathSeconds(r);
      if (cp > max) max = cp;
    }
    return max;
  }, [plan.entries, recipesById]);

  const earliestStartIso = useMemo(() => {
    if (!plan.serveAt || longestSingle === 0) return null;
    const serve = new Date(plan.serveAt).getTime();
    if (Number.isNaN(serve)) return null;
    return new Date(serve - longestSingle * 1000).toISOString();
  }, [plan.serveAt, longestSingle]);

  return (
    <div className="plan-composer">
      <div className="plan-composer__fields">
        <label className="plan-composer__field">
          <span className="plan-composer__label">Plan name</span>
          <input
            className="plan-composer__input"
            type="text"
            value={plan.name}
            onChange={(e) =>
              updatePlan(plan.id, (p) => ({ ...p, name: e.target.value }))
            }
          />
        </label>
        <label className="plan-composer__field">
          <span className="plan-composer__label">Serve at</span>
          <input
            className="plan-composer__input"
            type="time"
            value={timeInputValue(plan.serveAt)}
            onChange={(e) =>
              updatePlan(plan.id, (p) => ({
                ...p,
                serveAt: isoFromTimeInput(e.target.value),
              }))
            }
          />
        </label>
      </div>

      <div className="plan-composer__readout">
        <div>
          <div className="plan-composer__readout-label">Serve</div>
          <div className="plan-composer__readout-value">
            {formatServeAt(plan.serveAt)}
          </div>
        </div>
        <div>
          <div className="plan-composer__readout-label">Longest dish</div>
          <div className="plan-composer__readout-value">
            {longestSingle > 0 ? formatDuration(longestSingle) : '—'}
          </div>
        </div>
        <div>
          <div className="plan-composer__readout-label">Earliest start</div>
          <div className="plan-composer__readout-value">
            {earliestStartIso ? formatServeAt(earliestStartIso) : '—'}
          </div>
        </div>
      </div>

      {plan.entries.length === 0 ? (
        <p className="plan-composer__empty">
          No dishes yet. Add recipes from your Cookbook.
        </p>
      ) : (
        <ul className="plan-composer__entries">
          {plan.entries.map((entry) => {
            const recipe = recipesById.get(entry.recipeId);
            if (!recipe) {
              return (
                <li
                  key={entry.recipeId}
                  className="plan-composer__entry plan-composer__entry--missing"
                >
                  <span>Recipe missing (id: {entry.recipeId})</span>
                  <button
                    type="button"
                    className="plan-composer__entry-remove"
                    onClick={() =>
                      updatePlan(plan.id, (p) => ({
                        ...p,
                        entries: p.entries.filter(
                          (e) => e.recipeId !== entry.recipeId,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              );
            }
            return (
              <li key={entry.recipeId} className="plan-composer__entry">
                <button
                  type="button"
                  className="plan-composer__entry-title"
                  onClick={() => setViewingRecipeId(recipe.id)}
                >
                  {recipe.title}
                </button>
                <span className="plan-composer__entry-duration">
                  {formatDuration(criticalPathSeconds(recipe))}
                </span>
                <label className="plan-composer__entry-scale">
                  <span className="plan-composer__entry-scale-label">Servings</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={entry.servings}
                    onChange={(e) => {
                      const next = Math.round(Number(e.target.value));
                      if (!Number.isFinite(next) || next < 1) return;
                      updatePlan(plan.id, (p) => ({
                        ...p,
                        entries: p.entries.map((x) =>
                          x.recipeId === entry.recipeId
                            ? { ...x, servings: next }
                            : x,
                        ),
                      }));
                    }}
                  />
                </label>
                <span className="plan-composer__entry-servings">
                  recipe serves {recipe.servings}
                </span>
                <button
                  type="button"
                  className="plan-composer__entry-remove"
                  onClick={() =>
                    updatePlan(plan.id, (p) => ({
                      ...p,
                      entries: p.entries.filter(
                        (e) => e.recipeId !== entry.recipeId,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
