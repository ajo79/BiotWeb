# Data Extraction and API Documentation

Branch covered: `NewUI_withMeter`.

## 1. Endpoint

Default endpoint:
- `https://cg5h2ba15i.execute-api.ap-south-1.amazonaws.com/prod`

Alarm acknowledgement endpoint:
- `${VITE_API_URL or default}/alarms/ack`

Override via env:
- `VITE_API_URL`

The API client normalizes endpoint path to ensure `/prod` is present when possible.

## 2. Query Modes

General dashboard read:
- No query params required.

Fast realtime status read:
- `statusOnly=1` with short timeout.
- Fallback to full fetch when fast status call fails.

IoT readings pagination/history:
- `iotReadingsOnly=1`
- `limit` (client currently requests up to `1000` rows per page)
- optional `deviceId`
- optional time range aliases:
  - `startTsEpochMs`, `startTs`, `fromTs`
  - `endTsEpochMs`, `endTs`, `toTs`
- pagination aliases:
  - `cursor`, `nextToken`, `pageToken`, `continuationToken`

Alarm acknowledgement POST payload:
- `deviceId` required
- `siteId` optional
- `requestId` optional but supplied by the UI

## 3. Response Normalization Pipeline

The client supports multiple response shapes:

1. Parse raw text response as JSON.
2. If wrapped by Lambda proxy (`{ body: "..." }`), parse inner JSON.
3. Unmarshal DynamoDB typed attributes (`S`, `N`, `BOOL`, `M`, `L`).
4. Normalize arrays:
   - `IoTReadings`
   - `RealTimeDataMonitor`
   - `ESP32_Alarms`
5. Flatten nested payload layers recursively (`payload` / `Payload`).
6. Canonicalize known aliases for telemetry metrics.

## 4. Telemetry Field Mapping

Timestamp mapping:
- `tsServerMs` from server-style fields (`ts`, `timestamp`, `time`).
- `tsDeviceMs` from device epoch fields (`tsEpochMs`, `ts_epoch_ms`).
- `ts` resolved from available timestamp fields.

Environmental aliases:
- temperature: `temperature`, `Temperature`, `temperature deg`, `temp`, etc.
- humidity: `humidity`, `Humidity`, `humidity %`, `hum`, etc.

Press metrics:
- Derived from key names matching `phase` or `press` with numeric ID and amperage semantics.

Generic numeric metrics:
- Derived from decoded `parameters` entries and flattened numeric payload fields.
- Used by Graph and Device Detail metric selectors.
- Metric IDs are stable normalized keys; labels are human-readable display labels.

Shift production metrics:
- Resolved from decoded parameter labels/keys or aliases such as `shift_1_count`, `shift1_production`, and `shift_1_production_count`.
- Displayed as a Shift 1/2/3 donut on `type_002` device cards.

Energy meter metrics:
- Extracted from the generic numeric parameter pipeline.
- Grouped into Consumption, Power, Reactive Energy, Voltage, Current, and Power Quality cards by `src/utils/energyMeter.ts`.
- `meter_max_demand_kw` and `meter_max_demand_kva` are displayed in the Power card and Active Power graph preset without being confused with total kW/kVA.
- `meter_kvarh_lag` and `meter_kvarh_lead` are displayed only in the dedicated Reactive Energy card and are also included in the Energy graph preset.
- The Reactive Energy card is omitted when both Lag and Lead readings are absent; a single available reading is still displayed.
- Used heavily for `type_003` meter devices on the BlackStar Products site.

## 5. Schema Validation

`_schemaValid` is computed using BIOT telemetry heuristics:
- envelope compatibility (`schemaVersion`, `msgType`)
- BIOT shape indicators (`status`, `siteId`, `deviceType`, `tsEpochMs`, `parameters`)

Pages prefer `_schemaValid` rows to avoid accidental non-telemetry records.

## 6. Realtime Merge Strategy

