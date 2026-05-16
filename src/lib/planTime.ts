// The Planner composes a meal to cook today-ish, so serve time is a
// time-of-day, not a calendar date. We still persist a full ISO timestamp
// (so the Cook section can do wall-clock maths) but resolve a bare "HH:MM"
// to the next occurrence of that time.

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** ISO timestamp → "HH:MM" for an `<input type="time">`. */
export function timeInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:MM" from a time input → ISO timestamp at the next occurrence of that
 *  time (today if still ahead, otherwise tomorrow). */
export function isoFromTimeInput(value: string): string | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    h,
    m,
    0,
    0,
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

/** Friendly time-of-day for readouts — "7:00 pm", "+ (tomorrow)" if it rolls over. */
export function formatServeAt(iso: string | null): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not set';
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `${time} (tomorrow)`;
  return `${time}, ${d.toLocaleDateString(undefined, { weekday: 'short' })}`;
}
