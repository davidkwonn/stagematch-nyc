// Human-readable dates, times and money for Mack's messages and match reasons.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → Date at UTC midnight (calendar math only, no time zone drift).
export const parseDate = (d: string): Date => new Date(`${d.slice(0, 10)}T00:00:00Z`);
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

// Today's calendar date in New York, where every gig happens.
export function todayNY(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return parseDate(ymd);
}

export const weekdayName = (weekday: number): string => WEEKDAYS[weekday];

// '2026-11-07' → 'Fri Nov 7'
export function formatDate(d: string): string {
  const date = parseDate(d);
  return `${WEEKDAYS[date.getUTCDay()].slice(0, 3)} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

// 'HH:MM[:SS]' → minutes since midnight
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// minutes since midnight (may exceed 24h for late nights) → 'HH:MM'
export function fromMinutes(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// '21:00' → '9 pm', '19:30' → '7:30 pm'
export function formatTime(t: string): string {
  const min = toMinutes(t);
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export const usd = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
