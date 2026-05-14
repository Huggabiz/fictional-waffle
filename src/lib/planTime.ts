// HTML `<input type="datetime-local">` works in local-time strings without
// timezone info. We persist ISO timestamps (with offset) so the schedule
// survives DST changes and travel; these helpers convert at the edges.

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputValueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatServeAt(iso: string | null): string {
  if (!iso) return 'No serve time set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No serve time set';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
