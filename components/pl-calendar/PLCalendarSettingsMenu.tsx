"use client";

import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { PLCalendarSettings, PLCalendarSettingKey } from "@/lib/settings/pl-calendar-settings";

interface PLCalendarSettingsMenuProps {
  settings: PLCalendarSettings;
  onChange: (next: PLCalendarSettings) => void;
}

const items: { key: PLCalendarSettingKey; label: string }[] = [
  { key: "showWeeklyBands", label: "Weekly regime bands" },
  { key: "showHeatmap", label: "P/L heatmap intensity" },
  { key: "showStreaks", label: "Win / loss streak tags" },
  { key: "showWeeklyStrategies", label: "Weekly strategy breakdown" },
  { key: "showWeeklySparkline", label: "Weekly drawdown sparkline" },
];

export function PLCalendarSettingsMenu({ settings, onChange }: PLCalendarSettingsMenuProps) {
  const toggle = (key: PLCalendarSettingKey) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Display Settings</p>
          <p className="text-xs text-muted-foreground">
            Toggle calendar overlays to A/B test readability.
          </p>
          <div className="space-y-2 pt-1">
            {items.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-sm">{item.label}</span>
                <Switch checked={settings[item.key]} onCheckedChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
