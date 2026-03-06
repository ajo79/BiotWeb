import axios from "axios";
import { flattenPayloadDeep } from "../utils/metrics";
import { getRssi, getWifiStrength } from "../utils/wifi";

const DEFAULT_API_ENDPOINT = "https://cg5h2ba15i.execute-api.ap-south-1.amazonaws.com/prod";
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const FAST_STATUS_TIMEOUT_MS = 5_000;

const resolveApiEndpoint = (raw?: string) => {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_API_ENDPOINT;

  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path ? path : "/prod";
    return url.toString();
  } catch {
    return DEFAULT_API_ENDPOINT;
  }
};

const API_ENDPOINT = resolveApiEndpoint(import.meta.env.VITE_API_URL as string | undefined);

export type Reading = {
  deviceId: string;
  deviceName?: string;
  temperature?: number;
  humidity?: number;
  ts?: number;
  tsServerMs?: number;
  tsDeviceMs?: number;
  payload?: any;
  parameters?: any[];
  _schemaValid?: boolean;
  [key: string]: any;
};

type IoTPaginationMeta = {
  ioTReadingsNextToken?: any;
  ioTReadingsHasMore?: boolean;
};

export type DashboardResponse = {
  IoTReadings: Reading[];
  RealTimeDataMonitor: Reading[];
  ESP32_Alarms: any[];
  summary: { total: number; online: number; good: number; issue: number };
  _meta?: IoTPaginationMeta;
};

type FetchDashboardOptions = {
  query?: Record<string, any>;
  timeoutMs?: number;
};

const safeJsonParse = <T = any>(text: any): T | null => {
  if (typeof text !== "string") return text as T;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeLambdaResponse = (parsed: any) => {
  if (parsed && typeof parsed === "object" && typeof parsed.body === "string") {
    const inner = safeJsonParse(parsed.body);
    return inner ?? {};
  }
  return parsed ?? {};
};

const unmarshalAttributeValue = (value: any): any => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      if ("S" in value) return String(value.S);
      if ("N" in value) {
        const n = Number(value.N);
        return Number.isFinite(n) ? n : value.N;
      }
      if ("BOOL" in value) return Boolean(value.BOOL);
      if ("NULL" in value) return null;
      if ("M" in value) return unmarshalMap(value.M);
      if ("L" in value && Array.isArray(value.L)) return value.L.map(unmarshalAttributeValue);
    }
  }
  return value;
};

const unmarshalMap = (map: any) => {
  if (!map || typeof map !== "object") return map;
  const out: any = {};
  for (const [k, v] of Object.entries(map)) out[k] = unmarshalAttributeValue(v);
  return out;
};

const unmarshalItem = (item: any) => unmarshalMap(item);

const asNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const pickNumber = (...vals: any[]) => {
  for (const v of vals) {
    const n = asNumber(v);
    if (n !== undefined) return n;
  }
  return undefined;
};

const parseBoolean = (value: any): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on", "alarm", "active"].includes(lowered)) return true;
    if (["0", "false", "no", "n", "off", "ok", "normal", "inactive", "none"].includes(lowered)) return false;
  }
  return undefined;
};

const toEpochMs = (value: any) => {
  if (value == null) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e9 && numeric < 1e12) return Math.round(numeric * 1000);
    return Math.round(numeric);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};

const pickEpochMs = (...vals: any[]) => {
  for (const v of vals) {
    const ts = toEpochMs(v);
    if (ts !== undefined) return ts;
  }
  return undefined;
};

const toBool01 = (value: any) => {
  const bool = parseBoolean(value);
  if (typeof bool === "boolean") return bool ? 1 : 0;
  const n = Number(value);
  if (Number.isFinite(n)) return n !== 0 ? 1 : 0;
  return 0;
};

const normalizeAlarm = (alarm: any) => {
  if (!alarm || typeof alarm !== "object") {
    return { active: false, severity: "none" };
  }

  const activeRaw = alarm.active ?? alarm.isActive ?? alarm.alarm ?? alarm.flag ?? alarm.value;
  const active = parseBoolean(activeRaw);
  const severity = String(alarm.severity || alarm.level || "none").toLowerCase();
  return { active: Boolean(active), severity };
};

