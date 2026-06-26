import type { EnergyPreset } from "../utils/energyMeter";

type Props = {
  presets: EnergyPreset[];
  activePresetId?: string | null;
  onSelect: (preset: EnergyPreset) => void;
};

export default function EnergyPresetPicker({ presets, activePresetId, onSelect }: Props) {
  const visiblePresets = presets.filter((preset) => preset.metricIds.length);

  if (!visiblePresets.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visiblePresets.map((preset) => {
        const active = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <div className="text-sm font-semibold">{preset.title}</div>
            <div className={`text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{preset.description}</div>
          </button>
        );
      })}
    </div>
  );
}
