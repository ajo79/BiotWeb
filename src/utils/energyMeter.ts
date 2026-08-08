import { formatParameterValue, getNumericParameterMetrics, type NumericMetric } from "./metrics";

export type EnergyGroupTone =
  | "consumption"
  | "reactive"
  | "power"
  | "voltage"
  | "current"
  | "quality"
  | "runtime";
export type EnergyGroupLayout = "summary" | "phase_table";

export type EnergyMetricChip = {
  id?: string;
  label: string;
  value: string;
  unit?: string;
  rawValue?: number;
};

export type EnergyMetricGroup = {
  key: string;
  title: string;
  tone: EnergyGroupTone;
  layout?: EnergyGroupLayout;
  primary?: EnergyMetricChip;
  metrics: EnergyMetricChip[];
};

export type EnergyPreset = {
  id: "voltage" | "current" | "power" | "reactivePower" | "powerFactor" | "energy" | "runtime";
  title: string;
  description: string;
  metricIds: string[];
};

type MetricLike = {
  id: string;
  key?: string;
  label?: string;
  displayLabel?: string;
  unit?: string;
  order?: number;
  value?: number;
};

type PhaseMetricRow = {
  id: string;
  label: string;
  unit?: string;
  value: number;
  order: number;
};

const normalizeText = (value: string) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const metricText = (candidate: MetricLike) =>
  normalizeText([candidate.key, candidate.label, candidate.displayLabel, candidate.unit].filter(Boolean).join(" "));

const buildTokenSet = (candidate: MetricLike) => new Set(metricText(candidate).split(/\s+/).filter(Boolean));

const sortMetrics = <T extends MetricLike>(metrics: T[]) =>
  [...metrics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || metricText(a).localeCompare(metricText(b)));

const hasAllTokens = (tokens: Set<string>, required: string[]) => required.every((token) => tokens.has(token));

const matchesMetric = (candidate: MetricLike, aliases: string[][]) => {
  const tokens = buildTokenSet(candidate);
  return aliases.some((alias) => hasAllTokens(tokens, alias));
};

const takeFirst = <T extends MetricLike>(metrics: T[], aliases: string[][]) =>
  aliases.reduce<T | undefined>(
    (match, alias) => match ?? sortMetrics(metrics).find((metric) => matchesMetric(metric, [alias])),
    undefined
  );

const isMaximumDemandMetric = (metric: MetricLike) => {
  const tokens = buildTokenSet(metric);
  return tokens.has("demand") && (tokens.has("max") || tokens.has("maximum"));
};

const toMetricLike = (metric: NumericMetric): MetricLike => ({
  id: metric.id,
  key: metric.key,
  label: metric.label,
  displayLabel: metric.displayLabel,
  unit: metric.unit,
  order: metric.order,
  value: metric.value,
});

const toChip = (metric: MetricLike | undefined, fallbackLabel: string, overrideLabel?: string): EnergyMetricChip | undefined => {
  if (!metric) return undefined;
  return {
    id: metric.id,
    label: overrideLabel ?? metric.label ?? metric.displayLabel ?? fallbackLabel,
    value: formatParameterValue(metric.value, {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
    }),
    unit: metric.unit,
    rawValue: metric.value,
  };
};

const phaseOrder = ["L1", "L2", "L3"] as const;

const resolveVoltagePhaseLabel = (metric: MetricLike) => {
  const text = metricText(metric);
  if (text.includes("ln1") || /\bl1\b/.test(text)) return "L1";
  if (text.includes("ln2") || /\bl2\b/.test(text)) return "L2";
  if (text.includes("ln3") || /\bl3\b/.test(text)) return "L3";
  return null;
};

const resolveCurrentPhaseLabel = (metric: MetricLike) => {
  const text = metricText(metric);
  if (/\bl1\b/.test(text)) return "L1";
  if (/\bl2\b/.test(text)) return "L2";
  if (/\bl3\b/.test(text)) return "L3";
  return null;
};

