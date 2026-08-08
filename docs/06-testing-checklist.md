# Manual Testing Checklist

Use this checklist before release.

Branch covered: `NewUI_withMeter_08_08_2026`.

## 1. Build and App Boot

- `npm run build` completes successfully.
- `npm run dev` starts and app opens at `http://localhost:5173`.
- No blocking runtime errors on first load.

## 2. Authentication

- Login page loads at `/login`.
- Invalid credentials show error message.
- Valid credentials navigate to `/`.
- Reload preserves session.
- Sign out clears session and returns to login.
- Factory credential works with `CEAT / 1234` (legacy `Company_A` still accepted).
- Energy-site credential works with `BLACK_STAR / 1234`.
- Session rehydrates the correct site and device visibility after reload.

## 3. Dashboard

- Metric cards render (`Total`, `Online`, `Good`, `Issue`).
- Fleet Health renders Online, Good, and Issue with distinct legend colors.
- Total equals the unique site-scoped `deviceId` count in `RealTimeDataMonitor`.
- A device present only in `IoTReadings` is absent from Dashboard, Fleet Health, and totals.
- Realtime feed updates approximately every 5 seconds.
- Realtime feed label shows `auto 5s`.
- Decoded telemetry parameters render with show-more behavior when more than four values exist.
- Pie chart renders when data exists.
- Card navigation to `/devices` filters works.
- For BlackStar Products site, dashboard shows grouped meter KPI cards and `Live Meter Feed`.
- Power card shows maximum-demand kW/kVA without replacing total kW/kVA.
- Reactive Energy card shows total, Lag, and Lead kVArh when any parameter is available.
- Reactive Energy card is absent when all three parameters are missing.

## 4. Devices Page

- Device cards render with ID/name.
- Each realtime `deviceId` renders once even if realtime/history contain duplicate telemetry rows.
- Removing a device from `RealTimeDataMonitor` removes its card after the next successful poll even when its history remains.
- Filters `all/online/good/issue` produce correct subsets.
- Page label shows `auto-refresh 5s`.
- Offline cards show offline panel.
- Online cards show decoded telemetry parameters.
- `type_002` devices show Shift Production donut when shift count values exist.
- Clicking card opens `/devices/:id`.
- BlackStar Products devices render grouped energy metric cards when energy metrics are present.
- Reactive Energy uses the dedicated rose/fuchsia/purple header and remains legible on desktop and mobile.
- ACK button appears only for eligible open alarms and shows success/failure feedback.

## 5. Device Detail

- Live mode shows chart updates.
- History mode returns data for known date range.
- Same-date range returns expected rows.
- Metric selector renders numeric telemetry options.
- Selected metrics render as line series.
- Threshold inputs draw reference lines when phase amperage metrics are selected.
- Offline message appears when device not live.
- Unauthorized direct device URL for another site redirects back to `/devices`.
- Energy-site device detail splits charts into separate grouped energy panels.
- Meter configuration values do not appear on Device Detail and do not create operational charts.

## 6. Graph Page

- Live/history toggle works.
- Live mode label shows `auto-refresh 5s`.
- Device selector updates chart.
- History refresh button fetches data and animation triggers.
- Metric selector can toggle visible numeric chart series.
- Tooltip values are shown with two decimals.
- Stats (min/max/avg) render correctly.
- Energy-site graph page shows preset chips and grouped energy overview cards.
- Active Power preset includes maximum-demand kW/kVA when available.
- Energy preset includes total/Lag/Lead kVArh when available and tolerates gaps in older history.
- Reactive Power graphs total kVAr; Runtime graphs load/no-load hours and RPM.
- Configuration metrics are excluded from manual operational metric buttons.
- Zoom, pan slider, and mouse-wheel timeline zoom work in both graph flows.

## 7. Alarms

- Alarm table loads rows from alarm dataset.
- Timestamp and message fields appear correctly.
- Empty state appears when no alarms.
- Open and cleared alarm rows merge into expected lifecycle entries.

## 8. Export

- Device list in export form is populated.
- Device list in export form only contains devices visible to the active site.
- Export with date range downloads CSV.
- CSV includes expected headers and rows.
- Numeric-like values are formatted with two decimals.
- Time column is exported as `Time (IST)` and matches selected IST date boundaries.

## 9. Analytics

- Summary cards render values.
- Uptime and anomaly calculations may use history, but only current realtime device IDs participate in Analytics device scope and totals.
- Uptime chart renders with percentage values.
- Signal indicators (wifi/rssi) display correctly.
- Anomaly list renders or shows empty state.
- Anomaly copy reflects environment metrics on CEAT and meter/offline focus on BlackStar Products.

## 10. User Management (Settings)

- Admin can create user.
- Admin can edit role/password.
- Admin can delete user.
- Non-admin sees view-only restriction.
- Admin can only view and manage users within the active site scope.

## 11. Responsive Navigation

- Desktop top navigation works.
- Mobile drawer opens/closes and route links work.
- Support menu shows `Help Center` and `About` only (Notifications hidden by design).

## 12. Static Deployment

- `npm run build` creates `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`, and `dist/BIOT_logo.png`.
- GoDaddy `public_html` contains the contents of `dist`, not a nested `dist` directory.
- Hosted page source references the newest hashed JS/CSS files.
- Hard refresh or cache clear shows the same UI as local production preview.

## 13. Regression Focus

- Realtime status should not flap offline under normal 5s publish cadence.
- History mode must not auto-refresh continuously.
- Same-day history range must return data when present.
