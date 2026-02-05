"use client";
import React, { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { cn, formatDateKey } from "@/lib/utils";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "./error-boundary";
import { LoadingState, CalendarSkeleton } from "./loading-state";
import { DayCell } from "./day-cell";
import { EventBar } from "./event-bar";
import { HoverPopup } from "./hover-popup";
import { EventPopover } from "./event-popover";
import { AllDayEvent, CalendarListItem } from "@/types/calendar";
import { X, Plus, Calendar as CalendarIcon, MoreHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { CalendarView } from "./view-controls";
import { MobileGestures } from "./mobile-gestures";

export type { AllDayEvent, CalendarListItem };
function expandEventsToDateMap(events: AllDayEvent[]) {
  const map = new Map<string, AllDayEvent[]>();
  for (const ev of events) {
    const start = new Date(ev.startDate + "T00:00:00Z");
    const end = new Date(ev.endDate + "T00:00:00Z"); // exclusive
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const local = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      const key = formatDateKey(
        new Date(
          local.getUTCFullYear(),
          local.getUTCMonth(),
          local.getUTCDate()
        )
      );
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
  }
  return map;
}

function generateYearDays(year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const days: Array<{ key: string; date: Date }> = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    days.push({ key: formatDateKey(date), date });
  }
  return days;
}

function computeSquareGridColumns(
  totalDays: number,
  width: number,
  height: number,
  gapPx = 1
) {
  if (width <= 0 || height <= 0) return { cols: 1, cell: 10 };
  let bestCols = 1;
  let bestCell = 0;
  const maxCols = Math.min(totalDays, Math.max(1, Math.floor(width))); // safe upper bound
  for (let cols = 1; cols <= maxCols; cols++) {
    const usableWidth = width - (cols - 1) * gapPx;
    const cellSize = Math.floor(usableWidth / cols);
    if (cellSize <= 0) break;
    const rows = Math.ceil(totalDays / cols);
    const totalHeight = rows * cellSize + (rows - 1) * gapPx;
    if (totalHeight <= height) {
      if (cellSize > bestCell) {
        bestCell = cellSize;
        bestCols = cols;
      }
    }
  }
  if (bestCell === 0) {
    // Fallback if nothing fit: pick minimal cell that fits width and let height scroll slightly
    const usableWidth = width - (bestCols - 1) * gapPx;
    bestCell = Math.max(10, Math.floor(usableWidth / bestCols));
  }
  return { cols: bestCols, cell: bestCell };
}

const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dayOfWeekShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function hexToRgba(hex: string, alpha = 0.35) {
  try {
    let h = hex.replace("#", "").trim();
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
    const a = Math.min(1, Math.max(0, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } catch {
    return hex;
  }
}

export function YearCalendar({
  year,
  events,
  signedIn,
  calendarColors = {},
  calendarNames = {},
  calendarAccounts = {},
  onHideEvent,
  onDeleteEvent,
  onDayClick,
  onUpdateEvent,
  writableCalendars = [],
  writableAccountsWithCalendars = [],
  showDaysOfWeek = false,
  customDays,
  currentYear,
}: {
  year: number;
  events: AllDayEvent[];
  signedIn: boolean;
  calendarColors?: Record<string, string>;
  calendarNames?: Record<string, string>;
  calendarAccounts?: Record<string, string>;
  onHideEvent?: (id: string) => void;
  onDeleteEvent?: (id: string) => Promise<void> | void;
  onDayClick?: (dateKey: string) => void;
  onUpdateEvent?: (event: {
    id: string;
    title: string;
    calendarId: string;
    startDate: string;
    endDate?: string;
  }) => Promise<void> | void;
  writableCalendars?: CalendarListItem[];
  writableAccountsWithCalendars?: Array<{
    accountId: string;
    email: string;
    list: CalendarListItem[];
  }>;
  showDaysOfWeek?: boolean;
  customDays?: Array<{ key: string; date: Date }>;
  currentYear?: number;
}) {
  const [todayKey, setTodayKey] = React.useState<string>("");

  React.useEffect(() => {
    // Calculate todayKey on client side to avoid SSR hydration mismatch
    setTodayKey(formatDateKey(new Date()));
  }, []);
  const dateMap = useMemo(() => expandEventsToDateMap(events), [events]);
  const days = useMemo(() => customDays || generateYearDays(year), [customDays, year]);
  const dayIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((d, i) => map.set(d.key, i));
    return map;
  }, [days]);
  const [cellSizePx, setCellSizePx] = React.useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [popover, setPopover] = React.useState<{
    event: AllDayEvent | null;
    x: number;
    y: number;
  }>({ event: null, x: 0, y: 0 });
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const [isEditing, setIsEditing] = React.useState<boolean>(false);
  const [editTitle, setEditTitle] = React.useState<string>("");
  const [editCalendarId, setEditCalendarId] = React.useState<string>("");
  const [editStartDate, setEditStartDate] = React.useState<string>("");
  const [editHasEndDate, setEditHasEndDate] = React.useState<boolean>(false);
  const [editEndDate, setEditEndDate] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [menuOpen, setMenuOpen] = React.useState<boolean>(false);
  const [hoveredEvent, setHoveredEvent] = React.useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [hoveredDayEvents, setHoveredDayEvents] = React.useState<{ events: AllDayEvent[], date: Date } | null>(null);
  const [popupPosition, setPopupPosition] = React.useState<{ x: number; y: number; showAbove: boolean } | null>(null);
  const [focusedDayIndex, setFocusedDayIndex] = React.useState<number | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const editStartDateInputRef = React.useRef<HTMLInputElement | null>(null);
  const editEndDateInputRef = React.useRef<HTMLInputElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  // Important for hydration: start with a deterministic server/client match,
  // then compute real columns after mount to avoid style mismatches.
  const [gridDims, setGridDims] = React.useState<{
    cols: number;
    cell: number;
  }>(() => ({
    cols: 12,
    cell: 12,
  }));

  React.useEffect(() => {
    function onResize() {
      setGridDims(
        computeSquareGridColumns(
          days.length,
          window.innerWidth,
          window.innerHeight
        )
      );
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [days.length]);
  React.useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const firstCell = grid.querySelector<HTMLElement>('[data-day-cell="1"]');
    if (firstCell) {
      const rect = firstCell.getBoundingClientRect();
      if (rect.width && rect.height) {
        setCellSizePx({ w: rect.width, h: rect.height });
      }
    }
  }, [gridDims.cols, gridDims.cell, year]);
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!popover.event) return;
      if (popoverRef.current && e.target instanceof Node) {
        if (!popoverRef.current.contains(e.target)) {
          setPopover({ event: null, x: 0, y: 0 });
          setIsEditing(false);
          setMenuOpen(false);
        }
      } else {
        setPopover({ event: null, x: 0, y: 0 });
        setIsEditing(false);
        setMenuOpen(false);
      }
      if (menuRef.current && e.target instanceof Node) {
        if (!menuRef.current.contains(e.target)) {
          setMenuOpen(false);
        }
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPopover({ event: null, x: 0, y: 0 });
        setIsEditing(false);
        setMenuOpen(false);
        setFocusedDayIndex(null);
      }

      // Keyboard navigation for calendar days
      if (gridRef.current && gridRef.current.contains(e.target as Node)) {
        const cols = gridDims.cols;
        const totalDays = days.length;

        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFocusedDayIndex(prev => {
            if (prev === null) return 0;
            return Math.min(prev + 1, totalDays - 1);
          });
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusedDayIndex(prev => {
            if (prev === null) return 0;
            return Math.max(prev - 1, 0);
          });
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedDayIndex(prev => {
            if (prev === null) return 0;
            const next = prev + cols;
            return next < totalDays ? next : prev;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedDayIndex(prev => {
            if (prev === null) return 0;
            const next = prev - cols;
            return next >= 0 ? next : prev;
          });
        } else if (e.key === "Enter" && focusedDayIndex !== null) {
          e.preventDefault();
          onDayClick?.(days[focusedDayIndex].key);
        } else if (e.key === "Home") {
          e.preventDefault();
          setFocusedDayIndex(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setFocusedDayIndex(totalDays - 1);
        }
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover.event, menuOpen, focusedDayIndex, gridDims.cols, days, onDayClick]);

  React.useEffect(() => {
    if (popover.event && !isEditing) {
      // Initialize edit state when popover opens
      setEditTitle(popover.event.summary);
      setEditCalendarId(popover.event.calendarId || "");
      setEditStartDate(popover.event.startDate);
      // Check if event has an end date (endDate is exclusive, so if it's different from startDate + 1 day, it's a multi-day event)
      const start = new Date(popover.event.startDate + "T00:00:00Z");
      const end = new Date(popover.event.endDate + "T00:00:00Z");
      const daysDiff = Math.round(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 1) {
        setEditHasEndDate(true);
        // Convert exclusive endDate to inclusive for editing
        const endInclusive = new Date(end.getTime() - 86400000);
        const y = endInclusive.getUTCFullYear();
        const m = `${endInclusive.getUTCMonth() + 1}`.padStart(2, "0");
        const d = `${endInclusive.getUTCDate()}`.padStart(2, "0");
        setEditEndDate(`${y}-${m}-${d}`);
      } else {
        setEditHasEndDate(false);
        setEditEndDate("");
      }
    }
  }, [popover.event, isEditing]);

  function formatDisplayRange(startIsoDate: string, endIsoDate: string) {
    const start = new Date(startIsoDate + "T00:00:00");
    const end = new Date(endIsoDate + "T00:00:00"); // exclusive
    const endInclusive = new Date(end.getTime() - 86400000);
    const sameMonth =
      start.getFullYear() === endInclusive.getFullYear() &&
      start.getMonth() === endInclusive.getMonth();
    const optsDay: Intl.DateTimeFormatOptions = { day: "numeric" };
    const optsMon: Intl.DateTimeFormatOptions = { month: "short" };
    const optsYear: Intl.DateTimeFormatOptions = { year: "numeric" };
    if (start.toDateString() === endInclusive.toDateString()) {
      return `${start.toLocaleString(undefined, {
        ...optsMon,
        ...optsDay,
      })}, ${start.toLocaleString(undefined, optsYear)}`;
    }
    if (sameMonth) {
      return `${start.toLocaleString(undefined, {
        ...optsMon,
        ...optsDay,
      })}–${endInclusive.toLocaleString(
        undefined,
        optsDay
      )}, ${start.toLocaleString(undefined, optsYear)}`;
    }
    const left = `${start.toLocaleString(undefined, {
      ...optsMon,
      ...optsDay,
    })}, ${start.toLocaleString(undefined, optsYear)}`;
    const right = `${endInclusive.toLocaleString(undefined, {
      ...optsMon,
      ...optsDay,
    })}, ${endInclusive.toLocaleString(undefined, optsYear)}`;
    return `${left} – ${right}`;
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="relative h-full w-full">
        <div
          ref={gridRef}
          className="grid h-full w-full bg-border p-px"
          suppressHydrationWarning
          style={{
            gridTemplateColumns: `repeat(${gridDims.cols}, 1fr)`,
            gridAutoRows: `${gridDims.cell}px`,
            gap: "1px",
          }}
        >
          {days.map(({ key, date }) => {
            const isToday = key === todayKey;
            const dayEvents = dateMap.get(key) || [];
            const isFirstOfMonth = date.getDate() === 1;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isPastDate = todayKey && key < todayKey;
            return (
              <div
                key={key}
                data-day-cell="1"
                className={cn(
                  "relative bg-background p-1 min-w-0 min-h-0 overflow-hidden",
                  isWeekend &&
                    'bg-white before:content-[""] before:absolute before:inset-0 before:bg-[rgba(0,0,0,0.02)] before:pointer-events-none',
                  isPastDate && "bg-slate-100/20 dark:bg-slate-800/20",
                  isToday && "ring-1 ring-primary"
                )}
                title={date.toDateString()}
                onClick={(e) => {
                  // Event bars are in a separate overlay with pointer-events-auto,
                  // so clicks on them won't reach here. Only clicks on empty day areas will.
                  onDayClick?.(key);
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
                {/* Event chips removed; events are rendered as spanning bars below */}
              </div>
            );
          })}
        </div>
        {/* Absolute overlay using pixel positioning to perfectly align with day cells */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ padding: 1 }}
        >
          {React.useMemo(() => {
            const cols = gridDims.cols || 12;
            const gap = 1; // matches gap-px
            const pad = 0; // already accounted by wrapper padding style above
            if (!cols || !cellSizePx.w || !cellSizePx.h) return null;
            type Seg = {
              row: number;
              startCol: number;
              endCol: number;
              ev: AllDayEvent;
            };
            const rowToSegs = new Map<number, Seg[]>();
            for (const ev of events) {
              const startIdx = dayIndexByKey.get(ev.startDate);
              const endIdxExclusive = dayIndexByKey.get(ev.endDate);
              if (startIdx == null || endIdxExclusive == null) continue;
              let segStart = startIdx;
              while (segStart < endIdxExclusive) {
                const row = Math.floor(segStart / cols);
                const rowEndExclusive = Math.min(
                  endIdxExclusive,
                  (row + 1) * cols
                );
                const startCol = segStart % cols; // 0-based inclusive
                const endCol =
                  rowEndExclusive % cols === 0 ? cols : rowEndExclusive % cols; // 1..cols inclusive
                const list = rowToSegs.get(row) ?? [];
                list.push({ row, startCol, endCol, ev });
                rowToSegs.set(row, list);
                segStart = rowEndExclusive;
              }
            }
            const bars: Array<React.ReactElement> = [];
            const labelOffset = 16;
            const laneHeight = 32;
            const compactLaneHeight = 20; // Smaller spacing for multiple events
            const maxLanes = Math.max(
              3, // Ensure at least 3 events can be shown per day
              Math.floor((cellSizePx.h - labelOffset - 2) / laneHeight)
            );

            // Count events per day across all rows to determine if text should wrap and show more indicator
            const eventsPerDay = new Map<number, number>();
            const shownEventsPerDay = new Map<number, number>();
            for (const [row, segs] of rowToSegs) {
              for (const seg of segs) {
                // Use absolute day index as key: row * cols + startCol
                const dayIndex = row * cols + seg.startCol;
                eventsPerDay.set(dayIndex, (eventsPerDay.get(dayIndex) || 0) + 1);
              }
            }

            for (const [row, segs] of rowToSegs) {
              segs.sort((a, b) => {
                // Sort by start column first
                if (a.startCol !== b.startCol) {
                  return a.startCol - b.startCol;
                }
                // Then by event ID for stable sorting
                return a.ev.id.localeCompare(b.ev.id);
              });

              const laneEnds: number[] = [];
              for (const seg of segs) {
                let lane = 0;
                while (
                  lane < laneEnds.length &&
                  seg.startCol < laneEnds[lane]
                ) {
                  lane++;
                }
                if (lane >= maxLanes) continue;
                if (lane === laneEnds.length) laneEnds.push(seg.endCol);
                else laneEnds[lane] = seg.endCol;

                // Count shown events per day
                const dayIndex = row * cols + seg.startCol;
                shownEventsPerDay.set(dayIndex, (shownEventsPerDay.get(dayIndex) || 0) + 1);
                const left = pad + seg.startCol * (cellSizePx.w + gap);

                // Check if there are multiple events on this day
                const multipleEventsOnDay = (eventsPerDay.get(dayIndex) || 0) >= 2;

                // Use compact spacing for multiple events on the same day
                const currentLaneHeight = multipleEventsOnDay ? compactLaneHeight : laneHeight;
                const top =
                  pad +
                  row * (cellSizePx.h + gap) +
                  labelOffset +
                  lane * currentLaneHeight;
                const span = seg.endCol - seg.startCol;
                const width = span * cellSizePx.w + (span - 1) * gap;
                const key = `${seg.ev.id}:${row}:${seg.startCol}-${seg.endCol}:${lane}`;
                const bg = seg.ev.calendarId
                  ? calendarColors[seg.ev.calendarId]
                  : undefined;

                // Calculate dynamic maximum height based on available cell space
                const cellBoundaryLimit = cellSizePx.h - (labelOffset + lane * currentLaneHeight) - 15;
                const textLineHeight = 12; // 12px line height

                let maxHeight;
                if (multipleEventsOnDay) {
                  // For compact spacing, use full lane height for better text fit
                  maxHeight = currentLaneHeight;
                } else {
                  // For normal spacing, use cell boundary calculation
                  const maxPossibleLines = Math.max(1, Math.floor(Math.max(0, cellBoundaryLimit) / textLineHeight));
                  // Cap at reasonable maximum to prevent excessive wrapping (4-5 lines max)
                  const maxReasonableLines = Math.min(maxPossibleLines, 5);
                  const maxTextHeight = maxReasonableLines * textLineHeight;
                  maxHeight = Math.max(12, Math.min(Math.max(0, cellBoundaryLimit), maxTextHeight));
                }

                bars.push(
                  <div
                    key={key}
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width,
                    }}
                    className="px-1 pointer-events-auto cursor-pointer"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredEvent(seg.ev.summary);
                      // Calculate tooltip position to stay within window bounds
                      const tooltipWidth = 300; // Approximate max width
                      const tooltipHeight = 40; // Approximate height
                      const margin = 8;

                      let x = rect.left + rect.width / 2;
                      let y = rect.top - margin;

                      // Adjust horizontal position if tooltip would go off-screen
                      if (x - tooltipWidth / 2 < margin) {
                        x = tooltipWidth / 2 + margin;
                      } else if (x + tooltipWidth / 2 > window.innerWidth - margin) {
                        x = window.innerWidth - tooltipWidth / 2 - margin;
                      }

                      // Adjust vertical position if tooltip would go above viewport
                      if (y - tooltipHeight < margin) {
                        y = rect.bottom + margin;
                      }

                      setTooltipPosition({ x, y });
                    }}
                    onMouseLeave={() => {
                      setHoveredEvent(null);
                      setTooltipPosition(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget as HTMLDivElement
                      ).getBoundingClientRect();
                      setPopover({
                        event: seg.ev,
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 8,
                      });
                    }}
                  >
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
                        maxHeight: `${maxHeight}px`,
                      }}
                    >
                      {seg.ev.summary}
                    </div>
                  </div>
                );
              }
            }

            // Add "more" indicators for days with hidden events
            for (const [row, segs] of rowToSegs) {
              const processedDays = new Set<number>();
              for (const seg of segs) {
                const dayIndex = row * cols + seg.startCol;
                if (processedDays.has(dayIndex)) continue;
                processedDays.add(dayIndex);

                const totalEvents = eventsPerDay.get(dayIndex) || 0;
                const shownEvents = shownEventsPerDay.get(dayIndex) || 0;
                const hiddenEvents = totalEvents - shownEvents;

                if (hiddenEvents > 0) {
                  const left = pad + seg.startCol * (cellSizePx.w + gap);
                  const top = pad + row * (cellSizePx.h + gap) + labelOffset + (shownEvents * compactLaneHeight);
                  const width = cellSizePx.w;

                  bars.push(
                    <div
                      key={`more-${row}-${seg.startCol}`}
                      style={{
                        position: "absolute",
                        left,
                        top,
                        width,
                      }}
                      className="px-1 pointer-events-auto cursor-pointer"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        // Get all events for this day
                        const dayKey = days[dayIndex]?.key;
                        const allDayEvents = dayKey ? dateMap.get(dayKey) || [] : [];
                        const dayDate = days[dayIndex]?.date;
                        setHoveredDayEvents({ events: allDayEvents, date: dayDate });
                        // Position the popup
                        const popupWidth = 300;
                        const popupHeight = Math.min(200, allDayEvents.length * 30 + 40);
                        const margin = 8;

                        let x = rect.left + rect.width / 2;

                        // Adjust horizontal position
                        if (x - popupWidth / 2 < margin) {
                          x = popupWidth / 2 + margin;
                        } else if (x + popupWidth / 2 > window.innerWidth - margin) {
                          x = window.innerWidth - popupWidth / 2 - margin;
                        }

                        // Check if we can show above (preferred)
                        const spaceAbove = rect.top - margin;
                        const canShowAbove = spaceAbove >= popupHeight + margin;

                        // Check if we can show below
                        const spaceBelow = window.innerHeight - rect.bottom - margin;
                        const canShowBelow = spaceBelow >= popupHeight + margin;

                        let y: number;
                        let showAbove: boolean;

                        if (canShowAbove) {
                          // Show above (preferred)
                          y = rect.top - margin;
                          showAbove = true;
                        } else if (canShowBelow) {
                          // Show below
                          y = rect.bottom + margin;
                          showAbove = false;
                        } else {
                          // Neither fits perfectly, choose the one with more space
                          if (spaceAbove >= spaceBelow) {
                            // Show above even if cropped
                            y = rect.top - margin;
                            showAbove = true;
                          } else {
                            // Show below even if cropped
                            y = rect.bottom + margin;
                            showAbove = false;
                          }
                        }

                        setPopupPosition({ x, y, showAbove });
                      }}
                      onMouseLeave={() => {
                        setHoveredDayEvents(null);
                        setPopupPosition(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDayClick?.(days[dayIndex]?.key);
                      }}
                    >
                      <div
                        className="rounded-sm px-1 text-[9px] leading-[10px] text-white/80 text-center"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.6)",
                          lineHeight: '10px',
                          maxHeight: '12px',
                        }}
                      >
                        +{hiddenEvents} more
                      </div>
                    </div>
                  );
                }
              }
            }

            return bars;
          }, [
            events,
            dayIndexByKey,
            gridDims.cols,
            cellSizePx,
            calendarColors,
          ])}
        </div>
      </div>
      <EventPopover
        event={popover.event}
        x={popover.x}
        y={popover.y}
        calendarColors={calendarColors}
        calendarNames={calendarNames}
        calendarAccounts={calendarAccounts}
        writableCalendars={writableCalendars}
        writableAccountsWithCalendars={writableAccountsWithCalendars}
        onClose={() => setPopover({ event: null, x: 0, y: 0 })}
        onHideEvent={onHideEvent}
        onDeleteEvent={onDeleteEvent}
        onUpdateEvent={onUpdateEvent}
      />

      {/* Custom tooltip for event hover */}
      {hoveredEvent && tooltipPosition && (
        <div
          className="fixed z-50 pointer-events-none bg-black text-white text-xs px-2 py-1 rounded shadow-lg max-w-sm break-words"
          style={{
            top: tooltipPosition.y,
            left: tooltipPosition.x,
            transform: "translateX(-50%) translateY(-100%)",
            whiteSpace: "normal",
            wordWrap: "break-word",
          }}
        >
          {hoveredEvent}
        </div>
      )}

      {/* Popup for all events on a day when hovering "+X more" */}
      {hoveredDayEvents && popupPosition && (
        <div
          className="fixed z-50 pointer-events-none bg-card border rounded-md shadow-lg max-w-sm"
          style={{
            top: popupPosition.y,
            left: popupPosition.x,
            transform: popupPosition.showAbove
              ? "translateX(-50%) translateY(-100%)"
              : "translateX(-50%) translateY(0%)",
          }}
        >
          <div className="p-3">
            <div className="text-sm font-medium mb-2">
              {hoveredDayEvents.date.toLocaleDateString('en-GB', {
                weekday: 'short'
              })} {hoveredDayEvents.date.getDate()} {hoveredDayEvents.date.toLocaleDateString('en-GB', {
                month: 'short'
              })} - All Events
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {hoveredDayEvents.events.map((event: AllDayEvent, index: number) => (
                <div key={event.id} className="flex items-start gap-2 text-xs">
                  <div
                    className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0"
                    style={{
                      backgroundColor: calendarColors[event.calendarId || ""] || "#3174ad",
                    }}
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
      )}

      {!signedIn && (
        <div className="fixed inset-0 flex items-center justify-center bg-background/70">
          <div className="w-[400px] max-w-[80vw] rounded-md border bg-card p-5 md:p-12 text-center shadow-sm pointer-events-auto">
            <div className="text-lg font-medium mb-1">Big Year</div>
            <div className="text-sm text-muted-foreground mb-4">
              A calendar for all-day events.
            </div>
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => {
                  const callbackUrl =
                    typeof window !== "undefined" ? window.location.href : "/";
                  signIn("google", { callbackUrl });
                }}
              >
                Sign in with Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const callbackUrl =
                    typeof window !== "undefined" ? window.location.href : "/";
                  signIn("azure-ad", { callbackUrl });
                }}
              >
                Sign in with Microsoft
              </Button>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <span>•</span>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
