export function rssiToBars(rssi?: number): number {
  const n = Number(rssi);
  if (!Number.isFinite(n)) return 0;
  if (n > 0) return 4;
  if (n >= -55) return 4;
  if (n >= -67) return 3;
  if (n >= -75) return 2;
  if (n >= -85) return 1;
  return 0;
}

export function rssiLabel(rssi?: number): string {
  const n = Number(rssi);
  if (!Number.isFinite(n)) return "Unknown";
  if (n > 0) return "Excellent";
  if (n >= -55) return "Excellent";
  if (n >= -67) return "Good";
  if (n >= -75) return "Fair";
  if (n >= -85) return "Weak";
  return "Poor";
}

export function getRssi(item: any): number | undefined {
  const src = item && typeof item === "object" ? item : {};
  const candidates = [
    src.rssi,
    src.RSSI,
    src.wifi_rssi,
    src.wifiRssi,
    src.signal_rssi,
    src.signalRssi,
    src.signal,
    src?.payload?.rssi,
    src?.payload?.RSSI,
    src?.payload?.wifi_rssi,
    src?.payload?.wifiRssi,
    src?.payload?.signal_rssi,
    src?.payload?.signalRssi,
    src?.payload?.signal,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function getWifiStrength(item: any): number | undefined {
  const src = item && typeof item === "object" ? item : {};
  const candidates = [
    src.wifi_strength,
    src.wifiStrength,
    src.wifiSignal,
    src.wifi,
    src?.payload?.wifi_strength,
    src?.payload?.wifiStrength,
    src?.payload?.wifiSignal,
    src?.payload?.wifi,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n)) return n <= 0 ? rssiToBars(n) : n;
  }
  return undefined;
}

export function wifiLabel(strength?: number): string {
  if (!Number.isFinite(strength as number)) return "Unknown";
  const s = Number(strength);
  if (s >= 4) return "Full";
  if (s === 3) return "Good";
  if (s === 2) return "Weak";
  if (s <= 1) return "Poor";
  return `Level ${s}`;
}

export function wifiBars(strength?: number) {
  const s = Number(strength);
  const active = Number.isFinite(s) ? Math.max(0, Math.min(4, Math.round(s))) : 0;
  return [1, 2, 3, 4].map((i) => i <= active);
}
