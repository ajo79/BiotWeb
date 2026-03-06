# Product Requirements Specification

## 1. Overview

BIOT Web is a browser-based telemetry console for BIOT/ESP32 devices. It supports secure login, fleet monitoring, per-device analysis, historical visualization, alarms, analytics, CSV export, and basic local user management.

## 2. Objectives

- Provide near-realtime visibility of device telemetry.
- Provide reliable historical retrieval for selected device/date ranges.
- Classify device operational health (online/offline/alarm) in a stable, low-flap manner.
- Enable operations teams to export telemetry for reporting.
- Provide simple role-based access for local deployments.

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
- CSV export from historical data.

Out of scope:

- Backend API implementation changes.
- Device firmware changes.
- Enterprise SSO, MFA, OAuth, LDAP integration.
- Server-side user management.

## 5. Functional Requirements

FR-001 Authentication
- System shall provide login page with user ID/email and password.
- System shall allow factory admin login (`Company_A / 1234`) for bootstrap.
- System shall persist auth session in localStorage and rehydrate on reload.
- System shall block protected routes when no token is available.

FR-002 Role Access
- System shall support `admin` and `user` roles.
- System shall allow admins to create/edit/delete users in localStorage.
- System shall restrict user-management actions for non-admin users.

FR-003 Dashboard
- System shall show total devices, online, good, and issue counts.
- System shall show realtime feed cards with per-device metrics.
- System shall show fleet health pie breakdown.

FR-004 Device List
- System shall show all discovered devices.
- System shall allow filter by `all`, `online`, `good`, `issue`.
- System shall display wifi and metric cards per device.
- System shall navigate to device detail page on device selection.

FR-005 Device Detail
- System shall provide live mode and history mode.
- System shall render either press phase line chart or env area chart.
- System shall allow threshold line inputs for charts.
- System shall show offline message when live telemetry is unavailable.

FR-006 Graph Page
- System shall provide fleet-level live and history graph exploration.
- System shall allow device selection.
- System shall allow date range selection for history mode.
- System shall allow manual refresh in history mode.
- System shall format metric values to two decimals in summaries/tooltips.

FR-007 Alarms
- System shall show alarm records from alarm dataset.
- System shall display device, message, and event time.

FR-008 Export
- System shall export selected historical readings to CSV.
- System shall support optional device filter and date range.
- System shall flatten payload structures and include key telemetry fields.
- System shall format numeric-like values to two decimals.

FR-009 Analytics
- System shall show uptime by device.
- System shall show alarm count summary and anomaly count.
- System shall list anomaly queue and signal quality indicators.

FR-010 Notifications/Help/About
- System shall provide informational pages for notifications/help/about.
- Help page shall include contact form and organization details.

## 6. Data and Telemetry Requirements

DR-001 System shall read telemetry from AWS endpoint response sections:
- `IoTReadings`
- `RealTimeDataMonitor`
- `ESP32_Alarms`

DR-002 System shall normalize mixed payload envelopes:
- Lambda `body` string wrapper.
- DynamoDB typed attribute maps.
- nested `payload` objects/JSON strings.

DR-003 System shall support both environmental metrics and press metrics:
- Temperature/Humidity aliases.
- `Press/Phase N Amps` extraction.

DR-004 System shall support history filters by:
- `deviceId`
- `from`/`to` local date boundaries converted to epoch milliseconds.

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
- Desktop-first and mobile drawer navigation supported.
- Modern Chromium/Edge/Firefox expected.

## 9. Assumptions

- Backend endpoint remains reachable and returns expected logical sections.
- Telemetry timestamp fields are present for most records.
- ESP32 publishes approximately every 5 seconds.

## 10. Acceptance Criteria

- App builds successfully with `npm run build`.
- Protected routes redirect to login when unauthenticated.
- Realtime pages update approximately every 5 seconds.
- History queries return same-day and multi-day data ranges reliably.
- CSV export contains data for selected device/date filters.
- Device status does not flap offline on minor single-cycle delays.

