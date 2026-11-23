export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function todayInJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function todayDateOnly(): Date {
  return parseDateOnly(todayInJakarta());
}

export function jakartaStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00+07:00`);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseDateOnly(checkOut).getTime() - parseDateOnly(checkIn).getTime()) / 86_400_000);
}

export function isDateWithin(checkIn: string, checkOut: string, date: string): boolean {
  return date >= checkIn && date < checkOut;
}

export function startOfDayUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}
