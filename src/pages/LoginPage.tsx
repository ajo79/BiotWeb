import { useState } from "react";
import { useAuth } from "../auth/auth";
import { motion } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const motionPreset = useMotionPreset();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(userId.trim(), password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-white text-slate-900 px-4">
      <motion.div {...motionPreset} className="glass border border-white/5 rounded-3xl p-8 w-full max-w-md shadow-ambient">
        <h1 className="text-3xl font-semibold mb-2">BIOT Console</h1>
        <p className="text-slate-400 mb-6">Sign in with your account to view telemetry.</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">Email or User ID
            <input value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full glass rounded-xl px-3 py-2 border border-white/5 focus:border-blue-500 outline-none" placeholder="name@company.com" />
          </label>
          <label className="block text-sm">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full glass rounded-xl px-3 py-2 border border-white/5 focus:border-blue-500 outline-none" />
          </label>
          {error && <div className="text-rose-600 text-sm">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-glow disabled:opacity-60">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-4">Factory login: CEAT / 1234</p>
      </motion.div>
    </div>
  );
}

