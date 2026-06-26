# Operations Runbook

Branch covered: `NewUI_withMeter`.

## 1. Daily Operational Checks

- Verify dashboard loads and device counts appear.
- Confirm realtime pages update every ~5 seconds.
- Confirm visible realtime labels show `auto 5s` / `auto-refresh 5s`.
- Confirm graph history for same-day and multi-day ranges.
- Confirm alarm table receives records when alarms are active.
- Confirm eligible active alarms expose ACK actions on the Devices page.
- Confirm CSV export downloads valid rows for known range.
- Confirm export/date filters align to fixed IST day boundaries (UTC+05:30).
- Confirm site-scoped login only exposes devices for the expected site.

## 2. Health Signals

UI indicators:
- Device status (online/alarm/offline).
- Last seen timestamp on live pages.
- Uptime chart and anomaly queue in analytics.
- Site-branded meter KPI cards for the BlackStar Products energy site.

Operational interpretation:
- Repeated `stale/offline` bursts may indicate connectivity issues.
- Sudden drop in total realtime devices may indicate endpoint degradation.

## 3. Troubleshooting Guide

Issue: `vite` command not found
- Cause: dependencies not installed.
- Action: run `npm install` in project root.

Issue: app fails with tsconfig extends error
- Cause: invalid `extends` reference.
- Action: use current self-contained `tsconfig.json`.

Issue: history same-day range shows no data
- Current mitigation: client fallback fetch without server date filter, then client-side IST filter.
- Verify device has readings in selected IST date window (00:00 to 23:59 IST).

Issue: devices flap offline
- Current mitigation: robust online state machine with missed-poll and hysteresis logic.
- Verify endpoint latency and device publish cadence.

Issue: no realtime data
- Check network and endpoint availability.
- Confirm `VITE_API_URL` points to valid `/prod` endpoint.
- Validate API response still includes expected telemetry sections.

Issue: expected page missing in left menu
- Desktop navigation is now a top bar, not a left sidebar.
- Notifications route is available at `/notifications` but is hidden from primary navigation by design.
- Help/About remain visible in the navigation support section/drawer.

Issue: no devices appear after login
- Cause: fast realtime payload may be missing `siteId` or `deviceType`, or backend rows do not match the authenticated site policy.
- Action: verify a full fetch succeeds and that returned rows contain matching `siteId` plus allowed `deviceType` values for the selected site.

Issue: ACK button does not appear for an alarming device
- Cause: ACK is shown only when the device is online, the current row indicates common alarm, and the alarm lifecycle builder still sees an open alarm row for that device.
- Action: verify `ESP32_Alarms` includes an unclosed `alarmFlag=1` row for the device and no later matching clear row.

Issue: GoDaddy deployment shows old UI after upload
- Cause: old `index.html` or old `assets/` bundle is still being served, or browser/CDN cache is stale.
- Action: delete old `public_html/index.html` and `public_html/assets/`, upload the new `dist` contents, then hard refresh.
- Verify page source references the latest hashed JS/CSS files from the current `dist/index.html`.
- If auto-deploy is enabled, verify it deploys branch `NewUI_withMeter`.

## 4. Security and Compliance Notes

Current auth model is local browser storage based and not enterprise-grade.

Risks:
- Credentials and user records are local-only.
- No server-side audit trail or identity governance.

Production recommendation:
- Replace with backend identity provider and token validation.
- Remove hardcoded bootstrap credentials.
- Move site access policy enforcement to backend APIs.

## 5. Backup and Recovery

No server-side user DB in current frontend implementation.

Local data that can be backed up (browser data):
- `biot_auth`
- `biot_users_v1`
- `biot_profile`
- `biot_notifications`
- Local user rows also include site metadata and should be considered site-scoped configuration.

For managed environments, avoid relying on browser localStorage for critical identity data.

## 6. Change Management

Before release:
- run build.
- run smoke checklist.
- verify docs version/date updates.
- verify current branch name references `NewUI_withMeter` where applicable.

After release:
- monitor telemetry loading and online-state stability.
- verify exported CSV correctness with sample records and IST time column values.

## 7. Known Limitations

- No backend pagination contract guarantees; client handles many token aliases.
- Demo pages (notifications/help/profile) are local storage centric.
- Large production bundles trigger chunk size warnings (not blocking).
- GoDaddy static hosting requires manual cleanup of old hashed asset folders unless CI/CD handles it.
- Site access control is client-enforced only; backend still needs independent authorization.
