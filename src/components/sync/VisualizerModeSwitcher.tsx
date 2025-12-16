"use client";

import React from "react";
import { BarChart3, Activity, Circle } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type VisualizerVariant = "bars" | "waveform" | "circular";

interface VisualizerModeSwitcherProps {
  /** Currently selected visualization mode */
  value: VisualizerVariant;
  /** Callback when mode changes */
  onChange: (value: VisualizerVariant) => void;
  /** Optional className for custom styling */
  className?: string;
  /** Compact mode for mobile landscape (icons only, vertical layout) */
  compact?: boolean;
}

const modes: {
  value: VisualizerVariant;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "bars", label: "Bars", icon: <BarChart3 className="w-4 h-4" /> },
  { value: "waveform", label: "Wave", icon: <Activity className="w-4 h-4" /> },
  {
    value: "circular",
    label: "Circular",
    icon: <Circle className="w-4 h-4" />,
  },
];

/**
 * VisualizerModeSwitcher - Toggle between visualization modes
 *
 * Allows users to switch between:
 * - Bars: Frequency bar visualization
 * - Waveform: Time-domain waveform display
 * - Circular: Radial frequency analyzer
 */
export const VisualizerModeSwitcher: React.FC<VisualizerModeSwitcherProps> = ({
  value,
  onChange,
  className,
  compact = false,
}) => {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(newValue) => {
        // Prevent deselection - always have one mode selected
        if (newValue) {
          onChange(newValue as VisualizerVariant);
        }
      }}
      className={`${compact ? "flex-col" : ""} ${className || ""}`}
      size="sm"
    >
      {modes.map((mode) => (
        <ToggleGroupItem
          key={mode.value}
          value={mode.value}
          aria-label={`${mode.label} visualization`}
          className="gap-1.5 select-none"
        >
          {mode.icon}
          {!compact && <span>{mode.label}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

export default VisualizerModeSwitcher;
