"use client";

import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "./error-boundary";
import { LoadingState, CalendarSkeleton } from "./loading-state";
import { YearCalendar } from "./year-calendar";
import { AllDayEvent, CalendarListItem } from "@/types/calendar";

interface CalendarWrapperProps {
  year: number;
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
}

export function CalendarWrapper(props: CalendarWrapperProps) {
  const [events, setEvents] = useState<AllDayEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading events - replace with actual data fetching
    const loadEvents = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // For now, we'll start with empty events
        // In a real app, this would fetch from your API
        setEvents([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [props.year]); // Reload when year changes

  if (isLoading) {
    return <CalendarSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-lg font-semibold text-destructive">Failed to load calendar</div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <YearCalendar
        {...props}
        events={events}
      />
    </ErrorBoundary>
  );
}