const isVoltageMetric = (metric: MetricLike) => {
  const text = metricText(metric);
  return /\bvoltage\b|\bv\b/.test(text) && !text.includes("thd") && !text.includes("pt primary") && !text.includes("pt secondary");
};

const isCurrentMetric = (metric: MetricLike) => {
  const text = metricText(metric);
  return /\bcurrent\b|\ba\b/.test(text) && !text.includes("thd") && !text.includes("ct primary") && !text.includes("ct secondary");
};

const isPowerQualityMetric = (metric: MetricLike) => {
  const text = metricText(metric);
  return text.includes("pf") || text.includes("power factor") || text.includes("frequency") || text.includes("hz") || text.includes("thd");
};

const buildPhaseRows = (
  metrics: MetricLike[],
  resolver: (metric: MetricLike) => string | null
): PhaseMetricRow[] => {
  const rows = new Map<string, PhaseMetricRow>();

  sortMetrics(metrics).forEach((metric) => {
    if (typeof metric.value !== "number") return;
    const phase = resolver(metric);
    if (!phase) return;
    if (rows.has(phase)) return;
    rows.set(phase, {
      id: metric.id,
      label: phase,
      unit: metric.unit,
      value: metric.value,
      order: phaseOrder.indexOf(phase as (typeof phaseOrder)[number]),
    });
  });

  const ordered = phaseOrder
    .map((phase, index) => rows.get(phase) ?? null)
    .filter((entry): entry is PhaseMetricRow => Boolean(entry))
    .sort((a, b) => a.order - b.order);

  if (!ordered.length) return [];

  const average = ordered.reduce((sum, row) => sum + row.value, 0) / ordered.length;
  ordered.push({
    id: `${ordered[0].id}:avg`,
    label: "AVG",
    unit: ordered[0].unit,
    value: average,
    order: 99,
  });

  return ordered;
};

const phaseRowsToChips = (rows: PhaseMetricRow[]) =>
  rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: formatParameterValue(row.value),
    unit: row.unit,
    rawValue: row.value,
  }));

