import clsx from "clsx";

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "ok" | "issue" | "neutral"; }) {
  const map = {
    ok: "bg-green-50 text-green-700 border-green-200",
    issue: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200"
  } as const;
  return <span className={clsx("px-2.5 py-1 rounded-full text-xs font-semibold border", map[tone])}>{label}</span>;
}
