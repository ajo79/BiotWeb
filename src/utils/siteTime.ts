const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export const SITE_UTC_OFFSET_MINUTES = 330; // UTC+05:30 (IST)
const SITE_OFFSET_MS = SITE_UTC_OFFSET_MINUTES * MS_PER_MINUTE;

const parseDateInput = (value: string) => {
  const [y, m, d] = String(value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
};

const formatDateInput = (year: number, month: number, day: number) => {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const formatTwoDigits = (value: number) => String(value).padStart(2, "0");

export const dateInputToSiteDayStartMs = (value: string) => {
  const parts = parseDateInput(value);
  if (!parts) return NaN;
  return Date.UTC(parts.y, parts.m - 1, parts.d, 0, 0, 0, 0) - SITE_OFFSET_MS;
};

export const dateInputToSiteDayEndMs = (value: string) => {
  const parts = parseDateInput(value);
  if (!parts) return NaN;
  return Date.UTC(parts.y, parts.m - 1, parts.d, 23, 59, 59, 999) - SITE_OFFSET_MS;
};

export const epochMsToSiteDayStartMs = (epochMs: number) => {
  const n = Number(epochMs);
  if (!Number.isFinite(n)) return NaN;
  const shifted = n + SITE_OFFSET_MS;
  const d = new Date(shifted);
  const dayStartShifted = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return dayStartShifted - SITE_OFFSET_MS;
};

export const epochMsToSiteDayEndMs = (epochMs: number) => {
  const start = epochMsToSiteDayStartMs(epochMs);
  if (!Number.isFinite(start)) return NaN;
  return start + MS_PER_DAY - 1;
};

export const getSiteDateInputValue = (epochMs = Date.now()) => {
  const n = Number(epochMs);
  if (!Number.isFinite(n)) return "";
  const shifted = n + SITE_OFFSET_MS;
  const d = new Date(shifted);
  return formatDateInput(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export const shiftDateInputByDays = (value: string, days: number) => {
  const parts = parseDateInput(value);
  if (!parts) return value;
  const shifted = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + Math.trunc(days)));
  return formatDateInput(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
};

export const formatEpochMsInSiteTime = (epochMs: number) => {
  const n = Number(epochMs);
  if (!Number.isFinite(n)) return "";
  const shifted = n + SITE_OFFSET_MS;
  const d = new Date(shifted);
  const yyyy = d.getUTCFullYear();
  const mm = formatTwoDigits(d.getUTCMonth() + 1);
  const dd = formatTwoDigits(d.getUTCDate());
  const hh = formatTwoDigits(d.getUTCHours());
  const mi = formatTwoDigits(d.getUTCMinutes());
  const ss = formatTwoDigits(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};