export function buildEnergyMetricGroups(item: any): EnergyMetricGroup[] {
  const metrics = getNumericParameterMetrics(item).map(toMetricLike);
  const regularPowerMetrics = metrics.filter((metric) => !isMaximumDemandMetric(metric));

  const kwh = takeFirst(metrics, [["meter", "kwh", "total"], ["kwh"]]);
  const kw = takeFirst(regularPowerMetrics, [["meter", "kw", "total"], ["kw"]]);
  const kva = takeFirst(regularPowerMetrics, [["meter", "kva", "total"], ["kva"]]);
  const kvar = takeFirst(metrics, [["meter", "kvar", "total"], ["kvar"]]);
  const kvah = takeFirst(metrics, [["meter", "kvah", "total"], ["kvah"]]);
  const kvarhTotal = takeFirst(metrics, [["meter", "kvarh", "total"], ["kvarh", "total"]]);
  const kvarhLag = takeFirst(metrics, [["meter", "kvarh", "lag"], ["kvarh", "lag"]]);
  const kvarhLead = takeFirst(metrics, [["meter", "kvarh", "lead"], ["kvarh", "lead"]]);
  const loadHour = takeFirst(metrics, [["meter", "load", "hour"], ["load", "hour"]]);
  const noLoadHour = takeFirst(metrics, [["meter", "no", "load", "hour"], ["no", "load", "hour"]]);
  const rpm = takeFirst(metrics, [["meter", "rpm"], ["rpm"]]);
  const maxDemandKw = takeFirst(metrics, [
    ["meter", "max", "demand", "kw"],
    ["meter", "maximum", "demand", "kw"],
    ["max", "demand", "kw"],
    ["maximum", "demand", "kw"],
  ]);
  const maxDemandKva = takeFirst(metrics, [
    ["meter", "max", "demand", "kva"],
    ["meter", "maximum", "demand", "kva"],
    ["max", "demand", "kva"],
    ["maximum", "demand", "kva"],
  ]);
  const frequency = takeFirst(metrics, [["meter", "frequency"], ["frequency"], ["hz"]]);
  const pf = takeFirst(metrics, [["meter", "pf", "system"], ["pf"]]);

  const voltageRows = buildPhaseRows(metrics.filter(isVoltageMetric), resolveVoltagePhaseLabel);
  const currentRows = buildPhaseRows(metrics.filter(isCurrentMetric), resolveCurrentPhaseLabel);

  const voltageThd = sortMetrics(metrics).filter((metric) => {
    const text = metricText(metric);
    return text.includes("voltage thd") || text.includes("vthd");
  });
  const currentThd = sortMetrics(metrics).filter((metric) => {
    const text = metricText(metric);
    return text.includes("current thd") || text.includes("ithd");
  });

  const averageMetric = (items: MetricLike[], label: string) => {
    const numeric = items.filter((item) => typeof item.value === "number") as Array<MetricLike & { value: number }>;
    if (!numeric.length) return undefined;
    const avg = numeric.reduce((sum, item) => sum + item.value, 0) / numeric.length;
    return {
      id: `${label.toLowerCase()}-avg`,
      label,
      value: formatParameterValue(avg),
      unit: numeric[0].unit,
      rawValue: avg,
    } satisfies EnergyMetricChip;
  };

  const groups: EnergyMetricGroup[] = [
    {
      key: "consumption",
      title: "Consumption",
      tone: "consumption",
      primary: toChip(kwh, "kWh", "kWh"),
      metrics: [toChip(kwh, "kWh", "kWh")].filter((entry): entry is EnergyMetricChip => Boolean(entry)),
    },
    {
      key: "power",
      title: "Power",
      tone: "power",
      primary: toChip(kw ?? kva ?? kvar, "Power", kw ? "kW" : kva ? "kVA" : "kVAr"),
      metrics: [
        toChip(kw, "kW", "kW"),
        toChip(kva, "kVA", "kVA"),
        toChip(kvar, "kVAr", "kVAr"),
        toChip(maxDemandKw, "Max Demand kW", "Max Demand kW"),
        toChip(maxDemandKva, "Max Demand kVA", "Max Demand kVA"),
      ].filter((entry): entry is EnergyMetricChip => Boolean(entry)),
    },
    {
      key: "reactive-energy",
      title: "Reactive Energy",
      tone: "reactive",
      primary: toChip(
        kvarhTotal ?? kvarhLag ?? kvarhLead,
        "Reactive Energy",
        kvarhTotal ? "Total kVArh" : kvarhLag ? "Lag kVArh" : "Lead kVArh"
      ),
      metrics: [
        toChip(kvarhTotal, "Total kVArh", "Total kVArh"),
        toChip(kvarhLag, "Lag kVArh", "Lag kVArh"),
        toChip(kvarhLead, "Lead kVArh", "Lead kVArh"),
      ].filter((entry): entry is EnergyMetricChip => Boolean(entry)),
    },
    {
      key: "reactive-power",
      title: "Reactive Power",
      tone: "reactive",
      primary: toChip(kvar, "kVAr", "kVAr"),
      metrics: [toChip(kvar, "kVAr", "kVAr")].filter(
        (entry): entry is EnergyMetricChip => Boolean(entry)
      ),
    },
    {
      key: "voltage",
      title: "Voltage",
      tone: "voltage",
      layout: "phase_table",
      primary: phaseRowsToChips(voltageRows).at(-1),
      metrics: phaseRowsToChips(voltageRows),
    },
    {
      key: "current",
      title: "Current",
      tone: "current",
      layout: "phase_table",
      primary: phaseRowsToChips(currentRows).at(-1),
      metrics: phaseRowsToChips(currentRows),
    },
    {
      key: "quality",
      title: "Power Quality",
      tone: "quality",
      primary: toChip(kvah ?? pf ?? frequency, "Power Quality", kvah ? "kVAh" : pf ? "PF" : "Hz"),
      metrics: [
        toChip(kvah, "kVAh", "kVAh"),
        toChip(frequency, "Hz", "Hz"),
        toChip(pf, "PF", "PF"),
        averageMetric(voltageThd, "VTHD AVG"),
        averageMetric(currentThd, "ITHD AVG"),
      ].filter((entry): entry is EnergyMetricChip => Boolean(entry)),
    },
    {
      key: "runtime",
      title: "Runtime",
      tone: "runtime",
      primary: toChip(loadHour ?? noLoadHour ?? rpm, "Runtime"),
      metrics: [
        toChip(loadHour, "Load Hours", "Load Hours"),
        toChip(noLoadHour, "No-load Hours", "No-load Hours"),
        toChip(rpm, "RPM", "RPM"),
      ].filter((entry): entry is EnergyMetricChip => Boolean(entry)),
    },
  ];

  return groups.filter((group) => group.metrics.length > 0);
}