const normalizeParameters = (parameters: any) => {
  const source = (() => {
    if (Array.isArray(parameters)) return parameters;
    if (typeof parameters === "string") {
      const parsed = safeJsonParse(parameters);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  })();

  if (!Array.isArray(source)) return [];

  const normalized = source
    .map((item, idx) => {
      const resolvedItem = typeof item === "string" ? safeJsonParse(item) : item;
      if (!resolvedItem || typeof resolvedItem !== "object") return null;

      const order = asNumber(resolvedItem.order);
      return {
        key: String(resolvedItem.key ?? `param_${idx + 1}`),
        label: String(resolvedItem.label ?? resolvedItem.key ?? `Param ${idx + 1}`),
        value: resolvedItem.value,
        unit: resolvedItem.unit != null ? String(resolvedItem.unit) : "",
        valueType: String(resolvedItem.valueType ?? resolvedItem.type ?? typeof resolvedItem.value),
        order: Number.isFinite(order) ? order : idx + 1,
        showOnCard: resolvedItem.showOnCard !== false,
        alarm: normalizeAlarm(resolvedItem.alarm),
      };
    })
    .filter((item): item is any => Boolean(item));

  return normalized.sort((a, b) => a.order - b.order);
};

const findPhaseId = (parameter: any): string | null => {
  const key = String(parameter?.key || "").toLowerCase();
  const label = String(parameter?.label || "").toLowerCase();
  const match =
    key.match(/phase[_\s-]?(\d+)/) ||
    label.match(/phase[_\s-]?(\d+)/) ||
    key.match(/press[_\s-]?(\d+)/) ||
    label.match(/press[_\s-]?(\d+)/);
  return match ? match[1] : null;
};

const isBiotTelemetryRecord = (lookup: any, parameters: any[]) => {
  const schemaVersion = Number(lookup?.schemaVersion);
  const msgType = String(lookup?.msgType || "").toLowerCase();
  const statusObj = lookup?.status && typeof lookup.status === "object" ? lookup.status : null;

  const hasEnvelope = Number.isFinite(schemaVersion) && schemaVersion >= 1 && msgType === "telemetry";
  const hasBiotShape =
    Array.isArray(parameters) &&
    (statusObj !== null ||
      lookup?.siteId != null ||
      lookup?.deviceType != null ||
      lookup?.tsEpochMs != null ||
      msgType === "telemetry");

  return hasEnvelope || hasBiotShape;
};

const applyCanonicalCompatFields = (merged: any, parameters: any[]) => {
  const out: Record<string, any> = {};
  const status = merged?.status && typeof merged.status === "object" ? merged.status : {};

  const wifiStrength = pickNumber(
    status?.wifiStrength,
    status?.wifi_strength,
    status?.wifi?.level,
    merged?.wifi_strength,
    merged?.wifiStrength,
    merged?.wifiSignal,
    merged?.wifi
  );
  if (wifiStrength !== undefined) out.wifi_strength = wifiStrength;

  const overallAlarmRaw =
    status?.overallAlarm ?? status?.overall_alarm ?? status?.commonAlarm ?? merged?.overallAlarm;
  if (overallAlarmRaw !== undefined) {
    out["Common Alarm"] = toBool01(overallAlarmRaw);
  }

  parameters.forEach((parameter) => {
    const keyLower = String(parameter?.key || "").toLowerCase();
    const labelLower = String(parameter?.label || "").toLowerCase();
    const numericValue = asNumber(parameter?.value);
    const phaseId = findPhaseId(parameter);

    if (
      numericValue !== undefined &&
      (keyLower.includes("temperature") || keyLower.endsWith("_c") || labelLower.includes("temp"))
    ) {
      if (out.temperature === undefined) out.temperature = numericValue;
    }

    if (
      numericValue !== undefined &&
      (keyLower.includes("humidity") || keyLower.endsWith("_pct") || labelLower.includes("hum"))
    ) {
      if (out.humidity === undefined) out.humidity = numericValue;
    }

    if (phaseId && numericValue !== undefined) {
      out[`Press ${phaseId} Amps`] = numericValue;
      out[`Press ${phaseId} Alarm`] = parameter?.alarm?.active ? 1 : 0;
    }
  });

  return out;
};

const normalizeReading = (entry: any): Reading => {
  if (!entry || typeof entry !== "object") return entry;

  const merged = flattenPayloadDeep(entry);
  const parameters = normalizeParameters(merged.parameters);
  const compat = applyCanonicalCompatFields(merged, parameters);
  const lookup = { ...merged, ...compat };

  const pickNumberAlias = (obj: any, keys: string[]) => {
    if (!obj || typeof obj !== "object") return undefined;

    const lower: Record<string, any> = {};
    Object.entries(obj).forEach(([k, v]) => {
      lower[String(k).toLowerCase()] = v;
    });

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const n = asNumber(obj[key]);
        if (n !== undefined) return n;
      }

      const lk = key.toLowerCase();
      if (lk in lower) {
        const n = asNumber(lower[lk]);
        if (n !== undefined) return n;
      }
    }

    return undefined;
  };

  const tsServerMs = pickEpochMs(lookup.ts, lookup.timestamp, lookup.time);
  const tsDeviceMs = pickEpochMs(lookup.tsEpochMs, lookup.ts_epoch_ms);

  return {
    ...merged,
    ...compat,
    parameters,
    schemaVersion: asNumber(lookup.schemaVersion) ?? lookup.schemaVersion,
    msgType: lookup.msgType != null ? String(lookup.msgType) : lookup.msgType,
    deviceId: lookup.deviceId != null ? String(lookup.deviceId) : lookup.deviceId,
    deviceType: lookup.deviceType != null ? String(lookup.deviceType) : lookup.deviceType,
    siteId: lookup.siteId != null ? String(lookup.siteId) : lookup.siteId,
    temperature: pickNumberAlias(lookup, [
      "temperature",
      "Temperature",
      "Temperature deg",
      "temperature deg",
      "temperature Deg",
      "temp",
      "Temp",
    ]),
    humidity: pickNumberAlias(lookup, [
      "humidity",
      "Humidity",
      "Humidity %",
      "humidity %",
      "hum",
      "Hum",
    ]),
    tsServerMs,
    tsDeviceMs,
    ts: pickEpochMs(tsServerMs, tsDeviceMs),
    _schemaValid: isBiotTelemetryRecord(lookup, parameters),
  };
};

