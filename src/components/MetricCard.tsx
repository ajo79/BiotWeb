import { motion } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import React from "react";

type Props = {
  title: string;
  value: string | number;
  sub?: string;
  accent?: string;
  progress?: number; // 0-100
  children?: React.ReactNode;
  onClick?: () => void;
};

export default function MetricCard({ title, value, sub, accent = "#0EA5E9", progress = 0, children, onClick }: Props) {
  const motionPreset = useMotionPreset();
  const pct = Math.max(0, Math.min(100, Number.isFinite(Number(progress)) ? Number(progress) : 0));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const clickable = typeof onClick === "function";
  return (
    <motion.div
      layout
      {...motionPreset}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={`glass rounded-2xl p-4 shadow-ambient border border-white/5 ${clickable ? "cursor-pointer hover:-translate-y-0.5 transition" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-semibold" style={{ color: accent }}>{value}</p>
          {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
        </div>
        <div className="w-12 h-12 grid place-content-center">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke={accent}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 22 22)"
            />
          </svg>
        </div>
      </div>
      {children && <div className="mt-3 text-sm text-slate-200">{children}</div>}
    </motion.div>
  );
}
