import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDeviceHistory } from "../api/client";
import { useRealtime } from "../hooks/queries";

type IconProps = { className?: string };

function DashboardIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function DevicesIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <circle cx="8" cy="9" r="1" />
      <circle cx="12" cy="9" r="1" />
      <circle cx="16" cy="9" r="1" />
    </svg>
  );
}

function GraphIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19h16" />
      <path d="M5 15l4-4 4 3 5-7" />
      <circle cx="9" cy="11" r="1" />
      <circle cx="13" cy="14" r="1" />
      <circle cx="18" cy="7" r="1" />
    </svg>
  );
}

function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19h16" />
      <rect x="5" y="10" width="3" height="7" rx="1" />
      <rect x="10.5" y="7" width="3" height="10" rx="1" />
      <rect x="16" y="4" width="3" height="13" rx="1" />
    </svg>
  );
}

function AlarmsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M9.5 20a2.5 2.5 0 005 0" />
    </svg>
  );
}

function ExportIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <rect x="4" y="17" width="16" height="4" rx="2" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 000-6l-1.1-.4a6.7 6.7 0 00-1.2-2.1l.5-1.1a1.7 1.7 0 00-2.4-2.4l-1.1.5a6.7 6.7 0 00-2.1-1.2L12 2.6a1.7 1.7 0 00-6 0l-.4 1.1a6.7 6.7 0 00-2.1 1.2l-1.1-.5a1.7 1.7 0 00-2.4 2.4l.5 1.1a6.7 6.7 0 00-1.2 2.1L2.6 12a1.7 1.7 0 000 6l1.1.4a6.7 6.7 0 001.2 2.1l-.5 1.1a1.7 1.7 0 002.4 2.4l1.1-.5a6.7 6.7 0 002.1 1.2l.4 1.1a1.7 1.7 0 006 0l.4-1.1a6.7 6.7 0 002.1-1.2l1.1.5a1.7 1.7 0 002.4-2.4l-.5-1.1a6.7 6.7 0 001.2-2.1z" />
    </svg>
  );
}

function NotificationsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M9.5 20a2.5 2.5 0 005 0" />
    </svg>
  );
}

function HelpIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 015.8 1c0 2-3 2-3 4" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  );
}

function InfoIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <circle cx="12" cy="7" r="1" />
    </svg>
  );
}

const nav = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/devices", label: "Devices", icon: DevicesIcon },
  { to: "/graph", label: "Graph", icon: GraphIcon },
  { to: "/alarms", label: "Alarms", icon: AlarmsIcon },
  { to: "/export", label: "Export", icon: ExportIcon },
];

const MAX_HISTORY_PREFETCH_DEVICES = 16;