const normalizeArray = (arr: any) =>
  Array.isArray(arr) ? arr.map(unmarshalItem).map(normalizeReading) : [];

const normalizeTimeoutMs = (timeoutMs: any, fallbackMs = DEFAULT_FETCH_TIMEOUT_MS) => {
  const n = Number(timeoutMs);
  if (Number.isFinite(n) && n > 0) {
    return Math.max(1_000, Math.round(n));
  }
  return fallbackMs;
};

const toQueryValue = (value: any) => {
  if (value == null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const out = String(value);
    return out.length ? out : undefined;
  }
  try {
    const out = JSON.stringify(value);
    return out && out !== "{}" ? out : undefined;
  } catch {
    return undefined;
  }
};

const buildApiUrl = (query?: Record<string, any>) => {
  const url = new URL(API_ENDPOINT);
  Object.entries(query ?? {}).forEach(([key, raw]) => {
    const value = toQueryValue(raw);
    if (value !== undefined) url.searchParams.append(String(key), value);
  });
  return url.toString();
};

async function fetchText(url: string, options: { timeoutMs?: number } = {}) {
  const timeoutMs = normalizeTimeoutMs(options?.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS);
  const res = await axios.get(url, {
    timeout: timeoutMs,
    responseType: "text",
    transformResponse: [(data) => data],
    headers: { "Content-Type": "application/json" },
  });

  if (typeof res.data === "string") return res.data;
  if (res.data == null) return "";
  if (typeof res.data === "object") return JSON.stringify(res.data);
  return String(res.data);
}

const firstDefined = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const extractIoTReadingsNextToken = (json: any) => {
  if (!json || typeof json !== "object") return undefined;

  const pagination = json.pagination && typeof json.pagination === "object" ? json.pagination : {};
  const iotPage =
    pagination.IoTReadings && typeof pagination.IoTReadings === "object"
      ? pagination.IoTReadings
      : {};

  const rootLek = json.LastEvaluatedKey;
  const iotLek = firstDefined(
    json.IoTReadingsLastEvaluatedKey,
    json.iotReadingsLastEvaluatedKey,
    iotPage.lastEvaluatedKey,
    rootLek?.IoTReadings,
    rootLek?.iotReadings
  );

  return firstDefined(
    json.IoTReadingsNextToken,
    json.iotReadingsNextToken,
    json.IoTReadingsCursor,
    json.iotReadingsCursor,
    json.nextTokenIoTReadings,
    iotPage.nextToken,
    iotPage.cursor,
    pagination.IoTReadingsNextToken,
    pagination.iotReadingsNextToken,
    json.nextToken,
    json.pageToken,
    json.cursor,
    json.continuationToken,
    iotLek,
    rootLek
  );
};

const extractIoTReadingsHasMore = (json: any) => {
  if (!json || typeof json !== "object") return undefined;

  const pagination = json.pagination && typeof json.pagination === "object" ? json.pagination : {};
  const iotPage =
    pagination.IoTReadings && typeof pagination.IoTReadings === "object"
      ? pagination.IoTReadings
      : {};

  const raw = firstDefined(
    json.IoTReadingsHasMore,
    json.iotReadingsHasMore,
    iotPage.hasMore,
    iotPage.hasNextPage,
    pagination.IoTReadingsHasMore,
    pagination.hasMore,
    pagination.hasNextPage,
    json.hasMore,
    json.hasNextPage,
    json.truncated
  );

  if (raw === undefined || raw === null) return undefined;
  const parsed = parseBoolean(raw);
  if (typeof parsed === "boolean") return parsed;

  const n = Number(raw);
  if (Number.isFinite(n)) return n !== 0;
  return undefined;
};

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;
const OFFLINE_AGE_LIMIT_MS = 30_000;
const STALE_MIN_MISSED_POLLS = 3;
const OFFLINE_MIN_MISSED_POLLS = 6;
const RECOVERY_HITS_FROM_OFFLINE = 2;
const REALTIME_STATE_TTL_MS = 30 * 60 * 1000;

