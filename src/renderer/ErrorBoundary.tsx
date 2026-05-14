import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = `${error.stack ?? ""}\n\nComponent stack:${info.componentStack ?? ""}`;
    void window.shotTranslate?.reportRendererError({
      message: error.message,
      stack
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <p className="eyebrow">Something went wrong</p>
          <h2>The window crashed.</h2>
          <p className="error-boundary-message">{this.state.error.message}</p>
          <p className="error-boundary-help">
            The error has been logged. You can reload this window to try again.
          </p>
          <button className="primary-button" onClick={this.handleReload}>
            Reload window
          </button>
        </div>
      </div>
    );
  }
}
