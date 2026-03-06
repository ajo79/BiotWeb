export type EnvValues = { temperature?: number; humidity?: number };

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

const toNumber = (value: any): number | undefined => {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    return extractNumberFromString(value);
  }
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

export function getEnvValues(item: any): EnvValues {
  const pick = (source: any, aliases: string[]) => {
    if (!source || typeof source !== "object") return undefined;
    const lower: Record<string, any> = {};
    Object.entries(source).forEach(([k, v]) => (lower[String(k).toLowerCase()] = v));
    for (const alias of aliases) {
      const lk = alias.toLowerCase();
      if (lk in lower) {
        const n = toNumber(lower[lk]);
        if (n !== undefined) return n;
      }
    }
    return undefined;
  };
  const src = flattenPayloadDeep(item);
  return {
    temperature: pick(src, ["temperature", "temperature deg", "temp"]),
    humidity: pick(src, ["humidity", "humidity %", "hum"]),
  };
}

export type PressMetric = { id: string; amps: number };

export function extractPressMetrics(item: any): PressMetric[] {
  const src = flattenPayloadDeep(item);
  const presses: Record<string, Partial<PressMetric>> = {};
  Object.entries(src || {}).forEach(([key, val]) => {
    const normalized = String(key).replace(/[_-]+/g, " ").trim();
    if (/alarm/i.test(normalized)) return;
    const idMatch = normalized.match(/(?:press|phase)\s*([0-9]+)/i);
    if (!idMatch) return;
    if (!/amp/i.test(normalized)) return;
    const id = idMatch[1];
    const amps = toNumber(val);
    if (amps === undefined) return;
    presses[id] = presses[id] || {};
    presses[id].amps = amps;
  });
  return Object.keys(presses)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ id, amps: presses[id].amps ?? 0 }));
}
