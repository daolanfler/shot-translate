import { Component, type ErrorInfo, type ReactNode } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
      <div className="grid h-full place-items-center bg-background p-6">
        <div className="flex w-full max-w-md flex-col gap-4">
          <Alert variant="destructive">
            <IconAlertTriangle className="size-4" />
            <AlertTitle>The window crashed.</AlertTitle>
            <AlertDescription className="font-mono text-xs">
              {this.state.error.message}
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            The error has been logged. You can reload this window to try again.
          </p>
          <Button onClick={this.handleReload}>
            <IconRefresh className="size-4" />
            Reload window
          </Button>
        </div>
      </div>
    );
  }
}