type OnlineStatusTag = "online" | "stale" | "offline";

type RealtimeOnlineState = {
  lastSeenTs?: number;
  missedPolls: number;
  status: OnlineStatusTag;
  recoveryHits: number;
  lastPollAt: number;
};

const realtimeStateByDevice = new Map<string, RealtimeOnlineState>();

const parseOnlineStatusTag = (value: any): OnlineStatusTag | undefined => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "online" || raw === "stale" || raw === "offline") return raw;
  return undefined;
};

const resolveHeartbeatTsForStatus = (item: any) =>
  pickEpochMs(
    item?.tsServerMs,
    item?.ts,
    item?.timestamp,
    item?.time,
    item?.tsDeviceMs,
    item?.tsEpochMs,
    item?.ts_epoch_ms
  );

const COMMON_ISSUE_KEYS = [
  "Common Issue",
  "Common Issues",
  "Common Alarm",
  "CommonAlarm",
  "Common_Issue",
  "Common_Alarm",
  "common_issue",
  "common alarm",
  "common issue",
  "commonAlarm",
  "commonIssue",
] as const;

const hasCommonIssue = (item: any) => {
  const merged = item?.payload && typeof item.payload === "object" ? { ...item, ...item.payload } : item;
  const lower: Record<string, any> = {};
  Object.entries(merged || {}).forEach(([k, v]) => {
    lower[String(k).toLowerCase()] = v;
  });

  return COMMON_ISSUE_KEYS.some((k) => {
    const lk = k.toLowerCase();
    if (!(lk in lower)) return false;
    const v = lower[lk];
    if (typeof v === "boolean") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n !== 0;
    return Boolean(v);
  });
};

const resolveStatusByAgeAndMisses = (ageMs: number, missedPolls: number): OnlineStatusTag => {
  if (ageMs > OFFLINE_AGE_LIMIT_MS || missedPolls >= OFFLINE_MIN_MISSED_POLLS) {
    return "offline";
  }
  if (ageMs > OFFLINE_AFTER_MS || missedPolls >= STALE_MIN_MISSED_POLLS) {
    return "stale";
  }
  return "online";
};

const advanceMissingRealtimeStates = (seenDeviceKeys: Set<string>, nowMs: number) => {
  for (const [key, prev] of realtimeStateByDevice.entries()) {
    if (seenDeviceKeys.has(key)) continue;

    if (nowMs - prev.lastPollAt > REALTIME_STATE_TTL_MS) {
      realtimeStateByDevice.delete(key);
      continue;
    }

    const lastSeenTs = Number.isFinite(prev.lastSeenTs) ? prev.lastSeenTs : undefined;
    const ageMs = Number.isFinite(lastSeenTs) ? Math.max(0, nowMs - (lastSeenTs as number)) : Number.POSITIVE_INFINITY;
    const missedPolls = (prev.missedPolls ?? 0) + 1;
    const status = resolveStatusByAgeAndMisses(ageMs, missedPolls);

    realtimeStateByDevice.set(key, {
      lastSeenTs,
      missedPolls,
      recoveryHits: 0,
      status,
      lastPollAt: nowMs,
    });
  }
};

