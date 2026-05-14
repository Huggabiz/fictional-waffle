// Shared domain types. Domain types specific to one component live next to it.
//
// Reminder (from CLAUDE.md): when adding a field to any interface here, update
// all four: the type, the factory, any import/export builders, and the
// normaliseShape migration. Miss one and stale data crashes the app.

export type SectionId = 'profile' | 'library' | 'plan' | 'kitchen';

export type ProficiencyLevel = 'novice' | 'enthusiast' | 'chef' | 'custom';

export interface Profile {
  /** Stable id so future cloud-sync has a target. */
  id: string;
  displayName: string;
  proficiency: ProficiencyLevel;
  /** Multiplier applied to baseline prep durations. 1.0 = enthusiast baseline. */
  speedMultiplier: number;
  units: 'metric' | 'imperial';
}

export type TaskKind = 'prep' | 'active' | 'passive' | 'rest';

export interface RecipeTask {
  id: string;
  label: string;
  kind: TaskKind;
  /** Baseline duration in seconds. Scaled at render time by the active profile. */
  baselineSeconds: number;
  /** Ids of tasks that must complete before this one can start. */
  dependsOn: string[];
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  tasks: RecipeTask[];
  /** Optional notes shown above the timeline. */
  notes?: string;
}

export interface MealPlanEntry {
  recipeId: string;
  /** User-chosen serving scale (1 = recipe default). */
  scale: number;
}

export interface MealPlan {
  id: string;
  name: string;
  /** Target serve time as ISO timestamp. */
  serveAt: string | null;
  entries: MealPlanEntry[];
}

/** Persisted app state. Bumped via SCHEMA_VERSION when shape changes. */
export interface PersistedState {
  schemaVersion: number;
  profile: Profile;
  recipes: Recipe[];
  plans: MealPlan[];
}
