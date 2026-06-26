# Product Requirements Specification

## 1. Overview

BIOT Web is a browser-based telemetry console for BIOT/ESP32 devices. It supports secure login, site-scoped fleet monitoring, per-device analysis, historical visualization, alarms, analytics, CSV export, alarm acknowledgement, and basic local user management.

This document reflects branch `NewUI_withMeter`.

## 2. Objectives

- Provide near-realtime visibility of device telemetry.
- Provide reliable historical retrieval for selected device/date ranges.
- Classify device operational health (online/offline/alarm) in a stable, low-flap manner.
- Enable operations teams to export telemetry for reporting.
- Provide simple role-based and site-scoped access for local deployments.
- Support a meter-focused experience for energy-only sites.

## 3. Stakeholders

- Factory operators and supervisors.
- Field support and service teams.
- Quality/analytics teams.
- Administrators managing user access.

## 4. Scope

In scope:

- Frontend web UI and client-side data extraction logic.
- Poll-based realtime telemetry consumption.
- History querying and graphing.
- Local authentication and local user management (browser localStorage).
- Site-specific access filtering by `siteId` and allowed device types.
- Alarm acknowledgement requests from the UI.
- CSV export from historical data.

Out of scope:

- Backend API implementation changes.
- Device firmware changes.
- Enterprise SSO, MFA, OAuth, LDAP integration.
- Server-side user management.

## 5. Functional Requirements

FR-001 Authentication
- System shall provide login page with user ID/email and password.
- System shall allow factory admin login (`CEAT / 1234`) for bootstrap.
- System shall allow energy-site admin login (`BLACK_STAR / 1234`) for bootstrap.
- System shall continue to accept legacy factory ID `Company_A` and normalize it to `CEAT`.
- System shall persist auth session in localStorage and rehydrate on reload.
- System shall block protected routes when no token is available.
- System shall store authenticated session site metadata (`siteKey`, `siteId`, allowed device types).

FR-002 Role Access
- System shall support `admin` and `user` roles.
- System shall allow admins to create/edit/delete users in localStorage.
- System shall restrict user-management actions for non-admin users.
- System shall scope visible users and editable users to the active site.
- System shall filter telemetry, alarms, analytics, export options, and device routes to the active site and allowed device types.

FR-003 Dashboard
- System shall show total devices, online, good, and issue counts.
- System shall show realtime feed cards for all available live items visible to the current site.
- System shall show fleet health pie breakdown.
- System shall display realtime refresh copy as `auto 5s` or `auto-refresh 5s`.
- System shall render a meter-focused dashboard variant for energy sites with grouped KPI cards and direct meter navigation.

FR-004 Device List
- System shall show all discovered devices visible to the active site.
- System shall allow filter by `all`, `online`, `good`, `issue`.
- System shall display wifi and decoded telemetry parameter cards per device for general telemetry sites.
- System shall display shift production donut summaries for `type_002` devices when shift count data is available.
- System shall display grouped energy KPI cards for energy-meter devices when energy metrics are available.
- System shall navigate to device detail page on device selection.
- System shall display realtime refresh copy as `auto-refresh 5s`.
- System shall show an `ACK` action for active open alarms when the backend alarm row is still open and the device is online.

FR-005 Device Detail
- System shall provide live mode and history mode.
- System shall derive numeric metric options from decoded telemetry parameters.
- System shall allow users to select visible chart metrics for general telemetry sites.
- System shall render selected numeric metrics as line charts.
- System shall allow threshold line inputs when all selected metrics are phase amperage metrics.
- System shall show offline message when live telemetry is unavailable.
- System shall block direct navigation to devices outside the current site's allowed device set.
- System shall render separate grouped energy chart panels for energy-meter sites.
- System shall merge same-day history with live points in live mode.

FR-006 Graph Page
- System shall provide fleet-level live and history graph exploration.
- System shall allow device selection from the active site's visible devices.
- System shall allow date range selection for history mode.
- System shall allow manual refresh in history mode.
- System shall allow users to select visible numeric metrics.
- System shall format metric values to two decimals in summaries/tooltips.
- System shall display live refresh copy as `auto-refresh 5s`.
- System shall provide preset-driven energy chart selection for energy-meter sites.
- System shall support timeline zoom and pan interactions.

