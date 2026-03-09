export type ScopePreset = {
  id: string;
  label: string;
  timePerDivisionMs: number;
};

export const DIVISIONS_PER_SCREEN = 10;

export const SCOPE_PRESETS: ScopePreset[] = [
  { id: "1m", label: "1 min", timePerDivisionMs: 1 * 60 * 1000 },
  { id: "10m", label: "10 min", timePerDivisionMs: 10 * 60 * 1000 },
  { id: "20m", label: "20 min", timePerDivisionMs: 20 * 60 * 1000 },
  { id: "30m", label: "30 min", timePerDivisionMs: 30 * 60 * 1000 },
  { id: "1h", label: "1 hour", timePerDivisionMs: 1 * 60 * 60 * 1000 },
  { id: "2h", label: "2 hours", timePerDivisionMs: 2 * 60 * 60 * 1000 },
  { id: "4h", label: "4 hours", timePerDivisionMs: 4 * 60 * 60 * 1000 },
  { id: "6h", label: "6 hours", timePerDivisionMs: 6 * 60 * 60 * 1000 },
  { id: "12h", label: "12 hours", timePerDivisionMs: 12 * 60 * 60 * 1000 },
];

export const DEFAULT_SCOPE_PRESET_ID = "10m";
const resolvePresetTimePerDivisionMs = (presetId?: string) =>
  SCOPE_PRESETS.find((preset) => preset.id === presetId)?.timePerDivisionMs ??
  SCOPE_PRESETS[0].timePerDivisionMs;

export const DEFAULT_SCOPE_WINDOW_MS =
  resolvePresetTimePerDivisionMs(DEFAULT_SCOPE_PRESET_ID) * DIVISIONS_PER_SCREEN;
export const MAX_SCOPE_WINDOW_MS =
  Math.max(...SCOPE_PRESETS.map((preset) => preset.timePerDivisionMs)) * DIVISIONS_PER_SCREEN;
export const LIVE_SCOPE_BUFFER_MS = MAX_SCOPE_WINDOW_MS + 10 * 60 * 1000;

export const resolveScopeWindowMs = (presetId?: string) =>
  resolvePresetTimePerDivisionMs(presetId) * DIVISIONS_PER_SCREEN;

export const resolveScopeTimePerDivisionMs = (presetId?: string) =>
  resolvePresetTimePerDivisionMs(presetId);

export const resolveScopePreset = (presetId?: string) =>
  SCOPE_PRESETS.find((preset) => preset.id === presetId) ?? SCOPE_PRESETS[0];

export const timePerDivisionMs = (
  windowMs: number,
  divisions = DIVISIONS_PER_SCREEN
) => {
  const safeDivisions = Math.max(1, Math.round(divisions));
  return Math.max(1_000, Math.round(windowMs / safeDivisions));
};

export const buildDivisionTicks = (
  domainStartMs: number,
  domainEndMs: number,
  divisions = DIVISIONS_PER_SCREEN
) => {
  const safeDivisions = Math.max(1, Math.round(divisions));
  const width = Math.max(1, domainEndMs - domainStartMs);
  const step = width / safeDivisions;
  return Array.from({ length: safeDivisions + 1 }, (_, index) =>
    Math.round(domainStartMs + index * step)
  );
};

export const buildTicksByIntervalMs = (
  domainStartMs: number,
  domainEndMs: number,
  intervalMs: number,
  maxTicks = 1000
) => {
  const start = Math.round(domainStartMs);
  const end = Math.round(domainEndMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [start, end];

  const step = Math.max(1_000, Math.round(intervalMs));
  const ticks: number[] = [start];
  let cursor = start + step;
  let guard = 0;

  while (cursor < end && guard < maxTicks) {
    ticks.push(cursor);
    cursor += step;
    guard += 1;
  }

  if (ticks[ticks.length - 1] !== end) ticks.push(end);
  return ticks;
};

export const formatDurationShort = (ms: number) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "--";
  const minutes = Math.round(n / 60000);
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${(minutes / 60).toFixed(1)}h`;
};

export const formatDurationShortWithSeconds = (ms: number) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "--";
  if (n < 60_000) return `${Math.max(1, Math.round(n / 1000))}s`;
  return formatDurationShort(n);
};

export const formatScopeTick = (ts: number, windowMs: number) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";

  const includeSeconds = windowMs <= 60 * 60 * 1000;
  return new Date(n).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
  });
};

export const formatHistoryTick = (
  ts: number,
  rangeStartMs?: number,
  rangeEndMs?: number
) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";

  const startYear = Number.isFinite(rangeStartMs) ? new Date(Number(rangeStartMs)).getFullYear() : undefined;
  const endYear = Number.isFinite(rangeEndMs) ? new Date(Number(rangeEndMs)).getFullYear() : undefined;
  const includeYear = Number.isFinite(startYear) && Number.isFinite(endYear) && startYear !== endYear;

  return new Date(n).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: includeYear ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatFullDateTimeTick = (ts: number) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";

  return new Date(n).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
};

export const coerceEpochMs = (value: any): number | undefined => {
  if (value == null) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e16) return Math.round(numeric / 1e6); // ns -> ms
    if (numeric > 1e13) return Math.round(numeric / 1e3); // us -> ms
    if (numeric > 1e9 && numeric < 1e12) return Math.round(numeric * 1000); // s -> ms
    return Math.round(numeric);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};
