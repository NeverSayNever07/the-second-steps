const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const ukDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "12 min ago", "3 hours ago", "Yesterday", or the date. */
export function relativeTime(then: Date, now: Date = new Date()) {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 12 && ukDay.format(then) === ukDay.format(now)) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (ukDay.format(then) === ukDay.format(now)) return "Today";
  if (ukDay.format(then) === ukDay.format(yesterday)) return "Yesterday";
  return dayFormat.format(then);
}
