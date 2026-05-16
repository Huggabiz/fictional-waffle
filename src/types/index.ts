// Shared domain types. Domain types specific to one component live next to it.
//
// Reminder (from CLAUDE.md): when adding a field to any interface here, update
// all four: the type, the factory, any import/export builders, and the
// normaliseShape migration. Miss one and stale data crashes the app.

export type SectionId = 'profile' | 'explore' | 'cookbook' | 'planner' | 'cook';

export type ProficiencyLevel = 'novice' | 'enthusiast' | 'chef' | 'custom';

export interface Profile {
  /** Stable id so future cloud-sync has a target. */
  id: string;
  displayName: string;
  proficiency: ProficiencyLevel;
  /** Multiplier applied to baseline prep durations. 1.0 = enthusiast baseline. */
  speedMultiplier: number;
  units: 'metric' | 'imperial';
  /** Serving count a recipe defaults to when first added to a plan. */
  defaultServings: number;
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

export interface RecipeIngredient {
  id: string;
  label: string;
  /** Numeric quantity. Use 0 for "to taste" / "a pinch". */
  quantity: number;
  /** Display unit; free text so cuisines aren't boxed in (g, ml, tbsp, cloves, …). */
  unit: string;
  notes?: string;
}

/** Where a recipe comes from. Builtin recipes are constants in code and can't
 *  be edited or deleted; user recipes are persisted and editable. */
export type RecipeSource = 'builtin' | 'user';

export interface Recipe {
  id: string;
  title: string;
  source: RecipeSource;
  servings: number;
  ingredients: RecipeIngredient[];
  tasks: RecipeTask[];
  /** Optional notes shown above the timeline. */
  notes?: string;
}

export interface MealPlanEntry {
  recipeId: string;
  /** Absolute serving count to cook for this dish in the plan. */
  servings: number;
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
  /** User-authored recipes only. Built-in seeds live in code and are merged in at read time. */
  recipes: Recipe[];
  /** Ids of recipes (builtin or user) the user has added to their cookbook. */
  cookbookIds: string[];
  plans: MealPlan[];
  /** Id of the plan currently being edited / cooked. null = none yet. */
  activePlanId: string | null;
}
