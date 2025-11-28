export interface PLCalendarSettings {
  showWeeklyBands: boolean;
  showHeatmap: boolean;
  showStreaks: boolean;
  showWeeklyStrategies: boolean;
  showWeeklySparkline: boolean;
}

export const defaultPLCalendarSettings: PLCalendarSettings = {
  showWeeklyBands: true,
  showHeatmap: true,
  showStreaks: true,
  showWeeklyStrategies: true,
  showWeeklySparkline: false,
};

export type PLCalendarSettingKey = keyof PLCalendarSettings;