const applyRealtimeHealthState = (items: Reading[]) => {
  const nowMs = Date.now();
  const seenDeviceKeys = new Set<string>();

  const annotated = (items ?? []).map((item) => {
    const key = deviceKey(item);
    const heartbeatTs = resolveHeartbeatTsForStatus(item);

    if (!key) {
      const ts = Number.isFinite(heartbeatTs) ? Number(heartbeatTs) : undefined;
      const ageMs = Number.isFinite(ts) ? Math.max(0, nowMs - (ts as number)) : Number.POSITIVE_INFINITY;
      const status = resolveStatusByAgeAndMisses(ageMs, 0);
      return {
        ...item,
        _onlineStatus: status,
        _isOnline: status !== "offline",
        _heartbeatAgeMs: Number.isFinite(ageMs) ? Math.round(ageMs) : undefined,
        _missedPolls: 0,
        _lastHeartbeatTs: ts,
      };
    }

    const prev = realtimeStateByDevice.get(key);
    const prevStatus = prev?.status ?? "online";
    let lastSeenTs = Number.isFinite(prev?.lastSeenTs) ? Number(prev?.lastSeenTs) : undefined;
    let missedPolls = prev?.missedPolls ?? 0;
    let recoveryHits = prev?.recoveryHits ?? 0;
    const wasRecoveringFromOffline = prevStatus === "offline" || recoveryHits > 0;
    const heartbeatTsMs = Number.isFinite(heartbeatTs) ? Number(heartbeatTs) : undefined;

    let fresh = false;
    if (Number.isFinite(heartbeatTsMs)) {
      if (!Number.isFinite(lastSeenTs) || (heartbeatTsMs as number) > (lastSeenTs as number)) {
        fresh = true;
        lastSeenTs = heartbeatTsMs;
      } else if (!Number.isFinite(lastSeenTs)) {
        lastSeenTs = heartbeatTsMs;
      }
    }

    if (fresh) {
      missedPolls = 0;
      recoveryHits = wasRecoveringFromOffline ? recoveryHits + 1 : 0;
    } else {
      missedPolls = (prev?.missedPolls ?? 0) + 1;
      recoveryHits = 0;
      if (!Number.isFinite(lastSeenTs) && Number.isFinite(heartbeatTsMs)) {
        lastSeenTs = heartbeatTsMs;
      }
    }

    const ageMs = Number.isFinite(lastSeenTs) ? Math.max(0, nowMs - (lastSeenTs as number)) : Number.POSITIVE_INFINITY;
    let status = resolveStatusByAgeAndMisses(ageMs, missedPolls);

    if (wasRecoveringFromOffline && fresh && recoveryHits < RECOVERY_HITS_FROM_OFFLINE) {
      status = "stale";
    }

    if (status === "offline") {
      recoveryHits = 0;
    } else if (status === "online") {
      recoveryHits = 0;
    }

    realtimeStateByDevice.set(key, {
      lastSeenTs,
      missedPolls,
      status,
      recoveryHits,
      lastPollAt: nowMs,
    });
    seenDeviceKeys.add(key);

    return {
      ...item,
      _onlineStatus: status,
      _isOnline: status !== "offline",
      _heartbeatAgeMs: Number.isFinite(ageMs) ? Math.round(ageMs) : undefined,
      _missedPolls: missedPolls,
      _lastHeartbeatTs: lastSeenTs,
    };
  });

  advanceMissingRealtimeStates(seenDeviceKeys, nowMs);
  return annotated;
};

const classifyDeviceHealth = (item: any) => {
  const merged = item?.payload && typeof item.payload === "object" ? { ...item, ...item.payload } : item;
  const taggedStatus = parseOnlineStatusTag(merged?._onlineStatus);
  const fallbackTs = resolveHeartbeatTsForStatus(merged);
  const fallbackOnline = Number.isFinite(fallbackTs) ? Date.now() - Number(fallbackTs) <= OFFLINE_AFTER_MS : true;
  const online = taggedStatus ? taggedStatus !== "offline" : fallbackOnline;
  const commonIssue = hasCommonIssue(merged);

  const category = !online || commonIssue ? "issue" : "good";
  return { online, commonIssue, category, status: taggedStatus ?? (online ? "online" : "offline") };
};

const buildHealthSummary = (items: any[] = []) => {
  const total = items.length;
  let online = 0;
  let good = 0;
  let issue = 0;

  items.forEach((item) => {
    const { online: isOnline, category } = classifyDeviceHealth(item);
    if (isOnline) online += 1;
    if (category === "good") good += 1;
    else issue += 1;
  });

  return { total, online, good, issue };
};

function deviceKey(item: any) {
  const raw = item?.deviceId;
  if (raw == null) return "";
  return String(raw).trim().toUpperCase();
}

function hasObject(value: any) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeReadingWithFallback(primary: any, fallback: any) {
  if (!fallback || typeof fallback !== "object") return primary;
  if (!primary || typeof primary !== "object") return fallback;

  const merged = { ...fallback, ...primary };

  const primaryStatus = hasObject(primary.status) ? primary.status : {};
  const fallbackStatus = hasObject(fallback.status) ? fallback.status : {};
  if (Object.keys(primaryStatus).length || Object.keys(fallbackStatus).length) {
    merged.status = { ...fallbackStatus, ...primaryStatus };
  }

  const primaryParams = Array.isArray(primary.parameters) ? primary.parameters : [];
  const fallbackParams = Array.isArray(fallback.parameters) ? fallback.parameters : [];
  if (primaryParams.length > 0) merged.parameters = primaryParams;
  else if (fallbackParams.length > 0) merged.parameters = fallbackParams;

  const copyIfMissing = (key: string) => {
    const current = merged[key];
    const missing =
      current === undefined ||
      current === null ||
      (typeof current === "string" && current.trim() === "");
    if (missing && fallback[key] !== undefined) {
      merged[key] = fallback[key];
    }
  };

  copyIfMissing("temperature");
  copyIfMissing("humidity");
  copyIfMissing("wifi_strength");
  copyIfMissing("wifiStrength");
  copyIfMissing("deviceName");
  copyIfMissing("deviceType");
  copyIfMissing("siteId");
  copyIfMissing("ts");
  copyIfMissing("tsServerMs");
  copyIfMissing("tsDeviceMs");

  return merged;
}

