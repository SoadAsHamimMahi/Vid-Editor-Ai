import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

window.addEventListener('error', (event) => {
  console.error('[Global Window Error]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary Caught]', error);
    console.error('[RootErrorBoundary Stack]', errorInfo.componentStack);
    this.setState({ componentStack: errorInfo.componentStack || null });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: '#0b0f19',
          color: '#f87171',
          padding: '40px',
          fontFamily: 'monospace',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}>
          <h1 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '16px' }}>
            ⚠️ CineFlow Studio Encountered an Error
          </h1>
          <p style={{ color: '#e2e8f0', marginBottom: '16px', fontSize: '14px' }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          {this.state.componentStack && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#fbbf24', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                Component Stack:
              </div>
              <pre style={{
                background: '#181820',
                padding: '12px',
                borderRadius: '6px',
                color: '#fde68a',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                border: '1px solid #78350f'
              }}>
                {this.state.componentStack}
              </pre>
            </div>
          )}
          <pre style={{
            background: '#1e1e24',
            padding: '16px',
            borderRadius: '8px',
            color: '#94a3b8',
            fontSize: '12px',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Clear State, Reset to Home & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
