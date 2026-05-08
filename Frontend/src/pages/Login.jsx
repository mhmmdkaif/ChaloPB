import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/api";
import { AuthContext } from "../context/AuthContext";
import { ToastContext } from "../context/ToastContext";
import { decodeJwtPayload } from "../utils/jwt";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const { showToast } = useContext(ToastContext) ?? {};
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      console.debug("[auth] login success");

      const token = res.data?.token;
      login({ token });

      const payload = decodeJwtPayload(token);
      const role = res.data?.role || payload?.role;
      if (role === "admin") navigate("/admin");
      else if (role === "driver") navigate("/driver");
      else navigate("/user");
    } catch (err) {
      console.error("Login error:", err);
      const msg = err.response?.data?.message || "Invalid credentials";
      showToast?.(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }

        @keyframes moveBus {
          0%   { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }

        @keyframes pingStop {
          0%, 100% { r: 4; opacity: 1; }
          50%       { r: 7; opacity: 0.4; }
        }

        .live-dot {
          animation: blink 2s ease-in-out infinite;
        }

        .bus-marker {
          offset-path: path('M 30 160 C 60 160 80 120 120 110 C 160 100 180 90 220 85 C 260 80 280 100 310 95');
          offset-distance: 0%;
          animation: moveBus 4s linear infinite;
        }

        .stop-ping  { animation: pingStop 2s ease-in-out infinite; }
        .stop-ping2 { animation: pingStop 2s ease-in-out infinite; animation-delay: 0.7s; }
        .stop-ping3 { animation: pingStop 2s ease-in-out infinite; animation-delay: 1.4s; }

        .login-input::placeholder { color: #bae6fd; }
        .login-input:focus {
          border-color: #1d6fa4 !important;
          background: #fff !important;
          box-shadow: 0 0 0 3px rgba(29,111,164,0.15) !important;
          outline: none;
        }

        .signin-btn:hover {
          background: #0f4f8c !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(21,101,168,0.45) !important;
        }
        .signin-btn:active { transform: scale(0.99); }

        @media (max-width: 768px) {
          .login-container { flex-direction: column !important; }
          .login-left,
          .login-right {
            width: 100% !important;
            min-height: auto !important;
          }
          .login-left { padding: 24px 20px !important; }
          .login-right { padding: 24px 20px !important; }
        }
      `}</style>

      <div className="login-container" style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ── LEFT BRANDING PANEL ── */}
        <div className="login-left" style={{
          width: "55%",
          position: "relative",
          background: "linear-gradient(145deg, #1d6fa4 0%, #1565a8 50%, #0f4f8c 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 44px",
          overflow: "hidden",
        }}>
          {/* Grid bg */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />

          {/* Decorative circles */}
          <div style={{
            position: "absolute", width: 300, height: 300, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)", top: -80, right: -60,
          }} />
          <div style={{
            position: "absolute", width: 160, height: 160, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)", bottom: -30, left: -30,
          }} />

          {/* Top: live tag + brand */}
          <div style={{ position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)",
              letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              <div className="live-dot" style={{
                width: 7, height: 7, borderRadius: "50%", background: "#7dd3fc",
              }} />
              Live tracking active
            </div>

            <h1 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 56, fontWeight: 800, color: "#fff",
              lineHeight: 0.9, letterSpacing: -2.5, margin: "14px 0 0",
            }}>
              Chalo<span style={{ color: "rgba(255,255,255,0.4)" }}>PB</span>
            </h1>
            <p style={{
              marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.6)",
              lineHeight: 1.6, maxWidth: 280, fontWeight: 300,
            }}>
              Punjab's real-time bus tracking platform for operators, drivers and commuters.
            </p>
          </div>

          {/* Transit map illustration */}
          <div style={{ position: "relative", flex: 1, marginTop: 28 }}>
            <svg
              viewBox="0 0 340 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: "100%", height: "100%" }}
            >
              {/* Background roads */}
              <path d="M 10 180 L 330 180" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 10 140 L 330 140" stroke="rgba(255,255,255,0.04)" strokeWidth="6" strokeLinecap="round" />

              {/* Dashed route */}
              <path
                d="M 30 160 C 60 160 80 120 120 110 C 160 100 180 90 220 85 C 260 80 280 100 310 95"
                stroke="rgba(255,255,255,0.15)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 4"
              />
              {/* Route highlight */}
              <path
                d="M 30 160 C 60 160 80 120 120 110 C 160 100 180 90 220 85 C 260 80 280 100 310 95"
                stroke="rgba(125,211,252,0.5)" strokeWidth="2" strokeLinecap="round"
              />

              {/* Stop 1 — Ludhiana */}
              <circle cx="30" cy="160" r="5" fill="#fff" />
              <circle className="stop-ping" cx="30" cy="160" r="4" fill="rgba(125,211,252,0.4)" />
              <text x="22" y="175" fontFamily="DM Sans, sans-serif" fontSize="8" fill="rgba(255,255,255,0.7)" textAnchor="middle">Ludhiana</text>

              {/* Stop 2 — Phagwara */}
              <circle cx="120" cy="110" r="5" fill="#fff" />
              <circle className="stop-ping2" cx="120" cy="110" r="4" fill="rgba(125,211,252,0.4)" />
              <text x="120" y="100" fontFamily="DM Sans, sans-serif" fontSize="8" fill="rgba(255,255,255,0.7)" textAnchor="middle">Phagwara</text>

              {/* Stop 3 — Jalandhar */}
              <circle cx="220" cy="85" r="5" fill="#fff" />
              <circle className="stop-ping3" cx="220" cy="85" r="4" fill="rgba(125,211,252,0.4)" />
              <text x="220" y="75" fontFamily="DM Sans, sans-serif" fontSize="8" fill="rgba(255,255,255,0.7)" textAnchor="middle">Jalandhar</text>

              {/* Stop 4 — Amritsar (destination) */}
              <circle cx="310" cy="95" r="6" fill="#7dd3fc" />
              <text x="310" y="82" fontFamily="DM Sans, sans-serif" fontSize="8" fill="rgba(255,255,255,0.9)" textAnchor="middle">Amritsar</text>

              {/* ETA badge */}
              <rect x="270" y="60" width="78" height="18" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
              <circle cx="279" cy="69" r="3" fill="#7dd3fc" />
              <text x="285" y="72" fontFamily="DM Sans, sans-serif" fontSize="7.5" fill="rgba(255,255,255,0.85)">ETA: 12 mins</text>

              {/* Animated bus */}
              <g className="bus-marker">
                <rect x="-12" y="-8" width="24" height="14" rx="3" fill="#1565a8" stroke="#7dd3fc" strokeWidth="1.2" />
                <rect x="-8" y="-5" width="5" height="5" rx="1" fill="rgba(125,211,252,0.6)" />
                <rect x="-1" y="-5" width="5" height="5" rx="1" fill="rgba(125,211,252,0.6)" />
                <rect x="6" y="-5" width="4" height="5" rx="1" fill="rgba(125,211,252,0.6)" />
                <circle cx="-6" cy="6" r="2.5" fill="#0f4f8c" stroke="#7dd3fc" strokeWidth="0.8" />
                <circle cx="6" cy="6" r="2.5" fill="#0f4f8c" stroke="#7dd3fc" strokeWidth="0.8" />
                <circle cx="12" cy="-1" r="1.5" fill="#fde68a" />
              </g>
            </svg>
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ── */}
        <div className="login-right" style={{
          width: "45%",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
        }}>
          <div style={{ width: "100%", maxWidth: 290 }}>

            {/* Logo mark */}
            <div style={{
              width: 40, height: 40, background: "#1d6fa4",
              borderRadius: 10, display: "flex", alignItems: "center",
              justifyContent: "center", marginBottom: 20,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 17h18M5 17V9a2 2 0 012-2h10a2 2 0 012 2v8M9 17v2m6-2v2M7 13h2m4 0h2"
                  stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </div>

            <h2 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 24, fontWeight: 800, color: "#1e3a5f",
              letterSpacing: -0.5, margin: 0,
            }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 13, color: "#93c5fd", marginTop: 4, marginBottom: 26, fontWeight: 400 }}>
              Sign in to ChaloPB
            </p>

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 600,
                  color: "#1d6fa4", marginBottom: 6,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  Email
                </label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: "100%", background: "#f0f9ff",
                    border: "1.5px solid #bae6fd", borderRadius: 10,
                    padding: "11px 14px", fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14, color: "#1e3a5f",
                    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{
                    fontSize: 11, fontWeight: 600, color: "#1d6fa4",
                    letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    Password
                  </label>
                  <a href="#" style={{ fontSize: 11, color: "#1d6fa4", fontWeight: 500, textDecoration: "none" }}>
                    Forgot password?
                  </a>
                </div>
                <input
                  type="password"
                  className="login-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: "100%", background: "#f0f9ff",
                    border: "1.5px solid #bae6fd", borderRadius: 10,
                    padding: "11px 14px", fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14, color: "#1e3a5f",
                    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="signin-btn"
                style={{
                  width: "100%", marginTop: 18,
                  background: "#1565a8", border: "none", borderRadius: 10,
                  padding: 13, fontFamily: "'Syne', sans-serif",
                  fontSize: 15, fontWeight: 700, color: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: -0.2,
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                  boxShadow: "0 4px 16px rgba(21,101,168,0.35)",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </form>

            <p style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: "#93c5fd" }}>
              New here?{" "}
              <Link to="/register" style={{ color: "#1565a8", fontWeight: 600, textDecoration: "none" }}>
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}