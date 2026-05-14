import { useAppStore } from './store/useAppStore';
import { Nav } from './components/Nav';
import { VersionBadge } from './components/VersionBadge';
import { ProfileSection } from './sections/ProfileSection';
import { LibrarySection } from './sections/LibrarySection';
import { PlanSection } from './sections/PlanSection';
import { KitchenSection } from './sections/KitchenSection';
import type { SectionId } from './types';
import './App.css';

function renderSection(id: SectionId) {
  switch (id) {
    case 'profile':
      return <ProfileSection />;
    case 'library':
      return <LibrarySection />;
    case 'plan':
      return <PlanSection />;
    case 'kitchen':
      return <KitchenSection />;
  }
}

export function App() {
  const active = useAppStore((s) => s.activeSection);

  return (
    <div className="app">
      <header className="app__toolbar">
        <div className="app__brand">
          <img src="./waffle.svg" alt="" className="app__logo" />
          <span className="app__title">Fictional Waffle</span>
        </div>
        <VersionBadge />
      </header>
      <div className="app__body">
        <Nav />
        <main className="app__main">{renderSection(active)}</main>
      </div>
    </div>
  );
}
