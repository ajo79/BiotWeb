# Manual Testing Checklist

Use this checklist before release.

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

## 3. Dashboard

- Metric cards render (`Total`, `Online`, `Good`, `Issue`).
- Realtime feed updates approximately every 5 seconds.
- Pie chart renders when data exists.
- Card navigation to `/devices` filters works.

## 4. Devices Page

- Device cards render with ID/name.
- Filters `all/online/good/issue` produce correct subsets.
- Offline cards show offline panel.
- Clicking card opens `/devices/:id`.

## 5. Device Detail

- Live mode shows chart updates.
- History mode returns data for known date range.
- Same-date range returns expected rows.
- Threshold inputs draw reference lines.
- Offline message appears when device not live.

## 6. Graph Page

- Live/history toggle works.
- Device selector updates chart.
- History refresh button fetches data and animation triggers.
- Tooltip values are shown with two decimals.
- Stats (min/max/avg) render correctly.

## 7. Alarms

- Alarm table loads rows from alarm dataset.
- Timestamp and message fields appear correctly.
- Empty state appears when no alarms.

## 8. Export

- Device list in export form is populated.
- Export with date range downloads CSV.
- CSV includes expected headers and rows.
- Numeric-like values are formatted with two decimals.
- Time column is exported as `Time (IST)` and matches selected IST date boundaries.

## 9. Analytics

- Summary cards render values.
- Uptime chart renders with percentage values.
- Signal indicators (wifi/rssi) display correctly.
- Anomaly list renders or shows empty state.

## 10. User Management (Settings)

- Admin can create user.
- Admin can edit role/password.
- Admin can delete user.
- Non-admin sees view-only restriction.

## 11. Responsive Navigation

- Desktop sidebar navigation works.
- Mobile drawer opens/closes and route links work.
- Sidebar support menu shows `Help Center` and `About` only (Notifications hidden by design).

## 12. Regression Focus

- Realtime status should not flap offline under normal 5s publish cadence.
- History mode must not auto-refresh continuously.
- Same-day history range must return data when present.
