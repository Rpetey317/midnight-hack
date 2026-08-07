export function shortDigest(d: string, head = 10, tail = 6) {
  const hex = d.replace(/^sha256:/, "");
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function shortCommit(c: string) {
  return c.slice(0, 7);
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATETIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const fmtDate = (unix: number) => DATE.format(new Date(unix * 1000));
export const fmtDateTime = (unix: number) => `${DATETIME.format(new Date(unix * 1000))} UTC`;

export function relativeDays(unix: number, now = Date.now() / 1000) {
  const days = Math.round((unix - now) / 86400);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

export const pct = (hundredths: number) => (hundredths / 100).toFixed(2);
