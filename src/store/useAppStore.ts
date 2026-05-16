import { create } from 'zustand';
import type {
  MealPlan,
  PersistedState,
  Profile,
  Recipe,
  SectionId,
} from '../types';
import { normaliseShape, SCHEMA_VERSION } from './migrations';

const STORAGE_KEY = 'fictional-waffle:v1';

function defaultProfile(): Profile {
  return {
    id: 'local',
    displayName: 'You',
    proficiency: 'enthusiast',
    speedMultiplier: 1,
    units: 'metric',
    defaultServings: 2,
  };
}

function defaultPersisted(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: defaultProfile(),
    recipes: [],
    cookbookIds: [],
    plans: [],
    activePlanId: null,
  };
}

function loadFromStorage(): PersistedState {
  if (typeof window === 'undefined') return defaultPersisted();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersisted();
    const parsed = JSON.parse(raw) as unknown;
    return normaliseShape(parsed);
  } catch {
    // Corrupt payload — fall back rather than crash the whole app.
    return defaultPersisted();
  }
}

function saveToStorage(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failure — non-fatal, the app keeps working in-memory.
  }
}

interface AppStore {
  activeSection: SectionId;
  /** Id of the recipe currently shown in the detail modal. In-memory only. */
  viewingRecipeId: string | null;
  persisted: PersistedState;
  setActiveSection: (id: SectionId) => void;
  setViewingRecipeId: (id: string | null) => void;
  setProfile: (next: Profile) => void;
  setRecipes: (next: Recipe[]) => void;
  setPlans: (next: MealPlan[]) => void;
  setActivePlanId: (id: string | null) => void;
  toggleCookbook: (recipeId: string) => void;
  /** Create a new plan, persist it, and make it the active plan. Returns the new id. */
  createPlan: (name?: string) => string;
  /** Update a plan by id with a pure updater function (immutable). */
  updatePlan: (planId: string, updater: (plan: MealPlan) => MealPlan) => void;
  resetAll: () => void;
}

function newPlanId(): string {
  // Local-only ids — cheap, unique enough for a single-user app.
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useAppStore = create<AppStore>((set) => ({
  activeSection: 'explore',
  viewingRecipeId: null,
  persisted: loadFromStorage(),

  setActiveSection: (id) => set({ activeSection: id }),

  setViewingRecipeId: (id) => set({ viewingRecipeId: id }),

  setProfile: (next) =>
    set((s) => {
      const persisted = { ...s.persisted, profile: next };
      saveToStorage(persisted);
      return { persisted };
    }),

  setRecipes: (next) =>
    set((s) => {
      const persisted = { ...s.persisted, recipes: next };
      saveToStorage(persisted);
      return { persisted };
    }),

  setPlans: (next) =>
    set((s) => {
      const persisted = { ...s.persisted, plans: next };
      saveToStorage(persisted);
      return { persisted };
    }),

  setActivePlanId: (id) =>
    set((s) => {
      const persisted = { ...s.persisted, activePlanId: id };
      saveToStorage(persisted);
      return { persisted };
    }),

  toggleCookbook: (recipeId) =>
    set((s) => {
      const has = s.persisted.cookbookIds.includes(recipeId);
      const cookbookIds = has
        ? s.persisted.cookbookIds.filter((id) => id !== recipeId)
        : [...s.persisted.cookbookIds, recipeId];
      const persisted = { ...s.persisted, cookbookIds };
      saveToStorage(persisted);
      return { persisted };
    }),

  createPlan: (name) => {
    const id = newPlanId();
    set((s) => {
      const plan: MealPlan = {
        id,
        name: name ?? 'Dinner',
        serveAt: null,
        entries: [],
        startedAt: null,
      };
      const persisted = {
        ...s.persisted,
        plans: [...s.persisted.plans, plan],
        activePlanId: id,
      };
      saveToStorage(persisted);
      return { persisted };
    });
    return id;
  },

  updatePlan: (planId, updater) =>
    set((s) => {
      const plans = s.persisted.plans.map((p) =>
        p.id === planId ? updater(p) : p,
      );
      const persisted = { ...s.persisted, plans };
      saveToStorage(persisted);
      return { persisted };
    }),

  resetAll: () =>
    set(() => {
      const persisted = defaultPersisted();
      saveToStorage(persisted);
      return { persisted };
    }),
}));
