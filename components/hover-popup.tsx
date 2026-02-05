"use client";

import React from "react";
import { AllDayEvent } from "@/types/calendar";

interface HoverPopupProps {
  events: AllDayEvent[];
  date: Date;
  calendarColors: Record<string, string>;
  calendarNames: Record<string, string>;
  position: { x: number; y: number; showAbove: boolean };
}

export function HoverPopup({
  events,
  date,
  calendarColors,
  calendarNames,
  position,
}: HoverPopupProps) {
  return (
    <div
      className="fixed z-50 pointer-events-none bg-card border rounded-md shadow-lg max-w-sm"
      style={{
        top: position.y,
        left: position.x,
        transform: position.showAbove
          ? "translateX(-50%) translateY(-100%)"
          : "translateX(-50%) translateY(0%)",
      }}
      role="tooltip"
      aria-label={`Events for ${date.toLocaleDateString()}`}
    >
      <div className="p-3">
        <div className="text-sm font-medium mb-2">
          {date.toLocaleDateString('en-GB', {
            weekday: 'short'
          })} {date.getDate()} {date.toLocaleDateString('en-GB', {
            month: 'short'
          })} - All Events
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {events.map((event: AllDayEvent, index: number) => (
            <div key={event.id} className="flex items-start gap-2 text-xs">
              <div
                className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0"
                style={{
                  backgroundColor: calendarColors[event.calendarId || ""] || "#3174ad",
                }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{event.summary}</div>
                <div className="text-muted-foreground truncate">
                  {calendarNames[event.calendarId || ""] || "Calendar"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}