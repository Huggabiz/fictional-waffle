import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ProficiencyLevel } from '../types';
import './UserMenu.css';

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function proficiencyLabel(level: ProficiencyLevel): string {
  switch (level) {
    case 'novice':
      return 'Novice';
    case 'enthusiast':
      return 'Enthusiast';
    case 'chef':
      return 'Chef';
    case 'custom':
      return 'Calibrated';
  }
}

export function UserMenu() {
  const profile = useAppStore((s) => s.persisted.profile);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => initialsFor(profile.displayName), [profile.displayName]);

  // Close on outside click or Escape. Pattern is dropdown-style, not modal —
  // CLAUDE.md's onMouseDown-backdrop rule is for modal panels.
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function openProfileSettings() {
    setActiveSection('profile');
    setOpen(false);
  }

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu__chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account menu for ${profile.displayName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-menu__avatar" aria-hidden>
          {initials}
        </span>
        <span className="user-menu__name">{profile.displayName}</span>
      </button>
      {open && (
        <div className="user-menu__panel" role="dialog" aria-label="Account">
          <div className="user-menu__panel-head">
            <span className="user-menu__avatar user-menu__avatar--lg" aria-hidden>
              {initials}
            </span>
            <div className="user-menu__id">
              <div className="user-menu__display-name">{profile.displayName}</div>
              <div className="user-menu__meta">
                {proficiencyLabel(profile.proficiency)} · {profile.speedMultiplier.toFixed(2)}× speed
              </div>
              <div className="user-menu__meta">Units: {profile.units}</div>
            </div>
          </div>
          <div className="user-menu__actions">
            <button
              type="button"
              className="user-menu__action"
              onClick={openProfileSettings}
            >
              Profile settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
