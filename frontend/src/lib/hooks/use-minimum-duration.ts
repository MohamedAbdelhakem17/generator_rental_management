'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a loading flag true for at least `minMs` once it becomes true, so a skeleton
 * doesn't flash for a fast response (PRD TASK-004 Section 15 UX Behavior).
 */
export function useMinimumDuration(isLoading: boolean, minMs = 300): boolean {
  const [shown, setShown] = useState(isLoading);
  const startedAt = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      startedAt.current = Date.now();
      setShown(true);
      return;
    }

    const elapsed = startedAt.current ? Date.now() - startedAt.current : minMs;
    const remaining = Math.max(minMs - elapsed, 0);

    const timer = setTimeout(() => setShown(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, minMs]);

  return shown;
}
