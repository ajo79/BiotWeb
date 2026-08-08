# System Architecture

Branch covered: `NewUI_withMeter_08_08_2026`.

## 1. Technology Stack

- Runtime: Node.js (development/build tooling).
- UI framework: React 18.
- Language: TypeScript.
- Bundler/dev server: Vite 5.
- Router: React Router v6.
- Data fetching/cache: TanStack Query v5.
- HTTP client: Axios.
- Charts: Recharts.
- Motion: Framer Motion.
- Styling: Tailwind CSS + custom CSS utilities.

## 2. High-Level Architecture

UI Layer
- Pages in `src/pages/*`.
- Shared layout in `src/layout/Shell.tsx`.
- Shared components in `src/components/*`.

State and Data Layer
- Query hooks in `src/hooks/queries.ts`.
- API extraction/normalization in `src/api/client.ts`.
- Utility parsing functions in `src/utils/*`.

Session/Auth Layer
- Context provider in `src/auth/auth.tsx`.
- localStorage persistence for auth and local users.
- Session carries `siteKey`, `siteId`, and allowed device types.

## 3. Routing Model

Entry: `src/main.tsx`
- Creates QueryClient with default polling behavior.

App routes: `src/App.tsx`
- `/login` public route.
- All other routes wrapped by `Protected` guard.
- Protected content rendered under `Shell` layout.

Primary pages:
- `/` Dashboard
- `/devices`
- `/devices/:id`
- `/graph`
- `/alarms`
- `/export`
- `/analytics`
- `/settings`
- `/notifications`
- `/help`
- `/about`

Navigation behavior:
- Desktop uses a sticky horizontal top navigation in `Shell`.
- Mobile uses a slide-out drawer.
- Primary navigation exposes Dashboard/Devices/Graph/Alarms/Export plus Help/About.
- `/analytics`, `/settings`, and `/notifications` routes exist but are not exposed in primary desktop navigation.
- Navigation header also reflects the active site branding and route availability is enforced by filtered data, not by separate route trees.

## 4. Data Flow

1. Page calls hook (`useRealtime`, `useDashboard`, etc.).
2. Hook invokes API function in `client.ts`.
3. `client.ts` fetches endpoint text via Axios.
4. Response is normalized (Lambda body unwrap, Dynamo unmarshal, payload flatten).
5. Realtime rows are enriched only from matching history rows, deduplicated by normalized `deviceId`, and annotated with health state.
6. Page renders cards/charts/tables from normalized objects.
7. `accessPolicy.ts` filters row visibility by authenticated site and allowed device types before page rendering.

Device membership boundary:
- `RealTimeDataMonitor` is the sole inventory source for Dashboard, Devices, Fleet Health, Analytics device scope, and Shell prefetch.
- `IoTReadings` cannot introduce a device ID into live UI surfaces.
- A matching latest `IoTReadings` row may enrich missing realtime metadata or parameter fields.
- History-only devices remain accessible to explicit history/export workflows but are not displayed as offline live devices.

## 5. Polling and Query Behavior

Global query defaults (`main.tsx`):
- `refetchInterval: 7000`
- `staleTime: 4000`

Hook-level behavior:
- Realtime polls at 5 seconds.
- Analytics and alarms poll at 7 seconds.
- History query disables interval and focus/reconnect auto refresh.
- Graph/DeviceDetail live mode polls, history mode disables polling.
- Shell also keeps a 5 second realtime query active for status/history prefetch support.
- Device detail and graph pages trigger an additional 60 second same-day history refresh while in live mode.

## 6. Device Health Classification

Implemented in `src/api/client.ts`:
- Per-device in-memory runtime state map.
- Evaluates heartbeat age and missed polls.
- Produces `_onlineStatus`, `_isOnline`, `_missedPolls`, `_lastHeartbeatTs`.
- Applies hysteresis for offline recovery.

Pages consume `_onlineStatus` first and only use timestamp fallback when absent.

## 7. Key Modules

`src/api/client.ts`
- API endpoint handling.
- Multi-format payload normalization.
- Realtime-only device membership, history enrichment for matching IDs, and case-normalized latest-record deduplication.
- History pagination and filtering (`limit` support, multi-page cursor loop).
- Online-state machine.
- Alarm acknowledgement POST helper.

