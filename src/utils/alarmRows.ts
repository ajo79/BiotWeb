export function sortAlarmRowsLatestFirst<T extends { ts?: number | string }>(rows: T[]) {
  return [...(rows ?? [])].sort((a, b) => {
    const aTs = Number(a?.ts);
    const bTs = Number(b?.ts);
    const aHasTs = Number.isFinite(aTs);
    const bHasTs = Number.isFinite(bTs);
    if (aHasTs && bHasTs) return bTs - aTs;
    if (aHasTs) return -1;
    if (bHasTs) return 1;
    return 0;
  });
}

export type AlarmLifecycleRow = {
  deviceId: string;
  deviceName: string;
  message: string;
  activeTs?: number;
  clearedTs?: number;
  activeTimeText?: string;
  clearedTimeText?: string;
  sourceStatus: "active" | "cleared" | "merged";
};

const toFiniteTs = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const lifecycleSortTs = (row: AlarmLifecycleRow) => row.clearedTs ?? row.activeTs ?? Number.NEGATIVE_INFINITY;

export function mergeAlarmRows(rows: any[]): AlarmLifecycleRow[] {
  const oldestFirst = [...(rows ?? [])].sort((a, b) => {
    const aTs = toFiniteTs(a?.ts);
    const bTs = toFiniteTs(b?.ts);
    if (aTs !== undefined && bTs !== undefined) return aTs - bTs;
    if (aTs !== undefined) return -1;
    if (bTs !== undefined) return 1;
    return 0;
  });

  const openByDevice = new Map<string, AlarmLifecycleRow[]>();
  const mergedRows: AlarmLifecycleRow[] = [];

  oldestFirst.forEach((row) => {
    const deviceId = String(row?.deviceId ?? "").trim();
    if (!deviceId) return;

    const deviceName = String(row?.deviceName ?? "").trim();
    const message = String(row?.message ?? "").trim() || "Alarm";
    const ts = toFiniteTs(row?.ts);
    const timestampText = String(row?.timestamp ?? "").trim();
    const alarmFlag = Number(row?.alarmFlag);
    const deviceKey = deviceId.toUpperCase();

    if (alarmFlag === 1) {
      const lifecycleRow: AlarmLifecycleRow = {
        deviceId,
        deviceName,
        message,
        activeTs: ts,
        activeTimeText: timestampText || undefined,
        sourceStatus: "active",
      };
      mergedRows.push(lifecycleRow);
      const openRows = openByDevice.get(deviceKey) ?? [];
      openRows.push(lifecycleRow);
      openByDevice.set(deviceKey, openRows);
      return;
    }

    if (alarmFlag === 0) {
      const openRows = openByDevice.get(deviceKey) ?? [];
      const openLifecycle = openRows.pop();
      if (openLifecycle) {
        openLifecycle.clearedTs = ts;
        openLifecycle.clearedTimeText = timestampText || undefined;
        openLifecycle.sourceStatus = "merged";
        if (!openLifecycle.deviceName && deviceName) {
          openLifecycle.deviceName = deviceName;
        }
        if (openRows.length) openByDevice.set(deviceKey, openRows);
        else openByDevice.delete(deviceKey);
        return;
      }
      return;
    }

    mergedRows.push({
      deviceId,
      deviceName,
      message,
      activeTs: ts,
      activeTimeText: timestampText || undefined,
      sourceStatus: "active",
    });
  });

  return [...mergedRows].sort((a, b) => lifecycleSortTs(b) - lifecycleSortTs(a));
}

export function getLatestAlarmRowByDevice(rows: any[]) {
  const latestByDevice = new Map<string, any>();

  sortAlarmRowsLatestFirst(rows).forEach((row) => {
    const deviceId = String(row?.deviceId ?? "").trim();
    if (!deviceId) return;
    const key = deviceId.toUpperCase();
    if (!latestByDevice.has(key)) {
      latestByDevice.set(key, row);
    }
  });

  return latestByDevice;
}

export function getOpenAlarmDeviceIds(rows: any[]) {
  return new Set(
    mergeAlarmRows(rows)
      .filter((row) => row.activeTs != null && row.clearedTs == null)
      .map((row) => String(row.deviceId ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
}
