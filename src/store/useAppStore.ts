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
  };
}

function defaultPersisted(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: defaultProfile(),
    recipes: [],
    plans: [],
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
  persisted: PersistedState;
  setActiveSection: (id: SectionId) => void;
  setProfile: (next: Profile) => void;
  setRecipes: (next: Recipe[]) => void;
  setPlans: (next: MealPlan[]) => void;
  resetAll: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeSection: 'plan',
  persisted: loadFromStorage(),

  setActiveSection: (id) => set({ activeSection: id }),

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

  resetAll: () =>
    set(() => {
      const persisted = defaultPersisted();
      saveToStorage(persisted);
      return { persisted };
    }),
}));