Inputs:
- `RealTimeDataMonitor` (preferred realtime source)
- `IoTReadings` (fallback values when realtime fields are missing)

Merge behavior:
- For each realtime device, fill missing fields from latest IoT reading for same device.
- Include reading-only devices not present in realtime list.
- If fast status payloads omit `siteId` or `deviceType`, the client falls back to full fetch so access-policy filtering does not empty the UI.

## 7. Robust Online/Offline Logic

Implemented as a runtime state machine per device:

Threshold constants:
- heartbeat threshold: 10s
- polling granularity: 5s
- online age boundary: 15s
- offline age boundary: 30s

Missed poll thresholds:
- stale from 3 missed polls
- offline from 6 missed polls

Recovery hysteresis:
- device requires 2 consecutive fresh heartbeats to recover from offline.

Output annotations injected into readings:
- `_onlineStatus`: `online | stale | offline`
- `_isOnline`: boolean
- `_heartbeatAgeMs`: number
- `_missedPolls`: number
- `_lastHeartbeatTs`: epoch ms

## 8. History Query Behavior

History source:
- `IoTReadings` only.

Filter strategy:
- Device ID filter.
- From/to epoch range filter using fixed IST day boundaries (`UTC+05:30`, `00:00:00.000` to `23:59:59.999`).
- Sort ascending by timestamp.

Robust fallback:
- If server-side ranged query returns no rows, client retries device-scoped fetch without server date filter and applies client-side site-time filtering.
- This mitigates same-day range misses from backend filtering behavior.
- Export page requests paginated history with `pageLimit=1000` and `maxPages=500`.

Site access filter:
- Pages apply client-side site filtering after normalization using row `siteId` and `deviceType`.
- Direct device-detail access is rejected when the selected device is outside the filtered device ID set.

## 9. Export Data Pipeline

`ExportPage` uses `getIoTReadingsHistory` and then:

1. Flattens each row payload.
2. Builds dynamic CSV headers from discovered payload keys.
3. Includes `deviceId`, `deviceName`, and formatted `Time (IST)`.
4. Formats numeric-like values to two decimals.
5. Triggers browser CSV download.

## 10. Alarm Lifecycle and ACK Flow

Alarm row normalization:
1. Alarm rows are sorted oldest-first when building lifecycle state.
2. `alarmFlag=1` opens an alarm lifecycle row.
3. `alarmFlag=0` closes the most recent open row for the same device.
4. Final lifecycle rows are displayed latest-first.

ACK flow:
1. Devices page checks whether a device has an open alarm lifecycle row and a current common alarm state.
2. Eligible devices show an `ACK` button.
3. ACK posts `deviceId`, current session `siteId`, and a generated `requestId` to `/alarms/ack`.
4. On success the UI invalidates alarms, dashboard, and realtime queries, then refetches active alarms.

## 11. UI Metric Display Pipeline

Dashboard and Devices use `TelemetryParameterList`:

1. Decode available telemetry parameters through `getDecodedParameters`.
2. Hide shift count values from the general parameter list.
3. Format labels and values consistently.
4. Show a compact first set with `Show more` expansion.

Graph and Device Detail use numeric metric helpers:

1. Build metric options from current live/history rows.
2. Preserve selected metrics when still available.
3. Render selected metrics as line series.
4. Compute min/max/avg from visible chart points.

Energy-specific charting:
1. Build energy presets from available numeric metric IDs.
2. Select default preset metrics for energy-site graph page.
3. Split device-detail charts into separate energy panels by preset/group.
4. Disable manual threshold overlays on energy grouped panels.
5. Active Power resolves total kW/kVA plus maximum-demand kW/kVA.
6. Energy resolves total kWh/kVAh plus Lag/Lead kVArh when those parameters exist in live/history rows.

## 12. API Error Handling

- Invalid JSON response throws clear parse error.
- Realtime fast status call auto-falls back to full fetch.
- Query hooks retry once by default (QueryClient setting).
