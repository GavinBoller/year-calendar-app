"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function LoadingState({ className, size = "md", text }: LoadingStateProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div className={cn("flex items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center space-y-4">
        <div className={cn("animate-spin rounded-full border-2 border-primary border-t-transparent", sizeClasses[size])} />
        {text && (
          <p className="text-sm text-muted-foreground text-center">{text}</p>
        )}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-6 w-20 bg-muted rounded animate-pulse" />
      </div>

      {/* Calendar grid skeleton */}
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
        {Array.from({ length: 372 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-muted rounded animate-pulse"
            style={{ animationDelay: `${i * 10}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function EventSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-2 p-2">
          <div className="w-2 h-2 bg-muted rounded-full animate-pulse" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-2 bg-muted rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}