function mergeRealtimeAndReadings(realtime: any[], readings: any[]) {
  const realtimeSafe = Array.isArray(realtime) ? realtime : [];
  const readingsSafe = Array.isArray(readings) ? readings : [];

  if (!realtimeSafe.length && !readingsSafe.length) {
    return { mergedRealtime: [], readingOnly: [] };
  }
  if (!realtimeSafe.length) {
    return { mergedRealtime: [], readingOnly: readingsSafe };
  }
  if (!readingsSafe.length) {
    return { mergedRealtime: realtimeSafe, readingOnly: [] };
  }

  const readingsByDevice = new Map<string, any>();
  readingsSafe.forEach((item) => {
    const key = deviceKey(item);
    if (!key) return;

    const prev = readingsByDevice.get(key);
    if (!prev || Number(item?.ts || 0) >= Number(prev?.ts || 0)) {
      readingsByDevice.set(key, item);
    }
  });

  const mergedRealtime = realtimeSafe.map((item) => {
    const key = deviceKey(item);
    if (!key) return item;
    const fallback = readingsByDevice.get(key);
    return mergeReadingWithFallback(item, fallback);
  });

  const realtimeKeys = new Set(mergedRealtime.map(deviceKey).filter(Boolean));
  const readingOnly = readingsSafe.filter((item) => {
    const key = deviceKey(item);
    return !key || !realtimeKeys.has(key);
  });

  return { mergedRealtime, readingOnly };
}

async function fetchDashboardData(options: FetchDashboardOptions = {}): Promise<DashboardResponse> {
  const query = options?.query && typeof options.query === "object" ? options.query : {};
  const timeoutMs = normalizeTimeoutMs(options?.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS);
  const url = buildApiUrl(query);
  const text = await fetchText(url, { timeoutMs });
  const outer = safeJsonParse(text);

  if (!outer) {
    throw new Error(`Response is not valid JSON. Raw: ${text.slice(0, 200)}`);
  }

  const json = normalizeLambdaResponse(outer);
  const ioTReadingsNextToken = extractIoTReadingsNextToken(json);
  const ioTReadingsHasMoreRaw = extractIoTReadingsHasMore(json);
  const ioTReadingsHasMore =
    typeof ioTReadingsHasMoreRaw === "boolean"
      ? ioTReadingsHasMoreRaw
      : ioTReadingsNextToken !== undefined;

  const IoTReadings = normalizeArray(json?.IoTReadings);
  const RealTimeDataMonitor = normalizeArray(json?.RealTimeDataMonitor);
  const ESP32_Alarms = normalizeArray(json?.ESP32_Alarms);
  const summary = buildHealthSummary(RealTimeDataMonitor.length ? RealTimeDataMonitor : IoTReadings);

  return {
    IoTReadings,
    RealTimeDataMonitor,
    ESP32_Alarms,
    summary,
    _meta: {
      ioTReadingsNextToken,
      ioTReadingsHasMore,
    },
  };
}

