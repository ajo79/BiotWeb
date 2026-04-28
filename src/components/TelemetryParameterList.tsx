import { useMemo, useState } from "react";
import { formatParameterLabel, formatParameterValue, getDecodedParameters } from "../utils/metrics";

type TelemetryParameterListProps = {
  item: any;
  maxVisible?: number;
  align?: "left" | "right";
  className?: string;
};

export default function TelemetryParameterList({
  item,
  maxVisible = 4,
  align = "left",
  className = "",
}: TelemetryParameterListProps) {
  const [expanded, setExpanded] = useState(false);
  const isShiftCountParam = (param: any) => {
    const text = `${param.key ?? ""} ${param.label ?? ""}`.toLowerCase();
    return /\bshift[\s_-]*[123]\b/.test(text) && /\bcount\b/.test(text);
  };

  const params = useMemo(
    () => getDecodedParameters(item).filter((param) => !isShiftCountParam(param)),
    [item]
  );

  if (!params.length) {
    return <p className={`text-xs text-slate-500 ${className}`.trim()}>No telemetry parameters.</p>;
  }

  const visible = expanded ? params : params.slice(0, maxVisible);
  const hasMore = params.length > maxVisible;
  const rightAlign = align === "right";

  return (
    <div className={`space-y-1 ${className}`.trim()}>
      {visible.map((param) => (
        <div
          key={param.id}
          className={`flex gap-2 text-sm ${rightAlign ? "justify-end text-right" : "justify-between"}`}
        >
          <span className="text-slate-600">{formatParameterLabel(param)}</span>
          <span className="font-semibold text-slate-900">{formatParameterValue(param.value)}</span>
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className={`text-xs font-semibold text-blue-600 hover:text-blue-700 ${rightAlign ? "ml-auto block" : ""}`}
        >
          {expanded ? "Show less" : `Show more (${params.length - maxVisible})`}
        </button>
      )}
    </div>
  );
}
