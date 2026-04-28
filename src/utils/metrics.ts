export type EnvValues = { temperature?: number; humidity?: number };

export type DecodedParameter = {
  id: string;
  key: string;
  label: string;
  value: any;
  unit: string;
  valueType: string;
  order: number;
  showOnCard: boolean;
  alarm: { active: boolean; severity: string };
};

export type NumericMetric = {
  id: string;
  key: string;
  label: string;
  displayLabel: string;
  unit: string;
  order: number;
  value: number;
  isPhaseAmp: boolean;
  phaseId: string | undefined;
};

const parseJsonObject = (value: any) => {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const extractNumberFromString = (value: string) => {
  const cleaned = value.replace(/,/g, " ");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeId = (raw: string) =>
  String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "param";

export const toNumber = (value: any): number | undefined => {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return extractNumberFromString(value);
  if (typeof value === "object") {
    if ("N" in value) return toNumber((value as any).N);
    if ("S" in value) return toNumber((value as any).S);
    if ("value" in value) return toNumber((value as any).value);
    if ("Value" in value) return toNumber((value as any).Value);
    if ("reading" in value) return toNumber((value as any).reading);
    if ("Reading" in value) return toNumber((value as any).Reading);
    if ("amp" in value) return toNumber((value as any).amp);
    if ("amps" in value) return toNumber((value as any).amps);
    if ("M" in value) return toNumber((value as any).M);
  }
  return undefined;
};

export function flattenPayloadDeep<T extends Record<string, any>>(item: T): T {
  if (!item || typeof item !== "object") return item;
  const out: any = { ...item };
  let guard = 0;
  let payload: any = out.payload ?? out.Payload;
  while (guard < 6) {
    if (typeof payload === "string") {
      const parsed = parseJsonObject(payload);
      if (parsed) payload = parsed;
      else break;
    }
    if (!payload || typeof payload !== "object") break;
    Object.assign(out, payload);
    delete out.payload;
    delete out.Payload;
    payload = (payload as any).payload ?? (payload as any).Payload;
    guard += 1;
  }
  return out;
}

const normalizeAlarm = (alarm: any) => {
  if (!alarm || typeof alarm !== "object") return { active: false, severity: "none" };
  return {
    active: Boolean(alarm.active ?? alarm.isActive ?? alarm.alarm ?? alarm.flag ?? alarm.value),
    severity: String(alarm.severity ?? alarm.level ?? "none").toLowerCase(),
  };
};

const resolveParameterArray = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = parseJsonObject(raw);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
};

const compareParameters = (a: DecodedParameter, b: DecodedParameter) =>
  a.order - b.order || a.label.localeCompare(b.label) || a.key.localeCompare(b.key);

export function getDecodedParameters(item: any): DecodedParameter[] {
  const src = flattenPayloadDeep(item);
  const rawParams = resolveParameterArray(src?.parameters);

  const normalized = rawParams
    .map((entry, idx) => {
      const resolved = typeof entry === "string" ? parseJsonObject(entry) : entry;
      if (!resolved || typeof resolved !== "object") return null;

      const key = String(resolved.key ?? `param_${idx + 1}`).trim();
      const label = String(resolved.label ?? resolved.key ?? `Parameter ${idx + 1}`).trim();
      const id = normalizeId(key || label || `param_${idx + 1}`);
      const order = toNumber(resolved.order);

      return {
        id,
        key,
        label: label || key || `Parameter ${idx + 1}`,
        value: resolved.value,
        unit: resolved.unit != null ? String(resolved.unit).trim() : "",
        valueType: String(resolved.valueType ?? resolved.type ?? typeof resolved.value),
        order: Number.isFinite(order) ? Number(order) : idx + 1,
        showOnCard: resolved.showOnCard !== false,
        alarm: normalizeAlarm(resolved.alarm),
      } satisfies DecodedParameter;
    })
    .filter((entry): entry is DecodedParameter => Boolean(entry))
    .sort(compareParameters);

  const deduped = new Map<string, DecodedParameter>();
  normalized.forEach((param) => {
    deduped.set(param.id, param);
  });

  return Array.from(deduped.values()).sort(compareParameters);
}

export const formatParameterLabel = (param: Pick<DecodedParameter, "label" | "unit" | "key">) => {
  const label = String(param?.label ?? "").trim() || "Parameter";
  const unit = String(param?.unit ?? "").trim();
  const key = String((param as any)?.key ?? "").trim();

  const text = `${key} ${label}`.toLowerCase();
  const isShiftNumber = text.includes("current shift number") || text.includes("shift number");

  if (!unit || isShiftNumber) return label;
  if (label.toLowerCase().includes(unit.toLowerCase())) return label;
  return `${label} (${unit})`;
};


const formatNumber = (value: number) => {
  const fixed = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
};

export const formatParameterValue = (value: any) => {
  if (value == null) return "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return formatNumber(value);
  if (typeof value === "string") return value.trim() || "--";
  if (typeof value === "object") {
    const numeric = toNumber(value);
    if (numeric !== undefined) return formatNumber(numeric);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const detectPhaseAmp = (param: Pick<DecodedParameter, "key" | "label" | "unit">) => {
  const key = String(param?.key ?? "").toLowerCase();
  const label = String(param?.label ?? "").toLowerCase();
  const unit = String(param?.unit ?? "").toLowerCase();
  const combined = `${key} ${label}`;
  const phaseMatch = combined.match(/(?:press|phase)[_\s-]?(\d+)/);
  if (!phaseMatch) return { isPhaseAmp: false as const };
  const ampLike = /amp|current/.test(combined) || unit === "a";
  if (!ampLike) return { isPhaseAmp: false as const };
  return { isPhaseAmp: true as const, phaseId: phaseMatch[1] };
};

const compareMetrics = (a: NumericMetric, b: NumericMetric) =>
  a.order - b.order || a.displayLabel.localeCompare(b.displayLabel) || a.id.localeCompare(b.id);

export function getNumericParameterMetrics(item: any): NumericMetric[] {
  const params = getDecodedParameters(item);
  const metrics = params
    .map((param) => {
      const numericValue = toNumber(param.value);
      if (numericValue === undefined) return null;
      const phase = detectPhaseAmp(param);
      return {
        id: `param:${param.id}`,
        key: param.key,
        label: param.label,
        displayLabel: formatParameterLabel(param),
        unit: param.unit,
        order: param.order,
        value: numericValue,
        isPhaseAmp: phase.isPhaseAmp,
        phaseId: phase.phaseId,
      } satisfies NumericMetric;
    })
    .filter((entry): entry is NumericMetric => Boolean(entry))
    .sort(compareMetrics);

  const deduped = new Map<string, NumericMetric>();
  metrics.forEach((metric) => {
    deduped.set(metric.id, metric);
  });

  return Array.from(deduped.values()).sort(compareMetrics);
}

export function getNumericMetricValue(item: any, metricId: string): number | undefined {
  const match = getNumericParameterMetrics(item).find((metric) => metric.id === metricId);
  return match?.value;
}

export function getEnvValues(item: any): EnvValues {
  const src = flattenPayloadDeep(item);
  const pick = (aliases: string[]) => {
    const lower: Record<string, any> = {};
    Object.entries(src || {}).forEach(([k, v]) => {
      lower[String(k).toLowerCase()] = v;
    });
    for (const alias of aliases) {
      const lk = alias.toLowerCase();
      if (!(lk in lower)) continue;
      const n = toNumber(lower[lk]);
      if (n !== undefined) return n;
    }
    return undefined;
  };

  const params = getDecodedParameters(item);
  const pickFromParams = (matcher: (text: string) => boolean) => {
    for (const param of params) {
      const text = `${param.key} ${param.label}`.toLowerCase();
      if (!matcher(text)) continue;
      const n = toNumber(param.value);
      if (n !== undefined) return n;
    }
    return undefined;
  };

  return {
    temperature: pickFromParams((text) => text.includes("temp")) ?? pick(["temperature", "temperature deg", "temp"]),
    humidity: pickFromParams((text) => text.includes("humid")) ?? pick(["humidity", "humidity %", "hum"]),
  };
}

export type PressMetric = { id: string; amps: number };

export function extractPressMetrics(item: any): PressMetric[] {
  const metrics = getNumericParameterMetrics(item).filter((metric) => metric.isPhaseAmp && metric.phaseId);
  return metrics
    .sort((a, b) => Number(a.phaseId) - Number(b.phaseId))
    .map((metric) => ({ id: String(metric.phaseId), amps: metric.value }));
}
