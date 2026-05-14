import type { SectionId } from '../types';
import { useAppStore } from '../store/useAppStore';
import './Nav.css';

interface NavItem {
  id: SectionId;
  label: string;
  hint: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', hint: 'Your proficiency & units' },
  { id: 'library', label: 'Library', hint: 'Recipes' },
  { id: 'plan', label: 'Plan', hint: 'Pick recipes & serve time' },
  { id: 'kitchen', label: 'Kitchen', hint: 'Cook along the timeline' },
];

export function Nav() {
  const active = useAppStore((s) => s.activeSection);
  const setActive = useAppStore((s) => s.setActiveSection);

  return (
    <nav className="nav" aria-label="Main">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav__item${item.id === active ? ' nav__item--active' : ''}`}
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => setActive(item.id)}
        >
          <span className="nav__label">{item.label}</span>
          <span className="nav__hint">{item.hint}</span>
        </button>
      ))}
    </nav>
  );
}
