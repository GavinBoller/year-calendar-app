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
  isLoading?: boolean;
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
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CalendarView>("year");
  const [currentYear, setCurrentYear] = useState(props.year);
  const [currentPeriod, setCurrentPeriod] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const { theme, setTheme } = useTheme();

  // Use parent's loading state if provided, otherwise use internal view loading
  const isLoading = props.isLoading || isViewLoading;

  // Generate days based on current view and date range
  const generateViewDays = (view: CalendarView, period: Date, range: DateRange | null) => {
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
      // Show the selected day
      const days: Array<{ key: string; date: Date }> = [];
      days.push({
        key: `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}-${String(period.getDate()).padStart(2, '0')}`,
        date: new Date(period)
      });
      return days;
    } else if (view === "week") {
      // Show the selected week
      const start = startOfWeek(period);
      const end = endOfWeek(period);
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
      // Show the selected month
      const start = startOfMonth(period);
      const end = endOfMonth(period);
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
      const year = period.getFullYear();
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

  const [viewDays, setViewDays] = useState(() => generateViewDays("year", new Date(props.year, 0, 1), null));

  useEffect(() => {
    setViewDays(generateViewDays(currentView, currentPeriod, dateRange));
  }, [currentView, currentPeriod, dateRange]);

  useEffect(() => {
    // Simple loading simulation for view changes
    const loadView = async () => {
      try {
        setIsViewLoading(true);
        setError(null);

        // Small delay to show loading state on view changes
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load view');
      } finally {
        setIsViewLoading(false);
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

  const handlePreviousPeriod = () => {
    if (currentView === "year") {
      setCurrentYear(prev => prev - 1);
    } else if (currentView === "month") {
      setCurrentPeriod(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else if (currentView === "week") {
      setCurrentPeriod(prev => new Date(prev.getTime() - 7 * 24 * 60 * 60 * 1000));
    } else if (currentView === "day") {
      setCurrentPeriod(prev => new Date(prev.getTime() - 24 * 60 * 60 * 1000));
    }
  };

  const handleNextPeriod = () => {
    if (currentView === "year") {
      setCurrentYear(prev => prev + 1);
    } else if (currentView === "month") {
      setCurrentPeriod(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else if (currentView === "week") {
      setCurrentPeriod(prev => new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else if (currentView === "day") {
      setCurrentPeriod(prev => new Date(prev.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  // Mobile gesture handlers
  const mobileGestureHandlers = {
    onSwipeLeft: () => {
      handleNextPeriod();
    },
    onSwipeRight: () => {
      handlePreviousPeriod();
    },
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <ViewControls
        currentView={currentView}
        currentPeriod={currentPeriod}
        dateRange={dateRange}
        isDarkMode={theme === "dark"}
        isLoading={isLoading}
        onViewChange={handleViewChange}
        onPreviousPeriod={handlePreviousPeriod}
        onNextPeriod={handleNextPeriod}
        onDateRangeChange={handleDateRangeChange}
        onToggleDarkMode={handleToggleDarkMode}
      />

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <CalendarSkeleton />
        ) : error ? (
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
        ) : (
          <MobileGestures handlers={mobileGestureHandlers} className="h-full">
            <YearCalendar
              {...props}
              year={currentYear}
              currentYear={currentView === "year" ? currentYear : currentPeriod.getFullYear()}
              events={props.events || []}
              showDaysOfWeek={currentView === "custom" && viewDays.length <= 31}
              customDays={viewDays}
            />
          </MobileGestures>
        )}
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
