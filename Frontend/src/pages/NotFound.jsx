import { useNavigate } from "react-router-dom";

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter', sans-serif",
            background: "#f8fafc", color: "#334155", textAlign: "center", padding: "2rem",
        }}>
            <div style={{ fontSize: "6rem", fontWeight: 800, color: "#e2e8f0", lineHeight: 1 }}>404</div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "1rem 0 0.5rem" }}>Page not found</h1>
            <p style={{ color: "#64748b", maxWidth: 360 }}>
                The page you&#39;re looking for doesn&#39;t exist or has been moved.
            </p>
            <button
                onClick={() => navigate("/login")}
                style={{
                    marginTop: "1.5rem", padding: "0.6rem 1.8rem", border: "none",
                    borderRadius: "0.5rem", background: "#1d4ed8", color: "#fff",
                    fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                }}
            >
                Go to Login
            </button>
        </div>
    );
}
