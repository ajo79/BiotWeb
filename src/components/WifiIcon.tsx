import React from "react";

export default function WifiIcon({
  strength = 0,
  size = 22,
  inactive = "#cbd5e1",
  offline = false,
}: {
  strength?: number;
  size?: number;
  inactive?: string;
  offline?: boolean;
}) {
  const computedLevel = Number.isFinite(Number(strength))
    ? Math.max(0, Math.min(4, Math.round(Number(strength))))
    : 0;
  const level = offline ? 4 : computedLevel;

  const active = offline
    ? inactive
    : level >= 4 ? "#16a34a" : // green (full)
    level === 3 ? "#2563eb" : // blue (good)
    level === 2 ? "#f59e0b" : // orange (weak)
    level === 1 ? "#dc2626" : // red (poor)
    "#cbd5e1";

  const show1 = offline ? true : level >= 2; // inner arc
  const show2 = offline ? true : level >= 3; // middle arc
  const show3 = offline ? true : level >= 4; // outer arc
  const showDot = offline ? true : level >= 1;

  const strokeProps = (show: boolean) => ({
    stroke: show ? active : inactive,
    opacity: show ? 1 : 0,
  });

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 8.5C6.1 4.5 17.9 4.5 22 8.5" fill="none" strokeWidth="2" strokeLinecap="round" {...strokeProps(show3)} />
      <path d="M5.5 12C8.1 9.4 15.9 9.4 18.5 12" fill="none" strokeWidth="2" strokeLinecap="round" {...strokeProps(show2)} />
      <path d="M8.8 15.4C10.3 13.9 13.7 13.9 15.2 15.4" fill="none" strokeWidth="2" strokeLinecap="round" {...strokeProps(show1)} />
      <circle cx="12" cy="18.3" r="1.8" fill={showDot ? active : inactive} />
      {offline && <line x1="4" y1="4" x2="20" y2="20" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
