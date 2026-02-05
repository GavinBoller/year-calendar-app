"use client";

import React, { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Settings, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addWeeks, addMonths, addYears } from "date-fns";

export type CalendarView = "year" | "month" | "week" | "day" | "custom";

interface DateRange {
  from: Date;
  to: Date;
}

interface ViewControlsProps {
  currentView: CalendarView;
  currentPeriod: Date;
  dateRange: DateRange | null;
  isDarkMode: boolean;
  isLoading?: boolean;
  onViewChange: (view: CalendarView) => void;
  onPreviousPeriod: () => void;
  onNextPeriod: () => void;
  onDateRangeChange: (range: DateRange | null) => void;
  onToggleDarkMode: () => void;
}

export function ViewControls({
  currentView,
  currentPeriod,
  dateRange,
  isDarkMode,
  isLoading,
  onViewChange,
  onPreviousPeriod,
  onNextPeriod,
  onDateRangeChange,
  onToggleDarkMode,
}: ViewControlsProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const handleQuickRange = (range: "week" | "month" | "year") => {
    const today = new Date();
    let from: Date;
    let to: Date;

    switch (range) {
      case "week":
        from = startOfWeek(today);
        to = endOfWeek(today);
        break;
      case "month":
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case "year":
        from = startOfYear(today);
        to = endOfYear(today);
        break;
    }

    onDateRangeChange({ from, to });
    onViewChange("custom");
  };

  const handleCustomRange = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      onDateRangeChange({ from: range.from, to: range.to });
      onViewChange("custom");
      setIsDatePickerOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left side - Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreviousPeriod}
          disabled={currentView === "custom"}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {currentView === "custom" && dateRange
              ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
              : currentView === "year"
              ? currentPeriod.getFullYear()
              : currentView === "month"
              ? format(currentPeriod, "MMMM yyyy")
              : currentView === "week"
              ? `Week of ${format(startOfWeek(currentPeriod), "MMM d, yyyy")}`
              : currentView === "day"
              ? format(currentPeriod, "MMM d, yyyy")
              : currentPeriod.getFullYear()
            }
          </span>
          {isLoading && (
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onNextPeriod}
          disabled={currentView === "custom"}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Center - View Switcher */}
      <div className="flex items-center gap-2">
        <Select value={currentView} onValueChange={(value: CalendarView) => onViewChange(value)}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="year">Year</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {currentView === "custom" && (
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Select Dates
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background border shadow-lg" align="start">
              <CalendarComponent
                mode="range"
                selected={dateRange || undefined}
                onSelect={handleCustomRange}
                numberOfMonths={2}
                disabled={(date) => date < new Date("1900-01-01")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Right side - Quick actions and settings */}
      <div className="flex items-center gap-2">
        {/* Quick range buttons */}
        <div className="hidden sm:flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickRange("week")}
            className="text-xs"
          >
            This Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickRange("month")}
            className="text-xs"
          >
            This Month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickRange("year")}
            className="text-xs"
          >
            This Year
          </Button>
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDarkMode}
          className="w-9 h-9 p-0"
        >
          {isDarkMode ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}