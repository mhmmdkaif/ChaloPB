import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GoogleMapsProvider } from "./context/GoogleMapsContext.jsx";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary message="A critical error occurred. Please refresh the page.">
      <AuthProvider>
        <ToastProvider>
          <GoogleMapsProvider>
            <App />
          </GoogleMapsProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