const toLocalDayStart = (epochMs: number) => {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const toLocalDayEnd = (epochMs: number) => {
  const d = new Date(epochMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const toLocalDayKey = (epochMs: number) => {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { logout, state } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const realtime = useRealtime({ enabled: true, refetchInterval: 5000 });
  const prefetchedHistoryKeysRef = useRef(new Set<string>());
  const prefetchedDayKeyRef = useRef<string>("");
  const secondaryNav = useMemo(
    () => [
      { to: "/help", label: "Help Center", icon: HelpIcon },
      { to: "/about", label: "About", icon: InfoIcon },
    ],
    []
  );
  const allNav = useMemo(() => [...nav, ...secondaryNav], [secondaryNav]);
  const active = useMemo(() => allNav.find((n) => pathname === n.to || pathname.startsWith(n.to + "/")), [pathname, allNav]);
  const apiUrl = (import.meta.env.VITE_API_URL as string) ?? "https://cg5h2ba15i.execute-api.ap-south-1.amazonaws.com/prod";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const dayKey = toLocalDayKey(now);
    if (prefetchedDayKeyRef.current !== dayKey) {
      prefetchedDayKeyRef.current = dayKey;
      prefetchedHistoryKeysRef.current.clear();
    }

    const source = [...(realtime.data?.items ?? []), ...(realtime.data?.realtimeItems ?? [])];
    if (!source.length) return;

    const ids = new Set<string>();
    source.forEach((item) => {
      const id = String(item?.deviceId ?? "").trim();
      if (id) ids.add(id);
    });
    const deviceIds = Array.from(ids).slice(0, MAX_HISTORY_PREFETCH_DEVICES);
    if (!deviceIds.length) return;

    const fromTs = toLocalDayStart(now);
    const toTs = toLocalDayEnd(now);
    const pending: Promise<unknown>[] = [];

    deviceIds.forEach((id) => {
      const cacheKey = `${id}:${fromTs}:${toTs}`;
      if (prefetchedHistoryKeysRef.current.has(cacheKey)) return;
      prefetchedHistoryKeysRef.current.add(cacheKey);
      pending.push(
        queryClient.prefetchQuery({
          queryKey: ["history", id, fromTs, toTs],
          queryFn: () => getDeviceHistory(id, fromTs, toTs),
          staleTime: 60_000,
        })
      );
    });

    if (!pending.length) return;
    void Promise.allSettled(pending);
  }, [queryClient, realtime.data?.items, realtime.data?.realtimeItems]);

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen text-slate-900">
      <div className="absolute inset-0 bg-white"></div>
      <div className="relative max-w-[92rem] mx-auto px-6 lg:px-8 pb-8 min-h-screen flex flex-col">
        <div className="grid lg:grid-cols-[14rem,1fr] gap-8 lg:gap-9 flex-1">
          <aside className="w-full lg:w-60 flex-shrink-0 pt-10 sticky top-0 h-screen hidden lg:block">
          <div className="text-xl font-semibold tracking-tight mb-2 flex items-center">
            <img
              src="/BIOT_logo.png"
              alt="BIOT logo"
              className="h-16 w-60 rounded-xl object-contain shadow-glow border border-slate-200 bg-white p-1"
            />
          </div>
          {state.userId && <div className="mb-4 text-xs text-slate-500">User ID: <span className="font-semibold text-slate-700">{state.userId}</span></div>}
          <div className="space-y-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-xl transition hover:-translate-y-0.5 hover:shadow-glow ${isActive ? "border border-blue-400 bg-blue-50" : "border border-slate-300 bg-white"}`
                }
              >
                {({ isActive }) => {
                  const Icon = item.icon;
                  return (
                    <>
                      <span className="flex items-center gap-3 font-semibold">
                        <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                        {item.label}
                      </span>
                      {isActive && <motion.div layoutId="pill" className="w-2 h-2 rounded-full bg-blue-600" />}
                    </>
                  );
                }}
              </NavLink>
            ))}
          </div>
          <div className="mt-6 text-xs font-semibold text-slate-400">Support</div>
          <div className="mt-2 space-y-2">
            {secondaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-xl transition hover:-translate-y-0.5 hover:shadow-glow ${isActive ? "border border-blue-400 bg-blue-50" : "border border-slate-300 bg-white"}`
                }
              >
                {({ isActive }) => {
                  const Icon = item.icon;
                  return (
                    <>
                      <span className="flex items-center gap-3 font-semibold">
                        <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                        {item.label}
                      </span>
                    </>
                  );
                }}
              </NavLink>
            ))}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold transition hover:-translate-y-0.5 hover:shadow-glow"
            >
              <span className="flex items-center gap-3">
                <span className="h-4 w-4 inline-flex items-center justify-center text-rose-700">⏻</span>
                Sign Out
              </span>
            </button>
          </div>
          </aside>

          <main className="flex-1 w-full pt-8 lg:pt-10 pl-1">
            <header className="flex flex-wrap items-center gap-3 justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <button
                    className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 bg-white shadow-ambient"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                  >
                    <span className="text-xl leading-none">☰</span>
                  </button>
                <p className="text-sm text-slate-400">Realtime IoT telemetry</p>
                <h1 className="text-3xl font-semibold">{active?.label ?? "Dashboard"}</h1>
                </div>
              </div>
            </header>
            {children}
          </main>
        </div>
        <div className="pt-10 bg-white">
          <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
            Copyright © 2026, BlackStar Products Pvt. Ltd. All Rights Reserved.
          </footer>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${menuOpen ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-black/20 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-64 bg-white shadow-ambient border-r border-slate-200 transform transition-transform ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center font-semibold">
              <img
                src="/BIOT_logo.png"
                alt="BIOT logo"
                className="h-14 w-28 rounded-lg object-contain shadow-glow border border-slate-200 bg-white p-1"
              />
              </div>
              <button className="text-xl" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
            </div>
            {state.userId && <div className="mt-2 text-xs text-slate-500">User ID: <span className="font-semibold text-slate-700">{state.userId}</span></div>}
          </div>
          <div className="p-3 space-y-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-xl border transition ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`
                }
              >
                {({ isActive }) => {
                  const Icon = item.icon;
                  return (
                    <>
                      <span className="flex items-center gap-3 font-semibold">
                        <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                        {item.label}
                      </span>
                    </>
                  );
                }}
              </NavLink>
            ))}
          </div>
          <div className="px-3 text-xs font-semibold text-slate-400">Support</div>
          <div className="p-3 space-y-2">
            {secondaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-xl border transition ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`
                }
              >
                {({ isActive }) => {
                  const Icon = item.icon;
                  return (
                    <>
                      <span className="flex items-center gap-3 font-semibold">
                        <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                        {item.label}
                      </span>
                    </>
                  );
                }}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold"
            >
              <span className="flex items-center gap-3">
                <span className="h-4 w-4 inline-flex items-center justify-center text-rose-700">⏻</span>
                Sign Out
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
