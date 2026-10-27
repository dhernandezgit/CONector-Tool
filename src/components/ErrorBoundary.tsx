import { Component, type ErrorInfo, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: unknown) {
    return { error: String((error as Error)?.message || error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CONector Tool crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <span className="eyebrow">CONector Tool</span>
          <h1>Algo ha ido mal</h1>
          <p>{this.state.error}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Recargar la aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
