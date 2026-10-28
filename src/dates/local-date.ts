export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function calendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  return date;
}
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1 && localDate(calendarDate(year, month, day)) === value;
}
export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  return localDate(calendarDate(year, month, date + days));
}
export function diaryDate(entry: { diaryDate?: string; createdAt: string }) {
  return entry.diaryDate ?? localDate(new Date(entry.createdAt));
}
export function monthStart(day: string) { return `${day.slice(0, 7)}-01`; }
export function shiftMonth(day: string, delta: number) {
  const [year, month] = day.split('-').map(Number);
  return localDate(calendarDate(year, month + delta, 1));
}
export function monthCells(day: string): (string | null)[] {
  const [year, month] = day.split('-').map(Number);
  const first = calendarDate(year, month, 1);
  const count = calendarDate(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let i = 1; i <= count; i++) cells.push(localDate(calendarDate(year, month, i)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function dateLabel(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return `${year}년 ${month}월 ${date}일`;
}
export function canWriteOn(day: unknown, today = localDate()): day is string {
  return isDateKey(day) && day <= today;
}
