import { useMemo } from 'react';
import { useAppStore } from './useAppStore';
import { SEED_RECIPES } from '../data/seedRecipes';
import type { Recipe } from '../types';

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
