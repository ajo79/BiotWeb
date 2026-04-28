import { useQuery } from "@tanstack/react-query";
import { getDashboard, getRealtime, getAnalytics, getAlarms, getDeviceHistory } from "../api/client";

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
export const useRealtime = (options?: { enabled?: boolean; refetchInterval?: number | false }) =>
  useQuery({
    queryKey: ["realtime"],
    queryFn: getRealtime,
    refetchInterval: options?.refetchInterval ?? 5000,
    enabled: options?.enabled ?? true,
    retry: false,
    placeholderData: (previousData) => previousData,
  });
export const useAnalytics = () => useQuery({ queryKey: ["analytics"], queryFn: getAnalytics, refetchInterval: 7000 });
export const useAlarms = () => useQuery({ queryKey: ["alarms"], queryFn: getAlarms, refetchInterval: 7000 });
export const useDeviceHistory = (id: string, from?: number, to?: number) =>
  useQuery({
    queryKey: ["history", id, from, to],
    queryFn: () => getDeviceHistory(id, from, to),
    enabled: Boolean(id),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
