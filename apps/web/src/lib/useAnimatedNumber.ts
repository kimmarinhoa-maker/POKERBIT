'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 → target over `duration` ms.
 * Returns the interpolated value as a formatted string (same format as input).
 * Only animates on first mount — subsequent changes snap immediately.
 */
export function useAnimatedNumber(
  formatted: string,
  duration = 600,
): string {
  const hasAnimated = useRef(false);
  const rafRef = useRef<number>(0);
  const [display, setDisplay] = useState(formatted);

  useEffect(() => {
    // Only animate the first render
    if (hasAnimated.current) {
      setDisplay(formatted);
      return;
    }

    // Try to extract a numeric value from the formatted string
    // Handles: "R$ 1.234,56", "1.234", "56%", "12", "-R$ 500,00"
    const cleaned = formatted
      .replace(/[R$\s%]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const target = parseFloat(cleaned);

    if (isNaN(target) || target === 0) {
      setDisplay(formatted);
      hasAnimated.current = true;
      return;
    }

    const isNegative = target < 0;
    const absTarget = Math.abs(target);

    // Determine decimal places from the formatted string
    const commaIdx = formatted.indexOf(',');
    const decimals = commaIdx >= 0 ? formatted.length - commaIdx - 1 : 0;

    // Detect prefix and suffix
    const prefix = formatted.match(/^[^\d-]*/)?.[0] || '';
    const negSign = isNegative ? '-' : '';
    const suffix = formatted.match(/[^\d,.\s]*$/)?.[0] || '';

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = absTarget * eased;

      if (progress < 1) {
        // Format with same pattern as original
        const val = current.toFixed(decimals);
        const parts = val.split('.');
        // Add thousand separators (Brazilian format)
        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const decPart = parts[1] ? ',' + parts[1] : '';
        setDisplay(`${negSign}${prefix}${intPart}${decPart}${suffix}`.trim());
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(formatted);
        hasAnimated.current = true;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [formatted, duration]);

  return display;
}
