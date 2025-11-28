export interface PLCalendarSettings {
  showWeeklyBands: boolean;
  showHeatmap: boolean;
  showStreaks: boolean;
  showWeeklyStrategies: boolean;
  showWeeklySparkline: boolean;
  // Analytics / insights
  showConsistencyScore: boolean;
  showVolatilityView: boolean;
  showEVScoring: boolean;
  // UX / annotations
  showTradeTypeIcons: boolean;
  showNLPNotes: boolean;
  showTimeOfDayHeatmap: boolean;
  // Export
  enablePDFWeeklyExport: boolean;
}

export const defaultPLCalendarSettings: PLCalendarSettings = {
  showWeeklyBands: true,
  showHeatmap: true,
  showStreaks: true,
  showWeeklyStrategies: true,
  showWeeklySparkline: false,
  showConsistencyScore: true,
  showVolatilityView: false,
  showEVScoring: false,
  showTradeTypeIcons: true,
  showNLPNotes: false,
  showTimeOfDayHeatmap: false,
  enablePDFWeeklyExport: false,
};

export type PLCalendarSettingKey = keyof PLCalendarSettings;
