/** Calendar day string YYYY-MM-DD in the app timezone. */
export function todayKey(now = new Date()): string {
  const tz = process.env.TZ || "America/Sao_Paulo";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function weekdayName(now = new Date()): string {
  const tz = process.env.TZ || "America/Sao_Paulo";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);
}

export function localHour(now = new Date()): number {
  const tz = process.env.TZ || "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return Number(hour ?? "0");
}

export function inWorkHours(now = new Date()): boolean {
  const h = localHour(now);
  return h >= 9 && h < 18;
}
