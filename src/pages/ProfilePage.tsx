import { useAuth } from "../auth/auth";
import { useState, useEffect } from "react";

export default function ProfilePage() {
  const { state, logout } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("biot_profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      setName(parsed.name || "");
      setEmail(parsed.email || "");
    }
  }, []);

  const save = () => {
    localStorage.setItem("biot_profile", JSON.stringify({ name, email }));
    alert("Profile saved");
  };

  return (
    <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient max-w-xl space-y-3">
      <h2 className="text-2xl font-semibold">Profile</h2>
      <p className="text-sm text-slate-400">User ID: {state.userId ?? ""}</p>
      <label className="block text-sm">Name
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full glass rounded-lg px-3 py-2 border border-white/5 focus:border-blue-500 outline-none" />
      </label>
      <label className="block text-sm">Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full glass rounded-lg px-3 py-2 border border-white/5 focus:border-blue-500 outline-none" />
      </label>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow-glow">Save</button>
        <button onClick={logout} className="px-4 py-2 rounded-xl bg-slate-200 text-slate-900 border border-slate-300">Logout</button>
      </div>
    </div>
  );
}
