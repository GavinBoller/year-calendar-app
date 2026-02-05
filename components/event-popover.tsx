"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Plus, Calendar as CalendarIcon, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { AllDayEvent, CalendarListItem } from "@/types/calendar";
import { LoadingState } from "./loading-state";

interface EventPopoverProps {
  event: AllDayEvent | null;
  x: number;
  y: number;
  calendarColors: Record<string, string>;
  calendarNames: Record<string, string>;
  calendarAccounts: Record<string, string>;
  writableCalendars: CalendarListItem[];
  writableAccountsWithCalendars: Array<{
    accountId: string;
    email: string;
    list: CalendarListItem[];
  }>;
  onClose: () => void;
  onHideEvent?: (id: string) => void;
  onDeleteEvent?: (id: string) => Promise<void> | void;
  onUpdateEvent?: (event: {
    id: string;
    title: string;
    calendarId: string;
    startDate: string;
    endDate?: string;
  }) => Promise<void> | void;
}

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

export function EventPopover({
  event,
  x,
  y,
  calendarColors,
  calendarNames,
  calendarAccounts,
  writableCalendars,
  writableAccountsWithCalendars,
  onClose,
  onHideEvent,
  onDeleteEvent,
  onUpdateEvent,
}: EventPopoverProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCalendarId, setEditCalendarId] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editHasEndDate, setEditHasEndDate] = useState(false);
  const [editEndDate, setEditEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editStartDateInputRef = useRef<HTMLInputElement>(null);
  const editEndDateInputRef = useRef<HTMLInputElement>(null);

  // Initialize edit state when popover opens
  useEffect(() => {
    if (event && !isEditing) {
      setEditTitle(event.summary);
      setEditCalendarId(event.calendarId || "");
      setEditStartDate(event.startDate);
      // Check if event has an end date (endDate is exclusive, so if it's different from startDate + 1 day, it's a multi-day event)
      const start = new Date(event.startDate + "T00:00:00Z");
      const end = new Date(event.endDate + "T00:00:00Z");
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
  }, [event, isEditing]);

  if (!event) return null;

  return (
    <>
      {isEditing && (
        <>
          <div
            className="fixed inset-0 bg-background/60 z-40"
            onClick={() => {
              if (!isSubmitting) {
                setIsEditing(false);
              }
            }}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-label="Edit event"
          >
            <div
              ref={popoverRef}
              className="rounded-md border bg-card shadow-lg pointer-events-auto w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div className="font-semibold">Edit event</div>
                <button
                  className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 pt-2 pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </div>
                  <input
                    className="flex-1 border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                    placeholder="Event title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div className="flex items-center">
                      <input
                        ref={editStartDateInputRef}
                        type="date"
                        className="border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 w-24 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                        value={editStartDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditStartDate(v);
                          if (
                            editHasEndDate &&
                            editEndDate &&
                            v &&
                            editEndDate < v
                          ) {
                            setEditEndDate(v);
                          }
                        }}
                        onClick={(e) => {
                          e.currentTarget.showPicker?.();
                          e.currentTarget.focus();
                        }}
                        disabled={isSubmitting}
                      />
                      {editHasEndDate && (
                        <>
                          <span className="text-muted-foreground">–</span>
                          <input
                            ref={editEndDateInputRef}
                            type="date"
                            className="border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 ml-2 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                            value={editEndDate}
                            min={editStartDate || undefined}
                            onChange={(e) => setEditEndDate(e.target.value)}
                            onClick={(e) => {
                              e.currentTarget.showPicker?.();
                              e.currentTarget.focus();
                            }}
                            disabled={isSubmitting}
                          />
                        </>
                      )}
                    </div>
                    {editHasEndDate ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditHasEndDate(false);
                          setEditEndDate("");
                        }}
                        disabled={isSubmitting}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditHasEndDate(true);
                          if (!editEndDate) setEditEndDate(editStartDate);
                        }}
                        disabled={isSubmitting}
                      >
                        Add end date
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {editCalendarId && calendarColors[editCalendarId] ? (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: calendarColors[editCalendarId],
                        }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Select
                      value={editCalendarId}
                      onValueChange={setEditCalendarId}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="w-full border-0 bg-transparent px-0 py-1 h-auto shadow-none focus:ring-0 justify-start gap-1">
                        <SelectValue placeholder="Select a calendar">
                          {editCalendarId && calendarNames[editCalendarId]
                            ? calendarNames[editCalendarId]
                            : "Select a calendar"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {writableAccountsWithCalendars.length > 0
                          ? writableAccountsWithCalendars.map(
                              ({ accountId, email, list }) => (
                                <SelectGroup key={accountId || email}>
                                  <SelectLabel>
                                    {email && email.length
                                      ? email
                                      : accountId || "Account"}
                                  </SelectLabel>
                                  {list.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.summary}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            )
                          : writableCalendars.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {(c.accountEmail
                                  ? `${c.accountEmail} — `
                                  : "") + c.summary}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!onUpdateEvent) return;
                    if (!editTitle.trim()) {
                      alert("Title is required");
                      return;
                    }
                    if (!editCalendarId) {
                      alert("Calendar is required");
                      return;
                    }
                    if (
                      editHasEndDate &&
                      editEndDate &&
                      editEndDate < editStartDate
                    ) {
                      alert("End date must be on/after start date");
                      return;
                    }
                    try {
                      setIsSubmitting(true);
                      await onUpdateEvent({
                        id: event.id,
                        title: editTitle.trim(),
                        calendarId: editCalendarId,
                        startDate: editStartDate,
                        endDate: editHasEndDate ? editEndDate : undefined,
                      });
                      setIsEditing(false);
                      onClose();
                    } catch (err) {
                      alert("Failed to update event");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting || !editTitle.trim()}
                >
                  {isSubmitting ? <LoadingState size="sm" /> : null}
                  {isSubmitting ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {!isEditing && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-80 max-w-[90vw] rounded-md border bg-card shadow-lg"
          style={{
            top: y,
            left: x,
            transform: "translateX(-50%)",
          }}
          role="dialog"
          aria-label="Event details"
        >
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="font-medium truncate flex-1">
              {event.summary}
            </div>
            <div className="flex items-center gap-1">
              <div className="relative" ref={menuRef}>
                <button
                  className="text-muted-foreground hover:text-foreground flex-shrink-0 p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border rounded-md shadow-lg z-50 py-1">
                    {onUpdateEvent && writableCalendars.length > 0 && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditing(true);
                          setMenuOpen(false);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onHideEvent) {
                          onHideEvent(event.id);
                        }
                        onClose();
                        setMenuOpen(false);
                      }}
                    >
                      Hide event
                    </button>
                    {onDeleteEvent && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground transition"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok =
                            typeof window !== "undefined"
                              ? window.confirm("Delete this event?")
                              : true;
                          if (!ok) return;
                          // Clear popover immediately after confirmation
                          onClose();
                          setMenuOpen(false);
                          try {
                            await onDeleteEvent(event.id);
                          } catch {
                            // Error handling is done in the parent component
                          }
                        }}
                      >
                        Delete event
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                className="text-muted-foreground hover:text-foreground flex-shrink-0 p-1"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="px-3 text-sm text-muted-foreground flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  (event.calendarId &&
                    calendarColors[event.calendarId]) ||
                  "hsl(var(--secondary))",
              }}
              aria-hidden="true"
            />
            <span className="truncate">
              {(event.calendarId &&
                calendarNames[event.calendarId]) ||
                "Calendar"}
              {event.calendarId &&
                calendarAccounts &&
                calendarAccounts[event.calendarId] && (
                  <span className="ml-1 text-muted-foreground">
                    ({calendarAccounts[event.calendarId]})
                  </span>
                )}
            </span>
          </div>
          <div className="px-3 pb-3 mt-1.5 text-sm text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="h-2.5 w-2.5" aria-hidden="true" />
            <span>
              {formatDisplayRange(
                event.startDate,
                event.endDate
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );
}