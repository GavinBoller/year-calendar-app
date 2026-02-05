"use client";

import React from "react";
import { cn } from "@/lib/utils";

const monthShort = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const dayOfWeekShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface DayCellProps {
  key: string;
  date: Date;
  isToday: boolean;
  isFirstOfMonth: boolean;
  isWeekend: boolean;
  isPastDate: boolean;
  showDaysOfWeek?: boolean;
  onClick?: (dateKey: string) => void;
  children?: React.ReactNode;
}

export function DayCell({
  key: dateKey,
  date,
  isToday,
  isFirstOfMonth,
  isWeekend,
  isPastDate,
  showDaysOfWeek,
  onClick,
  children,
}: DayCellProps) {
  return (
    <div
      className={cn(
        "relative bg-background p-1 min-w-0 min-h-0 overflow-hidden cursor-pointer",
        isWeekend && 'bg-white before:content-[""] before:absolute before:inset-0 before:bg-[rgba(0,0,0,0.02)] before:pointer-events-none',
        isPastDate && "bg-slate-100/20 dark:bg-slate-800/20",
        isToday && "ring-1 ring-primary"
      )}
      title={date.toDateString()}
      onClick={() => onClick?.(dateKey)}
      tabIndex={0}
      role="button"
      aria-label={`${date.toLocaleDateString()} ${isToday ? '(Today)' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(dateKey);
        }
      }}
    >
      {/* Month label - more prominent and always visible */}
      {isFirstOfMonth && (
        <div className="absolute top-0.5 left-0.5 right-0.5 bg-primary/10 rounded-sm px-1 py-0.5">
          <div className="text-[9px] leading-none font-semibold uppercase tracking-wider text-primary">
            {monthShort[date.getMonth()]}
          </div>
        </div>
      )}

      {/* Month boundary line - vertical line on the left side of the 1st of each month */}
      {isFirstOfMonth && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/30" />
      )}

      {/* Day of week - subtle but consistent */}
      {showDaysOfWeek && (
        <div className="absolute top-0.5 right-0.5 text-[10px] leading-none text-muted-foreground/70 font-medium">
          {dayOfWeekShort[date.getDay()].slice(0, 2)}
        </div>
      )}

      {/* Date number - clearer and better positioned */}
      <div
        className={cn(
          "absolute bottom-0.5 left-1.5 text-[11px] leading-none font-medium",
          isToday && "text-primary font-bold",
          isWeekend && !isToday && "text-muted-foreground/80",
          !isToday && !isWeekend && "text-foreground/90"
        )}
      >
        {date.getDate()}
      </div>

      {/* Event content */}
      {children}
    </div>
  );
}