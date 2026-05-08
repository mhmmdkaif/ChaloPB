import { createContext, useState, useCallback, useRef } from "react";

export const ToastContext = createContext();

const TOAST_TTL_MS = 4000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ message, type });
    timeoutRef.current = setTimeout(() => {
      setToast(null);
      timeoutRef.current = null;
    }, TOAST_TTL_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="alert"
          className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-lg shadow-lg border text-sm font-medium
            ${toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" : ""}
            ${toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : ""}
            ${toast.type === "info" ? "bg-slate-50 border-slate-200 text-slate-800" : ""}`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
