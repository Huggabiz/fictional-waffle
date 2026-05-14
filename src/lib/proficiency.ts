import type { ProficiencyLevel } from '../types';

// Speed multipliers are applied to baseline prep durations at render time.
// Baseline (1.0) is the enthusiast home cook. Slower hands raise it,
// trained hands lower it. These are starting points — the calibration
// recipe will eventually replace them with a measured number for the user.

export interface ProficiencyPreset {
  level: Exclude<ProficiencyLevel, 'custom'>;
  label: string;
  speedMultiplier: number;
  description: string;
}

export const PROFICIENCY_PRESETS: ProficiencyPreset[] = [
  {
    level: 'novice',
    label: 'Novice',
    speedMultiplier: 1.5,
    description: 'Comfortable with basics; prep takes a bit longer than the recipe says.',
  },
  {
    level: 'enthusiast',
    label: 'Enthusiast',
    speedMultiplier: 1,
    description: 'Home cook baseline. Most recipe timings are written for this.',
  },
  {
    level: 'chef',
    label: 'Chef',
    speedMultiplier: 0.75,
    description: 'Knife skills, multitasking — prep flies.',
  },
];

export function presetFor(level: ProficiencyLevel): ProficiencyPreset | undefined {
  return PROFICIENCY_PRESETS.find((p) => p.level === level);
}

export function proficiencyLabel(level: ProficiencyLevel): string {
  return level === 'custom' ? 'Calibrated' : presetFor(level)?.label ?? level;
}
