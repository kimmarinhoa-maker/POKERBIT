import { describe, it, expect } from 'vitest';
import { round2, formatBRL, fmtDateTime } from '../formatters';

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

describe('formatBRL', () => {
  it('formats positive values as R$', () => {
    expect(formatBRL(1000)).toMatch(/1\.000,00/);
    expect(formatBRL(0.5)).toMatch(/0,50/);
  });

  it('formats zero', () => {
    expect(formatBRL(0)).toMatch(/0,00/);
  });

  it('formats negative values', () => {
    expect(formatBRL(-500)).toMatch(/500,00/);
  });
});

describe('fmtDateTime', () => {
  it('formats ISO datetime to dd/mm HH:mm', () => {
    const result = fmtDateTime('2026-02-15T14:30:00Z');
    // Result depends on locale/timezone but should contain day/month and hour:minute
    expect(result).toMatch(/\d{2}\/\d{2}/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});
