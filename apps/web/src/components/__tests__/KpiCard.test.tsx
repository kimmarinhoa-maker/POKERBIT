import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiCard from '../dashboard/KpiCard';

describe('KpiCard', () => {
  const baseProps = {
    label: 'Receita',
    value: 'R$ 10.000,00',
    accent: 'green' as const,
  };

  it('renders label and value', () => {
    render(<KpiCard {...baseProps} />);
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('R$ 10.000,00')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<KpiCard {...baseProps} subtitle="Semana 12" />);
    expect(screen.getByText('Semana 12')).toBeInTheDocument();
  });

  it('renders positive delta badge', () => {
    render(<KpiCard {...baseProps} delta={{ pct: '15.0', isUp: true, isZero: false }} />);
    expect(screen.getByText(/15\.0% vs sem\. anterior/)).toBeInTheDocument();
    expect(screen.getByText(/▲/)).toBeInTheDocument();
  });

  it('renders negative delta badge', () => {
    render(<KpiCard {...baseProps} delta={{ pct: '8.5', isUp: false, isZero: false }} />);
    expect(screen.getByText(/8\.5% vs sem\. anterior/)).toBeInTheDocument();
    expect(screen.getByText(/▼/)).toBeInTheDocument();
  });

  it('renders zero delta as "sem variacao"', () => {
    render(<KpiCard {...baseProps} delta={{ pct: '0.0', isUp: false, isZero: true }} />);
    expect(screen.getByText(/sem variacao/)).toBeInTheDocument();
  });

  it('does not render delta when not provided', () => {
    render(<KpiCard {...baseProps} />);
    expect(screen.queryByText(/vs sem\. anterior/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sem variacao/)).not.toBeInTheDocument();
  });

  it('renders breakdown items', () => {
    render(
      <KpiCard
        {...baseProps}
        breakdown={[
          { label: 'Rake', value: 'R$ 500,00', rawValue: 500 },
          { label: 'GGR', value: 'R$ 300,00', rawValue: 300 },
        ]}
      />,
    );
    expect(screen.getByText('Rake')).toBeInTheDocument();
    expect(screen.getByText('GGR')).toBeInTheDocument();
  });

  it('filters out breakdown items with rawValue 0', () => {
    render(
      <KpiCard
        {...baseProps}
        breakdown={[
          { label: 'Rake', value: 'R$ 500,00', rawValue: 500 },
          { label: 'Zerado', value: 'R$ 0,00', rawValue: 0 },
        ]}
      />,
    );
    expect(screen.getByText('Rake')).toBeInTheDocument();
    expect(screen.queryByText('Zerado')).not.toBeInTheDocument();
  });

  it('keeps breakdown items without rawValue regardless of value string', () => {
    render(<KpiCard {...baseProps} breakdown={[{ label: 'Custom', value: '3 jogadores' }]} />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('3 jogadores')).toBeInTheDocument();
  });
});
