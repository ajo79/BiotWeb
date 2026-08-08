import { getSiteConfig, type SiteConfig } from "../config/sites";
import type { AuthState } from "../auth/auth";

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function resolveActiveSite(state: Pick<AuthState, "siteKey">): SiteConfig {
  return getSiteConfig(state.siteKey);
}

export function isAllowedDeviceForSite(item: any, site: SiteConfig) {
  const itemSiteId = normalize(item?.siteId);
  const itemDeviceType = normalize(item?.deviceType);
  if (!itemSiteId || !itemDeviceType) return false;
  if (itemSiteId !== normalize(site.siteId)) return false;
  return site.allowedDeviceTypes.map(normalize).includes(itemDeviceType);
}

export function filterRowsForSession<T>(rows: T[] | undefined, state: Pick<AuthState, "siteKey" | "siteId">) {
  const site = resolveActiveSite(state);
  return (rows ?? []).filter((row) => isAllowedDeviceForSite(row, site));
}

/**
 * Alarm payloads do not include deviceType, so alarm access is scoped by
 * siteId alone. Records from legacy devices without a siteId belong to CEAT.
 */
export function filterAlarmRowsForSession<T>(
  rows: T[] | undefined,
  state: Pick<AuthState, "siteKey" | "siteId">
) {
  const site = resolveActiveSite(state);
  const activeSiteId = normalize(site.siteId);
  const acceptsLegacyAlarms = site.key === "CEAT";

  return (rows ?? []).filter((row) => {
    const alarmSiteId = normalize((row as any)?.siteId);
    if (!alarmSiteId) return acceptsLegacyAlarms;
    return alarmSiteId === activeSiteId;
  });
}

export function buildAllowedDeviceIdSet(rows: any[] | undefined, state: Pick<AuthState, "siteKey" | "siteId">) {
  return new Set(
    filterRowsForSession(rows, state)
      .map((row) => String(row?.deviceId ?? "").trim())
      .filter(Boolean)
  );
}

export function isAllowedDeviceId(deviceId: string, allowedIds: Set<string>) {
  return allowedIds.has(String(deviceId ?? "").trim());
}
