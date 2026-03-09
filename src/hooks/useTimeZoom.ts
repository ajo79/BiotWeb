import { useCallback, useEffect, useMemo, useState } from "react";

export type TimeDomain = {
  startTs: number;
  endTs: number;
};

type UseTimeZoomOptions = {
  baseDomain: TimeDomain;
  minWindowMs?: number;
  maxWindowMs?: number;
  boundsDomain?: TimeDomain;
};

const ZOOM_IN_FACTOR = 0.85;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const DOMAIN_EPSILON_MS = 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeDomain = (domain: TimeDomain): TimeDomain => {
  const start = Number(domain.startTs);
  const end = Number(domain.endTs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    const now = Date.now();
    return { startTs: now - 1, endTs: now };
  }
  if (end <= start) return { startTs: start, endTs: start + 1 };
  return { startTs: start, endTs: end };
};

const sameDomain = (a: TimeDomain, b: TimeDomain) =>
  Math.abs(a.startTs - b.startTs) <= DOMAIN_EPSILON_MS &&
  Math.abs(a.endTs - b.endTs) <= DOMAIN_EPSILON_MS;

const clampDomain = (
  domain: TimeDomain,
  bounds: TimeDomain,
  minWindowMs: number,
  maxWindowMs: number
): TimeDomain => {
  const normalized = normalizeDomain(domain);
  const normalizedBounds = normalizeDomain(bounds);
  const boundsWidth = Math.max(1, normalizedBounds.endTs - normalizedBounds.startTs);
  const minWindow = Math.max(1, Math.round(minWindowMs));
  const maxWindow = Math.max(minWindow, Math.min(Math.round(maxWindowMs), boundsWidth));

  const rawWidth = Math.max(1, normalized.endTs - normalized.startTs);
  const width = clamp(rawWidth, minWindow, maxWindow);
  let start = normalized.startTs;
  let end = start + width;

  if (start < normalizedBounds.startTs) {
    start = normalizedBounds.startTs;
    end = start + width;
  }
  if (end > normalizedBounds.endTs) {
    end = normalizedBounds.endTs;
    start = end - width;
  }

  if (start < normalizedBounds.startTs) {
    start = normalizedBounds.startTs;
  }
  if (end <= start) {
    end = Math.min(normalizedBounds.endTs, start + minWindow);
  }
  return { startTs: start, endTs: end };
};

