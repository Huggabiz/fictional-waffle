import { useAppStore } from './store/useAppStore';
import { Nav } from './components/Nav';
import { UserMenu } from './components/UserMenu';
import { VersionBadge } from './components/VersionBadge';
import { ProfileSection } from './sections/ProfileSection';
import { ExploreSection } from './sections/ExploreSection';
import { CookbookSection } from './sections/CookbookSection';
import { PlannerSection } from './sections/PlannerSection';
import { CookSection } from './sections/CookSection';
import type { SectionId } from './types';
import './App.css';

function renderSection(id: SectionId) {
  switch (id) {
    case 'profile':
      return <ProfileSection />;
    case 'explore':
      return <ExploreSection />;
    case 'cookbook':
      return <CookbookSection />;
    case 'planner':
      return <PlannerSection />;
    case 'cook':
      return <CookSection />;
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
        <div className="app__toolbar-right">
          <VersionBadge />
          <UserMenu />
        </div>
      </header>
      <div className="app__body">
        <Nav />
        <main className="app__main">{renderSection(active)}</main>
      </div>
    </div>
  );
}
