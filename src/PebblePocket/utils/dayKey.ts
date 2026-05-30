// Daily ritual key — one stone per real local day.
// Local midnight feels right for a personal pocket; UTC would make
// 16:00 PST feel like "next day" which is wrong for the user's body.
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function msUntilTomorrow(d: Date = new Date()): number {
  const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return tomorrow.getTime() - d.getTime();
}

export function formatDay(day: string): string {
  // 'YYYY-MM-DD' → e.g. 'May 30'
  const [, m, d] = day.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}
