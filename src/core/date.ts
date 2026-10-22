export function localAllDayStart(date = new Date()): string {
  return formatLocalDate(date, 0, 0);
}

export function localDateTime(date: Date): string {
  return formatLocalDate(date, date.getHours(), date.getMinutes());
}

function formatLocalDate(date: Date, hours: number, minutes: number): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad2(Math.floor(absoluteOffset / 60));
  const offsetRemainder = pad2(absoluteOffset % 60);

  return `${year}-${month}-${day}T${pad2(hours)}:${pad2(minutes)}:00${sign}${offsetHours}${offsetRemainder}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