const normalizeCursorToken = (cursor: any) => {
  if (cursor == null) return undefined;
  if (typeof cursor === "string" || typeof cursor === "number" || typeof cursor === "boolean") {
    const out = String(cursor);
    return out.length ? out : undefined;
  }
  try {
    const out = JSON.stringify(cursor);
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
};

const readingIdentity = (item: any) => {
  const deviceId = item?.deviceId != null ? String(item.deviceId) : "";
  const tsServer = pickEpochMs(item?.tsServerMs, item?.ts, item?.timestamp, item?.time);
  const tsDevice = pickEpochMs(item?.tsDeviceMs, item?.tsEpochMs, item?.ts_epoch_ms);
  const msgType = item?.msgType != null ? String(item.msgType) : "";
  const parameterCount = Array.isArray(item?.parameters) ? item.parameters.length : 0;
  return `${deviceId}|${tsServer ?? ""}|${tsDevice ?? ""}|${msgType}|${parameterCount}`;
};

async function fetchAllIoTReadings({
  deviceId,
  startTsEpochMs,
  endTsEpochMs,
  maxPages = 80,
}: {
  deviceId?: string;
  startTsEpochMs?: number;
  endTsEpochMs?: number;
  maxPages?: number;
} = {}) {
  const allRows: Reading[] = [];
  const seenRows = new Set<string>();
  const seenCursors = new Set<string>();
  let pagesFetched = 0;
  let stopReason = "no_more";
  let cursor: any = undefined;
  let firstPageRawCount = 0;

  while (pagesFetched < maxPages) {
    const query: Record<string, any> = {};
    query.iotReadingsOnly = "1";

    if (deviceId != null && String(deviceId).trim()) {
      query.deviceId = String(deviceId).trim();
    }

    const startMs = Number(startTsEpochMs);
    if (Number.isFinite(startMs)) {
      const v = Math.round(startMs);
      query.startTsEpochMs = v;
      query.startTs = v;
      query.fromTs = v;
    }

    const endMs = Number(endTsEpochMs);
    if (Number.isFinite(endMs)) {
      const v = Math.round(endMs);
      query.endTsEpochMs = v;
      query.endTs = v;
      query.toTs = v;
    }

    if (cursor !== undefined) {
      const cursorToken = normalizeCursorToken(cursor);
      if (!cursorToken) {
        stopReason = "invalid_cursor";
        break;
      }

      query.cursor = cursorToken;
      query.nextToken = cursorToken;
      query.pageToken = cursorToken;
      query.continuationToken = cursorToken;
    }

    const page = await fetchDashboardData({ query });
    pagesFetched += 1;

    const pageRows = Array.isArray(page?.IoTReadings) ? page.IoTReadings : [];
    if (pagesFetched === 1) firstPageRawCount = pageRows.length;

    let addedThisPage = 0;
    pageRows.forEach((row) => {
      const key = readingIdentity(row);
      if (!seenRows.has(key)) {
        seenRows.add(key);
        allRows.push(row);
        addedThisPage += 1;
      }
    });

    const hasMore = page?._meta?.ioTReadingsHasMore === true;
    const nextCursor = page?._meta?.ioTReadingsNextToken;
    if (!hasMore && nextCursor === undefined) {
      stopReason = "no_more";
      break;
    }

    if (nextCursor === undefined) {
      stopReason = "missing_next_token";
      break;
    }

    const nextCursorKey = normalizeCursorToken(nextCursor);
    if (!nextCursorKey) {
      stopReason = "invalid_next_token";
      break;
    }

    if (seenCursors.has(nextCursorKey)) {
      stopReason = "repeated_next_token";
      break;
    }

    if (addedThisPage === 0) {
      stopReason = "no_new_rows";
      break;
    }

    seenCursors.add(nextCursorKey);
    cursor = nextCursor;
  }

  if (pagesFetched >= maxPages) {
    stopReason = "max_pages_reached";
  }

  const likelySinglePageCap = pagesFetched === 1 && firstPageRawCount >= 1500;
  const potentiallyIncomplete =
    stopReason === "max_pages_reached" || stopReason === "missing_next_token" || likelySinglePageCap;

  return {
    IoTReadings: allRows,
    _meta: {
      pagesFetched,
      stopReason,
      potentiallyIncomplete,
      likelySinglePageCap,
    },
  };
}

const computeUptimeStats = (readings: any[]) => {
  if (!readings.length) {
    return {
      uptime: 0,
      windowMs: 0,
      offlineMs: 0,
      gapCount: 0,
      readingCount: 0,
      firstTs: undefined,
      lastTs: undefined,
      sorted: [] as any[],
    };
  }

  const sorted = [...readings].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  let offlineMs = 0;
  let gapCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1]?.ts);
    const curr = Number(sorted[i]?.ts);
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
    const gap = curr - prev;
    if (gap > OFFLINE_AFTER_MS) {
      offlineMs += gap - OFFLINE_AFTER_MS;
      gapCount += 1;
    }
  }

  const firstTs = Number(sorted[0]?.ts);
  const lastTs = Number(sorted.at(-1)?.ts);
  const windowMs =
    Number.isFinite(firstTs) && Number.isFinite(lastTs) ? Math.max(1, lastTs - firstTs) : 1;
  const uptime = Math.max(0, Math.min(1, 1 - offlineMs / windowMs));

  return {
    uptime,
    windowMs,
    offlineMs,
    gapCount,
    readingCount: sorted.length,
    firstTs: Number.isFinite(firstTs) ? firstTs : undefined,
    lastTs: Number.isFinite(lastTs) ? lastTs : undefined,
    sorted,
  };
};

export async function getDashboard() {
  return fetchDashboardData();
}

export async function getRealtime() {
  let data: DashboardResponse;
  try {
    data = await fetchDashboardData({
      query: { statusOnly: "1" },
      timeoutMs: FAST_STATUS_TIMEOUT_MS,
    });
  } catch {
    data = await fetchDashboardData();
  }

  const realtimeRaw = data.RealTimeDataMonitor ?? [];
  const historyRaw = data.IoTReadings ?? [];
  const { mergedRealtime, readingOnly } = mergeRealtimeAndReadings(realtimeRaw, historyRaw);
  const realtimeItems = mergedRealtime.filter((item) => item?._schemaValid);
  const fallbackItems = readingOnly.filter((item) => item?._schemaValid);
  const baseItems = realtimeItems.length ? [...realtimeItems, ...fallbackItems] : fallbackItems;
  const items = applyRealtimeHealthState(baseItems);
  const realtimeKeys = new Set(realtimeItems.map((item) => deviceKey(item)).filter(Boolean));
  const annotatedRealtimeItems = realtimeItems.length
    ? items.filter((item) => realtimeKeys.has(deviceKey(item)))
    : [];
  const summary = annotatedRealtimeItems.length ? buildHealthSummary(annotatedRealtimeItems) : data.summary;

  return { items, realtimeItems: annotatedRealtimeItems, summary };
}

