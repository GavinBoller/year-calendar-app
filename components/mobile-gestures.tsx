"use client";

import React, { useEffect, useRef } from "react";

interface TouchGestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinch?: (scale: number) => void;
}

interface MobileGesturesProps {
  children: React.ReactNode;
  handlers: TouchGestureHandlers;
  className?: string;
}

export function MobileGestures({ children, handlers, className }: MobileGesturesProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single touch - track for swipe
        const touch = e.touches[0];
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      } else if (e.touches.length === 2) {
        // Two touches - track for pinch
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        pinchStartRef.current = { distance, scale: 1 };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current && handlers.onPinch) {
        // Handle pinch gesture
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scale = distance / pinchStartRef.current.distance;
        handlers.onPinch(scale);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartRef.current && e.changedTouches.length === 1) {
        // Check for swipe gesture
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;
        const minSwipeDistance = 50;
        const maxSwipeTime = 300;

        if (deltaTime < maxSwipeTime && Math.abs(deltaX) > minSwipeDistance) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (deltaX > 0) {
              handlers.onSwipeRight?.();
            } else {
              handlers.onSwipeLeft?.();
            }
          } else {
            // Vertical swipe
            if (deltaY > 0) {
              handlers.onSwipeDown?.();
            } else {
              handlers.onSwipeUp?.();
            }
          }
        }
      }

      touchStartRef.current = null;
      pinchStartRef.current = null;
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handlers]);

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
}

// Hook for using mobile gestures
export function useMobileGestures(handlers: TouchGestureHandlers) {
  const gestureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = gestureRef.current;
    if (!element) return;

    let touchStart: { x: number; y: number; time: number } | null = null;
    let pinchStart: { distance: number; scale: number } | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStart = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      } else if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        pinchStart = { distance, scale: 1 };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart && handlers.onPinch) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scale = distance / pinchStart.distance;
        handlers.onPinch(scale);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStart && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const deltaTime = Date.now() - touchStart.time;
        const minSwipeDistance = 50;
        const maxSwipeTime = 300;

        if (deltaTime < maxSwipeTime && Math.abs(deltaX) > minSwipeDistance) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
              handlers.onSwipeRight?.();
            } else {
              handlers.onSwipeLeft?.();
            }
          } else {
            if (deltaY > 0) {
              handlers.onSwipeDown?.();
            } else {
              handlers.onSwipeUp?.();
            }
          }
        }
      }

      touchStart = null;
      pinchStart = null;
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handlers]);

  return gestureRef;
}