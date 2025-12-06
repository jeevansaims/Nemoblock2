import React from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type CalendarBlockConfig = {
  id: string;
  portfolioId?: string;
};

interface YearViewBlockProps {
  block: CalendarBlockConfig;
  onChangePortfolio: (portfolioId: string) => void;
  onClose: () => void;
  children: React.ReactNode;
  disableClose?: boolean;
}

export function YearViewBlock({ block, onChangePortfolio, onClose, children, disableClose }: YearViewBlockProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Portfolio</span>
          <Select
            value={block.portfolioId ?? "all"}
            onValueChange={(val) => onChangePortfolio(val)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All strategies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!disableClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-400 hover:text-slate-100"
            onClick={onClose}
            aria-label="Remove block"
          >
            ✕
          </Button>
        )}
      </header>
      {children}
    </section>
  );
}