export function buildEnergyPresets(metrics: MetricLike[]): EnergyPreset[] {
  const sorted = sortMetrics(metrics);
  const regularPowerMetrics = sorted.filter((metric) => !isMaximumDemandMetric(metric));
  const voltageMetricIds = sorted.filter(isVoltageMetric).map((metric) => metric.id);
  const currentMetricIds = sorted.filter(isCurrentMetric).map((metric) => metric.id);
  const powerMetricIds = [
    takeFirst(regularPowerMetrics, [["meter", "kw", "total"], ["kw"]]),
    takeFirst(regularPowerMetrics, [["meter", "kva", "total"], ["kva"]]),
    takeFirst(sorted, [["meter", "max", "demand", "kw"], ["meter", "maximum", "demand", "kw"], ["max", "demand", "kw"], ["maximum", "demand", "kw"]]),
    takeFirst(sorted, [["meter", "max", "demand", "kva"], ["meter", "maximum", "demand", "kva"], ["max", "demand", "kva"], ["maximum", "demand", "kva"]]),
  ]
    .filter((metric): metric is MetricLike => Boolean(metric))
    .map((metric) => metric.id);
  const powerFactorMetricIds = sorted.filter(isPowerQualityMetric).map((metric) => metric.id);
  const reactivePowerMetricIds = [
    takeFirst(sorted, [["meter", "kvar", "total"], ["kvar", "total"], ["kvar"]]),
  ]
    .filter((metric): metric is MetricLike => Boolean(metric))
    .map((metric) => metric.id);
  const energyMetricIds = [
    takeFirst(sorted, [["meter", "kwh", "total"], ["kwh"]]),
    takeFirst(sorted, [["meter", "kvah", "total"], ["kvah"]]),
    takeFirst(sorted, [["meter", "kvarh", "total"], ["kvarh", "total"]]),
    takeFirst(sorted, [["meter", "kvarh", "lag"], ["kvarh", "lag"]]),
    takeFirst(sorted, [["meter", "kvarh", "lead"], ["kvarh", "lead"]]),
  ]
    .filter((metric): metric is MetricLike => Boolean(metric))
    .map((metric) => metric.id);
  const runtimeMetricIds = [
    takeFirst(sorted, [["meter", "load", "hour"], ["load", "hour"]]),
    takeFirst(sorted, [["meter", "no", "load", "hour"], ["no", "load", "hour"]]),
    takeFirst(sorted, [["meter", "rpm"], ["rpm"]]),
  ]
    .filter((metric): metric is MetricLike => Boolean(metric))
    .map((metric) => metric.id);

  return [
    { id: "voltage", title: "Voltage", description: "L1/L2/L3 voltage pages", metricIds: Array.from(new Set(voltageMetricIds)) },
    { id: "current", title: "Current", description: "L1/L2/L3 current pages", metricIds: Array.from(new Set(currentMetricIds)) },
    { id: "power", title: "Active Power", description: "kW, kVA, and maximum demand", metricIds: Array.from(new Set(powerMetricIds)) },
    { id: "reactivePower", title: "Reactive Power", description: "Total reactive power", metricIds: Array.from(new Set(reactivePowerMetricIds)) },
    { id: "powerFactor", title: "Power Quality", description: "PF, Hz, THD", metricIds: Array.from(new Set(powerFactorMetricIds)) },
    { id: "energy", title: "Energy", description: "kWh, kVAh, and total/Lag/Lead reactive energy", metricIds: Array.from(new Set(energyMetricIds)) },
    { id: "runtime", title: "Runtime", description: "Load hours, no-load hours, and RPM", metricIds: Array.from(new Set(runtimeMetricIds)) },
  ];
}

