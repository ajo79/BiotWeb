# Data Extraction and API Documentation

## 1. Endpoint

Default endpoint:
- `https://cg5h2ba15i.execute-api.ap-south-1.amazonaws.com/prod`

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

## 9. Export Data Pipeline

`ExportPage` uses `getIoTReadingsHistory` and then:

1. Flattens each row payload.
2. Builds dynamic CSV headers from discovered payload keys.
3. Includes `deviceId`, `deviceName`, and formatted `Time (IST)`.
4. Formats numeric-like values to two decimals.
5. Triggers browser CSV download.

## 10. API Error Handling

- Invalid JSON response throws clear parse error.
- Realtime fast status call auto-falls back to full fetch.
- Query hooks retry once by default (QueryClient setting).
