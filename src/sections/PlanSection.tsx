import { useAppStore } from '../store/useAppStore';
import './Section.css';

export function PlanSection() {
  const plans = useAppStore((s) => s.persisted.plans);

  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Plan</h1>
        <p className="section__subtitle">
          Build a meal plan: pick recipes from the library, set a target serve time,
          and the scheduler will merge their task graphs into one timeline.
        </p>
      </header>
      <div className="section__body">
        {plans.length === 0 ? (
          <p className="section__placeholder">No plans yet.</p>
        ) : (
          <ul className="plan-list">
            {plans.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> &middot; {p.entries.length} dish
                {p.entries.length === 1 ? '' : 'es'}
                {p.serveAt ? ` · serve ${p.serveAt}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
