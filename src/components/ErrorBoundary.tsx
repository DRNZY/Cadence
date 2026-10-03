import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown instead of the default panel when something below throws. */
  label?: string;
  /**
   * Whether to offer a reload. The root boundary wants it; a panel boundary does
   * not, because reloading the page to recover a widget is a worse answer than
   * carrying on without it.
   */
  offerReload?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Keeps one failing subtree from taking the window down with it.
 *
 * Without a boundary anywhere below the root, an exception thrown while rendering
 * a panel unmounts the entire tree, which includes the transport controls. The
 * player then cannot be paused from the UI, and the only way out is to kill and
 * relaunch the process.
 *
 * Wrapping each panel means a failure costs you that panel and nothing else:
 * playback keeps running and the rest of the interface stays live.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error(
      `[Cadence] ${this.props.label ?? "component"} crashed:`,
      error,
      info.componentStack
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.label) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <div className="max-w-xs text-center">
            <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
              {this.props.label} unavailable
            </p>
            <p className="mt-2 text-[11px] font-mono text-neutral-600">
              {this.state.error?.message || "Unknown error"}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0b10] p-8">
        <div className="max-w-2xl w-full">
          <h1 className="text-lg font-mono text-red-400 mb-1">Cadence hit an error</h1>
          <p className="text-xs font-mono text-neutral-500 mb-4">
            Playback is unaffected. Reloading rebuilds the interface.
          </p>
          <pre className="text-[11px] font-mono whitespace-pre-wrap text-neutral-300 bg-black/60 border border-white/10 rounded-xl p-4 max-h-[40vh] overflow-auto">
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          {this.props.offerReload && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 font-mono text-xs"
            >
              Reload Cadence
            </button>
          )}
        </div>
      </div>
    );
  }
}