import type { SectionId } from '../types';
import { useAppStore } from '../store/useAppStore';
import './Nav.css';

interface NavItem {
  id: SectionId;
  label: string;
  hint: string;
}

// Profile lives in the top-right user menu (Office-365 style), not here, so
// the side nav stays focused on the cooking flow: discover → save → compose → cook.
const NAV_ITEMS: NavItem[] = [
  { id: 'explore', label: 'Explore', hint: 'Browse the catalogue' },
  { id: 'cookbook', label: 'Cookbook', hint: 'Recipes you saved' },
  { id: 'planner', label: 'Planner', hint: 'Compose a meal' },
  { id: 'cook', label: 'Cook', hint: 'Live timeline' },
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
