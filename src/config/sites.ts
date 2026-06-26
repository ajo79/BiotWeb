export type SiteFeatureFlags = {
  showRealtimeFeed: boolean;
  showShiftProduction: boolean;
  showCurrentSensorLabels: boolean;
  showEnvironmentMetrics: boolean;
  showEnergyMeterFocusCopy: boolean;
};

export type SiteBootstrapUser = {
  userId: string;
  password: string;
  role: "admin";
};

export type SiteConfig = {
  key: string;
  siteId: string;
  displayName: string;
  allowedDeviceTypes: string[];
  bootstrapUser: SiteBootstrapUser;
  features: SiteFeatureFlags;
};

export const SITE_CONFIGS = {
  CEAT: {
    key: "CEAT",
    siteId: "SITE-01",
    displayName: "CEAT",
    allowedDeviceTypes: ["type_001", "type_002"],
    bootstrapUser: {
      userId: "CEAT",
      password: "1234",
      role: "admin",
    },
    features: {
      showRealtimeFeed: true,
      showShiftProduction: true,
      showCurrentSensorLabels: true,
      showEnvironmentMetrics: true,
      showEnergyMeterFocusCopy: false,
    },
  },
  ACME_ENERGY: {
    key: "ACME_ENERGY",
    siteId: "SITE-02",
    displayName: "BlackStar Products",
    allowedDeviceTypes: ["type_003"],
    bootstrapUser: {
      userId: "BLACK_STAR",
      password: "1234",
      role: "admin",
    },
    features: {
      showRealtimeFeed: true,
      showShiftProduction: false,
      showCurrentSensorLabels: false,
      showEnvironmentMetrics: false,
      showEnergyMeterFocusCopy: true,
    },
  },
} satisfies Record<string, SiteConfig>;

export type SiteKey = keyof typeof SITE_CONFIGS;

export const DEFAULT_SITE_KEY: SiteKey = "CEAT";
export const LEGACY_BOOTSTRAP_USER_IDS: Record<string, SiteKey> = {
  Company_A: "CEAT",
};

export function getAllSiteConfigs() {
  return Object.values(SITE_CONFIGS);
}

export function getSiteConfig(siteKey?: string | null): SiteConfig {
  if (siteKey && siteKey in SITE_CONFIGS) {
    return SITE_CONFIGS[siteKey as SiteKey];
  }
  return SITE_CONFIGS[DEFAULT_SITE_KEY];
}

export function findBootstrapSiteByUserId(userId: string): SiteConfig | null {
  const trimmed = String(userId || "").trim();
  if (!trimmed) return null;

  const normalizedKey = LEGACY_BOOTSTRAP_USER_IDS[trimmed] ?? trimmed;
  return getAllSiteConfigs().find((site) => site.bootstrapUser.userId === normalizedKey) ?? null;
}
