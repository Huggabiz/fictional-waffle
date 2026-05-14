import './Section.css';

export function KitchenSection() {
  return (
    <section className="section">
      <header className="section__header">
        <h1 className="section__title">Kitchen</h1>
        <p className="section__subtitle">
          Live cooking view. The timeline creeps left-to-right toward your serve
          time, splits where tasks run in parallel, and re-projects when you tell it
          you&rsquo;re behind.
        </p>
      </header>
      <div className="section__body">
        <div className="timeline-placeholder" aria-hidden="true">
          <div className="timeline-placeholder__track">
            <span className="timeline-placeholder__node">prep</span>
            <span className="timeline-placeholder__node timeline-placeholder__node--passive">
              simmer
            </span>
            <span className="timeline-placeholder__node">plate</span>
            <span className="timeline-placeholder__serve">serve</span>
          </div>
        </div>
        <p className="section__placeholder">Live timeline rendering comes next.</p>
      </div>
    </section>
  );
}