const CONFIG_METRIC_TOKENS = [
  "network selection",
  "ct primary",
  "ct secondary",
  "pt primary",
  "pt secondary",
  "modbus address",
  "modbus baud",
  "modbus parity",
];

export function isMeterConfigurationMetric(metric: { key?: string; label?: string; displayLabel?: string }) {
  const text = normalizeText([metric.key, metric.label, metric.displayLabel].filter(Boolean).join(" "));
  return CONFIG_METRIC_TOKENS.some((token) => text.includes(token));
}

export function getMeterConfiguration(item: any) {
  const byKey = new Map(getNumericParameterMetrics(item).map((metric) => [metric.key, metric.value]));
  const value = (key: string) => byKey.get(key);
  const network = value("meter_network_selection");
  const parity = value("meter_modbus_parity");

  const networkLabels: Record<number, string> = { 0: "3P-3W", 1: "3P-4W", 2: "1P-2W" };
  const parityLabels: Record<number, string> = { 0: "None", 1: "Even", 2: "Odd" };
  const displaySelector = (raw: number | undefined, labels: Record<number, string>) =>
    raw == null ? "--" : labels[Math.round(raw)] ?? `Unknown (${raw})`;
  const displayNumber = (raw: number | undefined, unit = "") =>
    raw == null ? "--" : `${raw}${unit ? ` ${unit}` : ""}`;

  return [
    { key: "network", label: "Network", value: displaySelector(network, networkLabels) },
    { key: "ct-primary", label: "CT Primary", value: displayNumber(value("meter_ct_primary"), "A") },
    { key: "ct-secondary", label: "CT Secondary", value: displayNumber(value("meter_ct_secondary"), "A") },
    { key: "pt-primary", label: "PT Primary", value: displayNumber(value("meter_pt_primary"), "V") },
    { key: "pt-secondary", label: "PT Secondary", value: displayNumber(value("meter_pt_secondary"), "V") },
    { key: "address", label: "Modbus Address", value: displayNumber(value("meter_modbus_address")) },
    { key: "baud", label: "Baud Rate", value: displayNumber(value("meter_modbus_baud"), "bps") },
    { key: "parity", label: "Parity", value: displaySelector(parity, parityLabels) },
  ];
}

export function buildEnergyPresetsFromRows(rows: any[]) {
  const byId = new Map<string, MetricLike>();
  rows.forEach((row) => {
    getNumericParameterMetrics(row).forEach((metric) => {
      if (!byId.has(metric.id)) byId.set(metric.id, toMetricLike(metric));
    });
  });
  return buildEnergyPresets(Array.from(byId.values()));
}

export function buildEnergyPresetsFromMetricOptions(metrics: Array<{ id: string; label: string; order?: number }>) {
  return buildEnergyPresets(
    metrics.map((metric) => ({
      id: metric.id,
      label: metric.label,
      displayLabel: metric.label,
      order: metric.order ?? 0,
    }))
  );
}

export function getDefaultEnergyPresetMetricIds(presets: EnergyPreset[]) {
  return presets.find((preset) => preset.metricIds.length)?.metricIds ?? [];
}
