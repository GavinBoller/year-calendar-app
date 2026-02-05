"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AllDayEvent } from "@/types/calendar";

interface EventBarProps {
  event: AllDayEvent;
  calendarColors: Record<string, string>;
  multipleEventsOnDay: boolean;
  lane: number;
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onClick: (event: React.MouseEvent) => void;
}

export function EventBar({
  event,
  calendarColors,
  multipleEventsOnDay,
  lane,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: EventBarProps) {
  const bg = event.calendarId ? calendarColors[event.calendarId] : undefined;

  return (
    <div
      className={cn(
        "rounded-sm px-1 text-[10px] leading-[12px] shadow-sm overflow-hidden",
        // Disable text wrapping if multiple events on the same day
        multipleEventsOnDay ? "whitespace-nowrap truncate" : "whitespace-normal break-words",
        // Add horizontal separator for events in higher lanes
        lane > 0 && "border-t-2 border-white/30"
      )}
      style={{
        backgroundColor: bg || "#3174ad",
        color: "#ffffff",
        lineHeight: '12px',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`Event: ${event.summary}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as any);
        }
      }}
    >
      {event.summary}
    </div>
  );
}