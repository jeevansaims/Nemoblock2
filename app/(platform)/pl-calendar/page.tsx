"use client";

import { WorkspaceShell } from "@/components/workspace-shell";

export default function PlCalendarPage() {
  return (
    <WorkspaceShell
      title="P/L Calendar"
      label="New"
      description="Visualize daily P/L and drill into trades and legs for each day."
    >
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">P/L Calendar Component Coming Soon</p>
      </div>
    </WorkspaceShell>
  );
}
