import { describe, it, expect } from 'vitest';
import { round2, formatCurrency, calcDelta } from '../formatters';

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(1.555)).toBe(1.56);
  });

  it('handles integers', () => {
    expect(round2(10)).toBe(10);
    expect(round2(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(round2(-1.555)).toBe(-1.55);
    // round2(-0.001) returns -0 (IEEE 754 negative zero) — Math.round
    // preserves the sign bit. Use toEqual for loose comparison.
    expect(round2(-0.001)).toEqual(-0);
    // Note: Math.round(-234.5) === -234 (rounds toward +infinity for .5),
    // so round2(-2.345) === -2.34, not -2.35. This is correct JS behavior.
    expect(round2(-2.345)).toBe(-2.34);
    expect(round2(-9.99)).toBe(-9.99);
  });

  it('handles large values', () => {
    expect(round2(999999.999)).toBe(1000000);
    expect(round2(123456.785)).toBe(123456.79);
  });
});

describe('formatCurrency', () => {
  it('formats positive values as R$', () => {
    expect(formatCurrency(1000)).toBe('R$ 1.000,00');
    expect(formatCurrency(0.5)).toBe('R$ 0,50');
    expect(formatCurrency(1234567.89)).toBe('R$ 1.234.567,89');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('R$ 0,00');
  });

  it('formats negative values with dash prefix', () => {
    expect(formatCurrency(-500)).toBe('-R$ 500,00');
    expect(formatCurrency(-1234.56)).toBe('-R$ 1.234,56');
  });

  it('formats small decimal values', () => {
    expect(formatCurrency(0.01)).toBe('R$ 0,01');
    expect(formatCurrency(-0.01)).toBe('-R$ 0,01');
  });
});

describe('calcDelta', () => {
  it('calculates positive delta', () => {
    const result = calcDelta(150, 100);
    expect(result.pct).toBe('50.0');
    expect(result.isUp).toBe(true);
    expect(result.isZero).toBe(false);
  });

  it('calculates negative delta', () => {
    const result = calcDelta(50, 100);
    expect(result.pct).toBe('50.0');
    expect(result.isUp).toBe(false);
    expect(result.isZero).toBe(false);
  });

  it('handles zero previous (no division by zero)', () => {
    const result = calcDelta(100, 0);
    expect(result.pct).toBe('0.0');
    expect(result.isUp).toBe(true);
    expect(result.isZero).toBe(false);
  });

  it('handles both zero', () => {
    const result = calcDelta(0, 0);
    expect(result.pct).toBe('0.0');
    expect(result.isZero).toBe(true);
  });

  it('handles equal values (no change)', () => {
    const result = calcDelta(100, 100);
    expect(result.pct).toBe('0.0');
    expect(result.isZero).toBe(true);
  });

  it('handles negative previous value', () => {
    const result = calcDelta(-50, -100);
    expect(result.pct).toBe('50.0');
    expect(result.isUp).toBe(true);
    expect(result.isZero).toBe(false);
  });

  it('handles crossing zero (negative to positive)', () => {
    const result = calcDelta(50, -50);
    expect(result.pct).toBe('200.0');
    expect(result.isUp).toBe(true);
    expect(result.isZero).toBe(false);
  });
});
