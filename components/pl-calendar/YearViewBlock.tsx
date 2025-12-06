import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CalendarBlockConfig = {
  id: string;
  portfolioId?: string;
  isPrimary?: boolean;
};

interface YearViewBlockProps {
  block: CalendarBlockConfig;
  onChangePortfolio: (portfolioId: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function YearViewBlock({ block, onChangePortfolio, onClose, children }: YearViewBlockProps) {
  const isPrimary = !!block.isPrimary;
  const isEmpty = !block.portfolioId && !isPrimary;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Portfolio</span>
          <Select
            value={block.portfolioId ?? ""}
            onValueChange={(val) => onChangePortfolio(val)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Select portfolio…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!isPrimary && (
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

      {isEmpty ? (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs text-slate-500">
          Select a portfolio above to view yearly P/L.
        </div>
      ) : (
        children
      )}
    </section>
  );
}