FR-007 Alarms
- System shall show alarm records from alarm dataset after site/device access filtering.
- System shall merge active and cleared alarm rows into a lifecycle view when matching open/close pairs exist.
- System shall display device, message, and event time.
- System shall support sending alarm acknowledgement requests to backend for eligible open alarms.

FR-008 Export
- System shall export selected historical readings to CSV for devices visible to the current site.
- System shall support optional device filter and date range.
- System shall apply fixed IST day boundaries (`UTC+05:30`) for date-only export filters.
- System shall flatten payload structures and include key telemetry fields.
- System shall format numeric-like values to two decimals.
- System shall render export time column in IST text format.

FR-009 Analytics
- System shall show uptime by device for the current site.
- System shall show alarm count summary and anomaly count.
- System shall list anomaly queue and signal quality indicators.
- System shall adapt anomaly copy for environment-driven sites vs meter-driven sites.

FR-010 Notifications/Help/About
- System shall provide informational pages for help/about in navigation.
- System shall keep notifications page available by route (`/notifications`) even when hidden from primary navigation.
- Help page shall include contact form and organization details.

## 6. Data and Telemetry Requirements

DR-001 System shall read telemetry from AWS endpoint response sections:
- `IoTReadings`
- `RealTimeDataMonitor`
- `ESP32_Alarms`
- Alarm acknowledgement posts shall target `/alarms/ack`.

DR-002 System shall normalize mixed payload envelopes:
- Lambda `body` string wrapper.
- DynamoDB typed attribute maps.
- nested `payload` objects/JSON strings.

DR-003 System shall support both environmental metrics and press metrics:
- Temperature/Humidity aliases.
- `Press/Phase N Amps` extraction.
- decoded `parameters` arrays and JSON payload parameter objects.
- production count aliases for Shift 1, Shift 2, and Shift 3.

DR-004 System shall support history filters by:
- `deviceId`
- `from`/`to` fixed site date boundaries (`UTC+05:30`, 00:00:00.000 to 23:59:59.999) converted to epoch milliseconds.

DR-005 System shall support site access filtering by:
- `siteId`
- allowed device type list from site configuration.

## 7. Online Status Requirements

OS-001 Polling
- Realtime checks shall run at 5 second interval.

OS-002 Stable State Machine
- Device state shall use heartbeat age + missed poll counters.
- State categories shall include `online`, `stale`, `offline`.
- Offline recovery shall require consecutive fresh heartbeat confirmations.

OS-003 Flap Reduction
- System shall not mark offline immediately for single poll irregularities.
- System shall keep status consistent during transient endpoint jitter.

## 8. Non-Functional Requirements

NFR-001 Performance
- UI shall remain responsive under typical fleet payload size.
- Realtime polling interval target: 5 seconds.

NFR-002 Reliability
- API parsing shall tolerate malformed or wrapped payloads.
- History queries shall include fallback behavior for backend range misses.

NFR-003 Maintainability
- Code shall remain modular by page/hook/api/utility layers.
- Documentation shall be versioned in repository.

NFR-004 Security (Current Baseline)
- Auth tokens are stored locally in browser storage.
- No backend password hashing in this frontend-only user store.
- Must be treated as non-enterprise demo-grade auth unless replaced.

NFR-005 Compatibility
- Desktop top navigation and mobile drawer navigation supported.
- Desktop top navigation and mobile drawer navigation supported.
- Site-specific dashboard and device layouts supported.
- Modern Chromium/Edge/Firefox expected.

## 9. Assumptions

- Backend endpoint remains reachable and returns expected logical sections.
- Backend alarm ACK endpoint accepts `deviceId`, optional `siteId`, and `requestId`.
- Telemetry timestamp fields are present for most records.
- ESP32 publishes approximately every 5 seconds.
- Deployment target uses India site timezone boundary (`UTC+05:30`) for date-only filtering and exports.

## 10. Acceptance Criteria

- App builds successfully with `npm run build`.
- Protected routes redirect to login when unauthenticated.
- CEAT and BlackStar bootstrap logins reach only their allowed site/device scope.
- Realtime pages update approximately every 5 seconds.
- Realtime labels show 5 second refresh timing.
- History queries return same-day and multi-day data ranges reliably.
- CSV export contains data for selected device/date filters using IST day boundaries.
- Device status does not flap offline on minor single-cycle delays.
- Energy site routes show KPI cards and grouped energy charts for `type_003` devices.
- Alarm ACK triggers backend request and refreshes alarms/dashboard/realtime queries.
