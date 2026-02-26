'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  tabName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class TabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card text-center py-12">
          <p className="text-red-400 font-semibold mb-2">
            Erro ao carregar {this.props.tabName || 'esta aba'}
          </p>
          <p className="text-dark-400 text-sm mb-4">
            {this.state.error?.message || 'Erro desconhecido'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary text-sm px-4 py-2"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
