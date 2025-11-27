"use client";

import { WorkspaceShell } from "@/components/workspace-shell";

export default function TpOptimizerPage() {
  return (
    <WorkspaceShell
      title="TP/SL Optimizer (MAE/MFE)"
      label="Latest"
      description="Upload trade CSVs, simulate TP/SL grids using MAE/MFE excursion data, and review how different exits would have changed your P/L."
    >
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">TP/SL Optimizer Component Coming Soon</p>
      </div>
    </WorkspaceShell>
  );
}
