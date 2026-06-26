import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { acknowledgeAlarm } from "../api/client";
import { useAuth } from "../auth/auth";

export function useAlarmAcknowledge() {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const [ackingByKey, setAckingByKey] = useState<Record<string, boolean>>({});
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, string>>({});

  const acknowledge = async (deviceId: string, key: string) => {
    const normalizedDeviceId = String(deviceId ?? "").trim();
    if (!normalizedDeviceId || ackingByKey[key]) return;

    setAckingByKey((prev) => ({ ...prev, [key]: true }));
    setFeedbackByKey((prev) => ({ ...prev, [key]: "Sending ACK..." }));

    try {
      const response = await acknowledgeAlarm({
        deviceId: normalizedDeviceId,
        siteId: state.siteId,
        requestId: `${normalizedDeviceId}-${Date.now()}`,
      });

      if (!response.accepted) {
        throw new Error("ACK request was not accepted by backend.");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alarms"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["realtime"] }),
        queryClient.refetchQueries({ queryKey: ["alarms"], type: "active" }),
      ]);

      setFeedbackByKey((prev) => ({
        ...prev,
        [key]: "ACK sent. Device will clear only after value returns below threshold.",
      }));
    } catch (error: any) {
      setFeedbackByKey((prev) => ({
        ...prev,
        [key]: error?.message || "Failed to send ACK.",
      }));
    } finally {
      setAckingByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  return {
    acknowledge,
    ackingByKey,
    feedbackByKey,
  };
}
