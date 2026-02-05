"use client";

// Calendar wrapper with Phase 2 UX improvements: view switching, dark mode, mobile gestures, date range selection
import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "./error-boundary";
import { LoadingState, CalendarSkeleton } from "./loading-state";
import { YearCalendar } from "./year-calendar";
import { ViewControls, CalendarView } from "./view-controls";
import { ThemeProvider, useTheme } from "./theme-provider";
import { MobileGestures } from "./mobile-gestures";
import { AllDayEvent, CalendarListItem } from "@/types/calendar";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, differenceInDays } from "date-fns";

interface DateRange {
  from: Date;
  to: Date;
}

interface CalendarWrapperProps {
  year: number;
  events?: AllDayEvent[];
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

function CalendarContent(props: CalendarWrapperProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CalendarView>("year");
  const [currentYear, setCurrentYear] = useState(props.year);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const { theme, setTheme } = useTheme();

  // Generate days based on current view and date range
  const generateViewDays = (view: CalendarView, year: number, range: DateRange | null) => {
    const today = new Date();

    if (view === "custom" && range) {
      const days: Array<{ key: string; date: Date }> = [];
      const start = new Date(range.from);
      const end = new Date(range.to);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        days.push({
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          date
        });
      }
      return days;
    } else if (view === "day") {
      // Show just today
      const days: Array<{ key: string; date: Date }> = [];
      days.push({
        key: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        date: new Date(today)
      });
      return days;
    } else if (view === "week") {
      // Show current week
      const start = startOfWeek(today);
      const end = endOfWeek(today);
      const days: Array<{ key: string; date: Date }> = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        days.push({
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          date
        });
      }
      return days;
    } else if (view === "month") {
      // Show current month
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      const days: Array<{ key: string; date: Date }> = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        days.push({
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          date
        });
      }
      return days;
    } else {
      // Default to year view
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const days: Array<{ key: string; date: Date }> = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        days.push({
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          date
        });
      }
      return days;
    }
  };

  const [viewDays, setViewDays] = useState(() => generateViewDays("year", props.year, null));

  useEffect(() => {
    setViewDays(generateViewDays(currentView, currentYear, dateRange));
  }, [currentView, currentYear, dateRange]);

  useEffect(() => {
    // Simple loading simulation for view changes
    const loadView = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Small delay to show loading state on view changes
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load view');
      } finally {
        setIsLoading(false);
      }
    };

    loadView();
  }, [currentView, dateRange]); // Reload when view changes

  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view);
    if (view !== "custom") {
      setDateRange(null);
    }
  };

  const handleYearChange = (year: number) => {
    setCurrentYear(year);
  };

  const handleDateRangeChange = (range: DateRange | null) => {
    setDateRange(range);
  };

  const handleToggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Mobile gesture handlers
  const mobileGestureHandlers = {
    onSwipeLeft: () => {
      if (currentView === "year") {
        setCurrentYear(prev => prev + 1);
      }
    },
    onSwipeRight: () => {
      if (currentView === "year") {
        setCurrentYear(prev => prev - 1);
      }
    },
  };

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
    <div className="h-screen flex flex-col bg-background">
      <ViewControls
        currentView={currentView}
        currentYear={currentYear}
        dateRange={dateRange}
        isDarkMode={theme === "dark"}
        onViewChange={handleViewChange}
        onYearChange={handleYearChange}
        onDateRangeChange={handleDateRangeChange}
        onToggleDarkMode={handleToggleDarkMode}
      />

      <div className="flex-1 overflow-hidden">
        <MobileGestures handlers={mobileGestureHandlers} className="h-full">
          <YearCalendar
            {...props}
            year={currentYear}
            events={props.events || []}
            showDaysOfWeek={currentView === "custom" && viewDays.length <= 31}
            customDays={viewDays}
          />
        </MobileGestures>
      </div>
    </div>
  );
}

export function CalendarWrapper(props: CalendarWrapperProps) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="calendar-theme">
      <ErrorBoundary>
        <CalendarContent {...props} />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