`src/config/sites.ts`
- Defines site bootstrap users, site IDs, allowed device types, and feature flags.
- Current configured sites are `CEAT` (`SITE-01`) and `ACME_ENERGY` / BlackStar Products (`SITE-02`).

`src/utils/accessPolicy.ts`
- Central site access filter used by dashboard, devices, graph, analytics, export, and device-detail routing.
- Rejects rows whose `siteId` or `deviceType` do not match the active site policy.

`src/hooks/queries.ts`
- Centralized query hooks and polling options.

`src/utils/metrics.ts`
- Flatten nested payloads.
- Decode telemetry parameter arrays and parameter-like payload objects.
- Extract env, press, numeric metrics, formatted labels, and shift count values.

`src/utils/energyMeter.ts`
- Classifies decoded numeric metrics into Consumption, Power, Reactive Power, Reactive Energy, Voltage, Current, Power Quality, and Runtime groups.
- Keeps maximum-demand kW/kVA distinct from total kW/kVA through explicit token matching.
- Resolves total, Lag, and Lead kVArh independently and omits empty groups when older rows do not contain the relevant metrics.
- Builds Voltage, Current, Active Power, Reactive Power, Power Quality, Energy, and Runtime chart presets. Active Power includes maximum demand; Energy includes total/Lag/Lead kVArh; Runtime includes load hours, no-load hours, and RPM.
- Identifies meter configuration parameters so they remain available to normalization and exports but are excluded from operational graph selectors.

`src/components/EnergyKpiCard.tsx` and `src/components/EnergyMetricGroupCard.tsx`
- Render the energy groups in dashboard/device and overview contexts.
- Use a dedicated rose/fuchsia/purple tone for Reactive Energy.

`src/components/TelemetryParameterList.tsx`
- Shared decoded parameter list used by Dashboard and Devices.
- Hides shift production counters from the general parameter list.
- Supports compact show-more behavior.

`src/components/ShiftProductionPie.tsx`
- Shared shift production donut for `type_002` devices.
- Detects Shift 1/2/3 production count aliases and decoded parameters.

`src/utils/wifi.ts`
- RSSI normalization and wifi strength labels.

`src/pages/ExportPage.tsx`
- Converts history rows to CSV client-side with fixed IST date boundaries and `Time (IST)` formatting.
- Restricts device choices and exported rows to the active site policy.

`src/utils/siteTime.ts`
- Centralized fixed site timezone utilities (`UTC+05:30`) for date input boundaries and display formatting.

`src/pages/MorePage.tsx`
- Local user CRUD and role assignment scoped to the active site's user list.

`src/pages/GraphPage.tsx` and `src/pages/DeviceDetailPage.tsx`
- Combine live realtime rows with same-day history rows in live mode.
- Derive numeric metric options from current data.
- Render selected metrics as multi-line charts with min/max/avg summaries.
- Enable threshold lines only for phase amperage metric selections on non-energy pages.
- Use oscilloscope-style zoom/pan time controls.
- Render grouped energy presets and energy panels for meter-focused sites.
- Include maximum-demand series in Active Power charts, total kVAr in Reactive Power, total/Lag/Lead kVArh in Energy, and load/no-load hours plus RPM in Runtime.
- Configuration values remain normalized/exportable but are hidden from Device Detail and operational graphs.

`src/pages/DashboardPage.tsx` and `src/pages/DevicesPage.tsx`
- Switch layout and component composition based on site feature flags.
- Use `EnergyKpiCard` and `EnergyMetricGroupCard` for the energy-meter site variant.

`src/hooks/useAlarmAcknowledge.ts`
- Sends ACK requests, tracks per-device pending state, and invalidates alarm/dashboard/realtime queries on success.

## 8. Persistence Model

Browser localStorage keys:
- `biot_auth`: current auth state.
- `biot_users_v1`: local user accounts.
- `biot_profile`: profile fields (optional).
- `biot_notifications`: notification list (optional/demo page).
- Auth payload now includes site fields used to rehydrate access policy on reload.

No backend persistence is used for user management in current implementation.

## 9. Security Architecture Notes

- Access control is client-enforced only.
- Credentials and local users are browser-stored.
- Suitable for controlled/demo environments.
- For production hardening, move auth and user management to backend identity services.
