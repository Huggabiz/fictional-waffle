import { useAppStore } from '../store/useAppStore';
import './Section.css';

export function ProfileSection() {
  const profile = useAppStore((s) => s.persisted.profile);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Profile</h1>
        <p className="section__subtitle">
          Your proficiency scales prep durations. The calibration recipe will replace
          the preset with a measured baseline.
        </p>
      </header>
      <div className="section__body">
        <dl className="kv">
          <div className="kv__row">
            <dt>Display name</dt>
            <dd>{profile.displayName}</dd>
          </div>
          <div className="kv__row">
            <dt>Proficiency</dt>
            <dd>{profile.proficiency}</dd>
          </div>
          <div className="kv__row">
            <dt>Speed multiplier</dt>
            <dd>{profile.speedMultiplier.toFixed(2)}&times;</dd>
          </div>
          <div className="kv__row">
            <dt>Units</dt>
            <dd>{profile.units}</dd>
          </div>
        </dl>
        <p className="section__placeholder">Editing UI coming in the next slice.</p>
      </div>
    </section>
  );
}
