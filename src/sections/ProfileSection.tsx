import { useAppStore } from '../store/useAppStore';
import {
  PROFICIENCY_PRESETS,
  presetFor,
  proficiencyLabel,
} from '../lib/proficiency';
import { formatDuration } from '../lib/recipeMetrics';
import type { ProficiencyLevel, Profile } from '../types';
import './Section.css';
import './ProfileSection.css';

const SAMPLE_PREP_SECONDS = 600; // 10 min — the prep-time preview anchor.

export function ProfileSection() {
  const profile = useAppStore((s) => s.persisted.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  function patch(next: Partial<Profile>) {
    setProfile({ ...profile, ...next });
  }

  function pickPreset(level: Exclude<ProficiencyLevel, 'custom'>) {
    const preset = presetFor(level);
    if (!preset) return;
    patch({ proficiency: level, speedMultiplier: preset.speedMultiplier });
  }

  const scaledPrep = SAMPLE_PREP_SECONDS * profile.speedMultiplier;

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Profile</h1>
        <p className="section__subtitle">
          Your proficiency scales prep-task durations. The calibration recipe
          (coming later) will replace the preset with a measured speed.
        </p>
      </header>

      <div className="section__body">
        <div className="profile-form">
          <label className="profile-field">
            <span className="profile-field__label">Display name</span>
            <input
              className="profile-field__input"
              type="text"
              value={profile.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
            />
            <span className="profile-field__hint">
              Shown on the avatar chip in the top right.
            </span>
          </label>

          <div className="profile-field">
            <span className="profile-field__label">Units</span>
            <div className="profile-radios" role="radiogroup" aria-label="Units">
              {(['metric', 'imperial'] as const).map((u) => (
                <label
                  key={u}
                  className={
                    profile.units === u
                      ? 'profile-radio profile-radio--active'
                      : 'profile-radio'
                  }
                >
                  <input
                    type="radio"
                    name="units"
                    value={u}
                    checked={profile.units === u}
                    onChange={() => patch({ units: u })}
                  />
                  <span>{u === 'metric' ? 'Metric' : 'Imperial'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-field__label">Proficiency</span>
            <div
              className="profile-segments"
              role="radiogroup"
              aria-label="Proficiency"
            >
              {PROFICIENCY_PRESETS.map((preset) => (
                <button
                  key={preset.level}
                  type="button"
                  role="radio"
                  aria-checked={profile.proficiency === preset.level}
                  className={
                    profile.proficiency === preset.level
                      ? 'profile-segment profile-segment--active'
                      : 'profile-segment'
                  }
                  onClick={() => pickPreset(preset.level)}
                >
                  <span className="profile-segment__label">{preset.label}</span>
                  <span className="profile-segment__mult">
                    {preset.speedMultiplier.toFixed(2)}×
                  </span>
                </button>
              ))}
            </div>
            <span className="profile-field__hint">
              {profile.proficiency === 'custom'
                ? `Calibrated from a test recipe. Speed multiplier: ${profile.speedMultiplier.toFixed(2)}×. Pick a preset above to override.`
                : presetFor(profile.proficiency)?.description}
            </span>
          </div>

          <div className="profile-readout">
            <div>
              <div className="profile-readout__label">Speed multiplier</div>
              <div className="profile-readout__value">
                {profile.speedMultiplier.toFixed(2)}×
              </div>
            </div>
            <div>
              <div className="profile-readout__label">A 10-minute prep…</div>
              <div className="profile-readout__value">
                takes ~{formatDuration(scaledPrep)} at your pace
              </div>
            </div>
            <div>
              <div className="profile-readout__label">Profile</div>
              <div className="profile-readout__value">
                {proficiencyLabel(profile.proficiency)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
