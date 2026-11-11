export function todayInBusinessZone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return [value("year"), value("month"), value("day")].join("-");
}

export function monthInBusinessZone(timeZone: string, date = new Date()) {
  return todayInBusinessZone(timeZone, date).slice(0, 7);
}
