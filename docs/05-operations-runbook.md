# Operations Runbook

## 1. Daily Operational Checks

- Verify dashboard loads and device counts appear.
- Confirm realtime pages update every ~5 seconds.
- Confirm graph history for same-day and multi-day ranges.
- Confirm alarm table receives records when alarms are active.
- Confirm CSV export downloads valid rows for known range.

## 2. Health Signals

UI indicators:
- Device status (online/alarm/offline).
- Last seen timestamp on live pages.
- Uptime chart and anomaly queue in analytics.

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
- Current mitigation: client fallback fetch without server date filter, then local filter.
- Verify device has readings in selected local date window.

Issue: devices flap offline
- Current mitigation: robust online state machine with missed-poll and hysteresis logic.
- Verify endpoint latency and device publish cadence.

Issue: no realtime data
- Check network and endpoint availability.
- Confirm `VITE_API_URL` points to valid `/prod` endpoint.
- Validate API response still includes expected telemetry sections.

## 4. Security and Compliance Notes

Current auth model is local browser storage based and not enterprise-grade.

Risks:
- Credentials and user records are local-only.
- No server-side audit trail or identity governance.

Production recommendation:
- Replace with backend identity provider and token validation.
- Remove hardcoded factory credential.

## 5. Backup and Recovery

No server-side user DB in current frontend implementation.

Local data that can be backed up (browser data):
- `biot_auth`
- `biot_users_v1`
- `biot_profile`
- `biot_notifications`

For managed environments, avoid relying on browser localStorage for critical identity data.

## 6. Change Management

Before release:
- run build.
- run smoke checklist.
- verify docs version/date updates.

After release:
- monitor telemetry loading and online-state stability.
- verify exported CSV correctness with sample records.

## 7. Known Limitations

- No backend pagination contract guarantees; client handles many token aliases.
- Demo pages (notifications/help/profile) are local storage centric.
- Large production bundles trigger chunk size warnings (not blocking).