export async function getAlarms() {
  const data = await fetchDashboardData();
  return data.ESP32_Alarms ?? [];
}

export async function getIoTReadingsHistory({
  deviceId,
  from,
  to,
  maxPages,
}: {
  deviceId?: string;
  from?: number;
  to?: number;
  maxPages?: number;
} = {}) {
  const requestedDeviceId = String(deviceId || "").trim();
  const target = requestedDeviceId.toLowerCase();

  const resolveHistoryTs = (item: any) =>
    pickEpochMs(
      item?.tsDeviceMs,
      item?.tsEpochMs,
      item?.ts_epoch_ms,
      item?.tsServerMs,
      item?.ts,
      item?.timestamp,
      item?.time
    );

  const normalizeAndFilterRows = (rows: Reading[] = []) =>
    (rows ?? [])
      .filter((it) => itemHasSchema(it))
      .map((it) => {
        const historyTs = resolveHistoryTs(it);
        return {
          ...it,
          ts: historyTs ?? it?.ts,
        };
      })
      .filter((it) => {
        const ts = Number(it.ts);
        if (!Number.isFinite(ts)) return false;
        if (target && String(it.deviceId || "").trim().toLowerCase() !== target) return false;
        if (Number.isFinite(from) && ts < (from as number)) return false;
        if (Number.isFinite(to) && ts > (to as number)) return false;
        return true;
      })
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  const scoped = await fetchAllIoTReadings({
    deviceId: requestedDeviceId || undefined,
    startTsEpochMs: from,
    endTsEpochMs: to,
    maxPages,
  });
  let filteredRows = normalizeAndFilterRows(scoped.IoTReadings ?? []);
  if (filteredRows.length > 0) return filteredRows;

  // Backend range filtering can miss same-day windows.
  // Retry with device-scoped fetch without server-side range, then apply local range filter.
  if (Number.isFinite(from) || Number.isFinite(to)) {
    const fallback = await fetchAllIoTReadings({
      deviceId: requestedDeviceId || undefined,
      maxPages,
    });
    filteredRows = normalizeAndFilterRows(fallback.IoTReadings ?? []);
  }

  return filteredRows;
}

const itemHasSchema = (item: any) => item?._schemaValid === true;

export async function getDeviceHistory(id: string, from?: number, to?: number) {
  return getIoTReadingsHistory({ deviceId: id, from, to });
}

export async function getAnalytics() {
  const { IoTReadings, ESP32_Alarms, RealTimeDataMonitor, summary } = await fetchDashboardData();
  const readings = (IoTReadings ?? []).filter((it) => itemHasSchema(it));
  const realtime = (RealTimeDataMonitor ?? []).filter((it) => itemHasSchema(it));

  const byDevice = new Map<string, any[]>();
  readings.forEach((r) => {
    const id = String(r.deviceId ?? "").toLowerCase();
    if (!byDevice.has(id)) byDevice.set(id, []);
    byDevice.get(id)!.push(r);
  });

  const uptime = Array.from(byDevice.entries())
    .map(([id, list]) => {
      const stats = computeUptimeStats(list);
      const lastReading = stats.sorted.at(-1);
      const { sorted, ...publicStats } = stats;
      return {
        deviceId: id,
        ...publicStats,
        rssi: getRssi(lastReading),
        wifiStrength: getWifiStrength(lastReading),
      };
    })
    .sort((a, b) => a.uptime - b.uptime);

  const alarms = (ESP32_Alarms ?? []).reduce<Record<string, number>>((acc, row) => {
    const id = String(row.deviceId ?? "unknown");
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  const lastReadings = realtime.length ? realtime : readings;
  const anomalies = lastReadings
    .map((r) => {
      const score = (() => {
        const temp = Number(r.temperature);
        const hum = Number(r.humidity);
        let s = 0;
        if (Number.isFinite(temp) && (temp < 0 || temp > 80)) s += 1;
        if (Number.isFinite(hum) && (hum < 5 || hum > 95)) s += 1;
        if (!classifyDeviceHealth(r).online) s += 1;
        return s;
      })();
      return { deviceId: r.deviceId, score, ts: r.ts };
    })
    .filter((x) => x.score > 0);

  return {
    uptime,
    alarms,
    anomalies,
    summary,
    totalDevices: byDevice.size,
  };
}
