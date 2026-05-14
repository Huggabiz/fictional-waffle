import type { Recipe } from '../types';

// Pure helpers — no React, no store. The scheduler will eventually need a
// proper merged-DAG version of this; for now critical-path on a single
// recipe is enough for card summaries and detail headers.

/** Longest path through the recipe's DAG, in seconds. This is the realistic
 *  total time accounting for parallelism, not the sum of all task durations. */
export function criticalPathSeconds(recipe: Recipe): number {
  const byId = new Map(recipe.tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();

  function endOf(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const task = byId.get(id);
    if (!task) return 0;
    const depEnds = task.dependsOn.map(endOf);
    const start = depEnds.length === 0 ? 0 : Math.max(...depEnds);
    const end = start + task.baselineSeconds;
    memo.set(id, end);
    return end;
  }

  let max = 0;
  for (const t of recipe.tasks) {
    const end = endOf(t.id);
    if (end > max) max = end;
  }
  return max;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} m`;
}
