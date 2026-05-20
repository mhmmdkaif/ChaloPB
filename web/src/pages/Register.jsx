import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/api";
import { AuthContext } from "../context/AuthContext";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", { name, email, password });
      // Auto login after register
      const res = await api.post("/auth/login", { email, password });
      const token = res.data.token;
      const payload = JSON.parse(atob(token.split(".")[1]));
      login({ token, role: payload.role, id: payload.id });
      navigate("/user");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-gray-200">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">ChaloPB</h1>
          <p className="text-sm text-slate-500">Create your account</p>
        </div>

        {error && <p className="mb-4 text-sm text-red-600 text-center">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm text-slate-600 mb-1">Name</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-slate-600 mb-1">Email</label>
          <input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="mb-7">
          <label className="block text-sm text-slate-600 mb-1">Password</label>
          <input type="password" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition active:scale-95 disabled:opacity-50">
          {loading ? "Creating account..." : "Register"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
        </p>
      </form>
    </div>
  );
}
