import { useMemo } from 'react';
import { useAppStore } from './useAppStore';
import { SEED_RECIPES } from '../data/seedRecipes';
import { buildSchedule } from '../lib/scheduler';
import type { Schedule } from '../lib/scheduler';
import type { MealPlan, Recipe } from '../types';

// Single place that merges built-in seed recipes with the user's own.
// Components only need to call useAllRecipes — they never need to know seeds
// live in code and user recipes live in localStorage.

export function useAllRecipes(): Recipe[] {
  const userRecipes = useAppStore((s) => s.persisted.recipes);
  return useMemo(() => [...SEED_RECIPES, ...userRecipes], [userRecipes]);
}

export function useRecipeById(id: string | null): Recipe | undefined {
  const all = useAllRecipes();
  return useMemo(
    () => (id ? all.find((r) => r.id === id) : undefined),
    [all, id],
  );
}

export interface PlanSchedule {
  schedule: Schedule | null;
  /** One lane per dish, in plan order, cyclic recipes excluded. */
  lanes: { recipeId: string; title: string }[];
  /** Wall-clock ms of the schedule's start, or null if no serve time. */
  startMs: number | null;
  /** Wall-clock ms of serve, or null. */
  serveMs: number | null;
}

/** Builds the merged schedule for a plan. Shared by the Planner (preview)
 *  and Cook (live) so the two render the exact same timeline. */
export function usePlanSchedule(plan: MealPlan | undefined): PlanSchedule {
  const profile = useAppStore((s) => s.persisted.profile);
  const allRecipes = useAllRecipes();

  const recipesById = useMemo(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );

  const schedule = useMemo(
    () => (plan ? buildSchedule(plan, recipesById, profile) : null),
    [plan, recipesById, profile],
  );

  const lanes = useMemo(() => {
    if (!plan || !schedule) return [];
    const cyclic = new Set(schedule.cyclicRecipeIds);
    return plan.entries
      .map((e) => recipesById.get(e.recipeId))
      .filter(
        (r): r is NonNullable<typeof r> => Boolean(r) && !cyclic.has(r!.id),
      )
      .map((r) => ({ recipeId: r.id, title: r.title }));
  }, [plan, schedule, recipesById]);

  const serveMs =
    plan?.serveAt && !Number.isNaN(new Date(plan.serveAt).getTime())
      ? new Date(plan.serveAt).getTime()
      : null;
  const startMs =
    serveMs !== null && schedule ? serveMs - schedule.totalDuration * 1000 : null;

  return { schedule, lanes, startMs, serveMs };
}
