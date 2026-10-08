import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class MeetingErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Meeting UI failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="meeting-failure" role="alert">
          <h1>Meeting could not start</h1>
          <p>{this.state.error.message}</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload meeting</button>
        </main>
      );
    }
    return this.props.children;
  }
}
