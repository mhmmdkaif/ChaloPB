import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary caught]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            fontFamily: "Inter, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>[!]</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "#111" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#666", marginBottom: 24, maxWidth: 360 }}>
            {this.props.message || "An unexpected error occurred. Please refresh the page."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Refresh Page
          </button>
          {import.meta.env.DEV && (
            <details style={{ marginTop: 24, textAlign: "left", maxWidth: 600 }}>
              <summary style={{ cursor: "pointer", color: "#888", fontSize: 13 }}>
                Error details (dev only)
              </summary>
              <pre style={{ fontSize: 11, color: "#c00", marginTop: 8, whiteSpace: "pre-wrap" }}>
                {this.state.error?.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