export const useTimeZoom = ({
  baseDomain,
  minWindowMs = 15_000,
  maxWindowMs,
  boundsDomain,
}: UseTimeZoomOptions) => {
  const [zoomDomain, setZoomDomain] = useState<TimeDomain | null>(null);
  const [wheelElement, setWheelElementNode] = useState<HTMLElement | null>(null);

  const normalizedBase = useMemo(() => normalizeDomain(baseDomain), [baseDomain]);
  const normalizedBounds = useMemo(
    () => normalizeDomain(boundsDomain ?? baseDomain),
    [boundsDomain, baseDomain]
  );

  const effectiveMaxWindowMs = useMemo(() => {
    const boundsWidth = Math.max(1, normalizedBounds.endTs - normalizedBounds.startTs);
    const requestedMax = Number(maxWindowMs);
    const targetMax = Number.isFinite(requestedMax) ? requestedMax : boundsWidth;
    return Math.max(minWindowMs, Math.min(targetMax, boundsWidth));
  }, [normalizedBounds, minWindowMs, maxWindowMs]);

  const visibleDomain = useMemo(() => {
    if (!zoomDomain) return normalizedBase;
    return clampDomain(zoomDomain, normalizedBounds, minWindowMs, effectiveMaxWindowMs);
  }, [zoomDomain, normalizedBase, normalizedBounds, minWindowMs, effectiveMaxWindowMs]);
  const visibleWidth = Math.max(1, visibleDomain.endTs - visibleDomain.startTs);
  const boundsWidth = Math.max(1, normalizedBounds.endTs - normalizedBounds.startTs);
  const maxPanOffset = Math.max(0, boundsWidth - visibleWidth);
  const currentPanOffset = clamp(visibleDomain.startTs - normalizedBounds.startTs, 0, maxPanOffset);
  const panRatio = maxPanOffset > 0 ? currentPanOffset / maxPanOffset : 0;
  const canPan = maxPanOffset > DOMAIN_EPSILON_MS;

  useEffect(() => {
    setZoomDomain((prev) => {
      if (!prev) return prev;
      const clamped = clampDomain(prev, normalizedBounds, minWindowMs, effectiveMaxWindowMs);
      return sameDomain(prev, clamped) ? prev : clamped;
    });
  }, [normalizedBounds, minWindowMs, effectiveMaxWindowMs]);

  const resetZoom = useCallback(() => {
    setZoomDomain(null);
  }, []);

  const applyZoom = useCallback(
    (scaleFactor: number, pointerRatio = 0.5) => {
      const current = visibleDomain;
      const width = Math.max(1, current.endTs - current.startTs);
      const boundedPointerRatio = clamp(pointerRatio, 0, 1);
      const anchorTs = current.startTs + width * boundedPointerRatio;

      const nextWidthRaw = width * scaleFactor;
      const nextWidth = clamp(nextWidthRaw, minWindowMs, effectiveMaxWindowMs);
      let nextStart = anchorTs - nextWidth * boundedPointerRatio;
      let nextEnd = nextStart + nextWidth;

      if (nextStart < normalizedBounds.startTs) {
        nextStart = normalizedBounds.startTs;
        nextEnd = nextStart + nextWidth;
      }
      if (nextEnd > normalizedBounds.endTs) {
        nextEnd = normalizedBounds.endTs;
        nextStart = nextEnd - nextWidth;
      }

      const nextDomain = clampDomain(
        { startTs: nextStart, endTs: nextEnd },
        normalizedBounds,
        minWindowMs,
        effectiveMaxWindowMs
      );
      const fullBaseDomain = clampDomain(
        normalizedBase,
        normalizedBounds,
        minWindowMs,
        effectiveMaxWindowMs
      );
      setZoomDomain(sameDomain(nextDomain, fullBaseDomain) ? null : nextDomain);
    },
    [visibleDomain, minWindowMs, effectiveMaxWindowMs, normalizedBounds, normalizedBase]
  );

  const zoomIn = useCallback(() => {
    applyZoom(ZOOM_IN_FACTOR, 0.5);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    applyZoom(ZOOM_OUT_FACTOR, 0.5);
  }, [applyZoom]);

  useEffect(() => {
    if (!wheelElement) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = wheelElement.getBoundingClientRect();
      const pointerRatio =
        rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
      applyZoom(event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR, pointerRatio);
    };

    wheelElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      wheelElement.removeEventListener("wheel", handleWheel);
    };
  }, [wheelElement, applyZoom]);

  const setWheelElement = useCallback((element: HTMLElement | null) => {
    setWheelElementNode(element);
  }, []);

  const setPanRatio = useCallback(
    (ratio: number) => {
      const width = Math.max(1, visibleDomain.endTs - visibleDomain.startTs);
      const range = Math.max(0, (normalizedBounds.endTs - normalizedBounds.startTs) - width);
      if (range <= 0) return;

      const boundedRatio = clamp(ratio, 0, 1);
      const start = normalizedBounds.startTs + range * boundedRatio;
      const nextDomain = clampDomain(
        { startTs: start, endTs: start + width },
        normalizedBounds,
        minWindowMs,
        effectiveMaxWindowMs
      );
      const fullBaseDomain = clampDomain(
        normalizedBase,
        normalizedBounds,
        minWindowMs,
        effectiveMaxWindowMs
      );
      setZoomDomain(sameDomain(nextDomain, fullBaseDomain) ? null : nextDomain);
    },
    [visibleDomain, normalizedBounds, minWindowMs, effectiveMaxWindowMs, normalizedBase]
  );

  return {
    visibleDomain,
    isZoomed: zoomDomain !== null,
    canPan,
    panRatio,
    setPanRatio,
    zoomIn,
    zoomOut,
    resetZoom,
    setWheelElement,
  };
};
