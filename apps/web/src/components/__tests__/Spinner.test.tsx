import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner from '../Spinner';

describe('Spinner', () => {
  it('renders with default props', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Carregando');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Spinner size="xs" />);
    expect(screen.getByRole('status').className).toContain('h-3 w-3');

    rerender(<Spinner size="sm" />);
    expect(screen.getByRole('status').className).toContain('h-4 w-4');

    rerender(<Spinner size="md" />);
    expect(screen.getByRole('status').className).toContain('h-6 w-6');

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole('status').className).toContain('h-8 w-8');

    rerender(<Spinner size="xl" />);
    expect(screen.getByRole('status').className).toContain('h-10 w-10');
  });

  it('applies variant classes', () => {
    const { rerender } = render(<Spinner variant="primary" />);
    expect(screen.getByRole('status').className).toContain('border-poker-500');

    rerender(<Spinner variant="white" />);
    expect(screen.getByRole('status').className).toContain('border-white/30');
  });

  it('applies custom className', () => {
    render(<Spinner className="mt-4" />);
    expect(screen.getByRole('status').className).toContain('mt-4');
  });

  it('always has animate-spin and rounded-full', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('rounded-full');
  });
});
