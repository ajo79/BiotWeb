import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth";

type Role = "user" | "admin";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "biot_users_v1";

const loadUsers = (): User[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveUsers = (users: User[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
};

const makeId = () => {
  const anyCrypto = globalThis.crypto as Crypto | undefined;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

export default function MorePage() {
  const { state } = useAuth();
  const isAdmin = state.role === "admin" || state.userId === "Company_A";
  const [users, setUsers] = useState<User[]>(() => loadUsers());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "user" as Role, password: "", confirm: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: "", email: "", role: "user", password: "", confirm: "" });
    setError("");
    setNotice("");
  };

  const startEdit = (user: User) => {
    if (!isAdmin) {
      setError("Only admins can manage users.");
      return;
    }
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, role: user.role, password: "", confirm: "" });
    setError("");
    setNotice("");
  };

  const handleDelete = (user: User) => {
    if (!isAdmin) {
      setError("Only admins can manage users.");
      return;
    }
    if (!confirm(`Delete user ${user.email}?`)) return;
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    if (editingId === user.id) resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!isAdmin) {
      setError("Only admins can manage users.");
      return;
    }
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const role = form.role;
    if (!name) return setError("Name is required.");
    if (!email || !isValidEmail(email)) return setError("Valid email is required.");
    if (!role) return setError("Role is required.");

    const emailTaken = users.some((u) => u.email === email && u.id !== editingId);
    if (emailTaken) return setError("Email is already in use.");

    if (editingId) {
      const next = users.map((u) => {
        if (u.id !== editingId) return u;
        const updated: User = {
          ...u,
          name,
          email,
          role,
          updatedAt: Date.now(),
        };
        if (form.password) {
          if (form.password.length < 6) {
            setError("Password must be at least 6 characters.");
            return u;
          }
          if (form.password !== form.confirm) {
            setError("Passwords do not match.");
            return u;
          }
          updated.password = form.password;
        }
        return updated;
      });
      setUsers(next);
      setNotice("User updated.");
      return;
    }

    if (!form.password) return setError("Password is required.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    const now = Date.now();
    const user: User = {
      id: makeId(),
      name,
      email,
      role,
      password: form.password,
      createdAt: now,
      updatedAt: now,
    };
    setUsers((prev) => [user, ...prev]);
    setNotice("User created.");
    setForm({ name: "", email: "", role: "user", password: "", confirm: "" });
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr,1.2fr] gap-4">
        <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-slate-400">User management</p>
              <h2 className="text-xl font-semibold">{editingId ? "Edit User" : "Create User"}</h2>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Roles: <span className="font-semibold text-slate-700">user</span> can view data.{" "}
            <span className="font-semibold text-slate-700">admin</span> can create, edit, delete users and change passwords.
          </p>
          {isAdmin ? (
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm text-slate-500">
                  Name
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                    placeholder="Full name"
                  />
                </label>
                <label className="text-sm text-slate-500">
                  Email
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                    placeholder="name@company.com"
                  />
                </label>
                <label className="text-sm text-slate-500">
                  Role
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                  >
                    <option value="user">User (view only)</option>
                    <option value="admin">Admin (manage users)</option>
                  </select>
                </label>
                <label className="text-sm text-slate-500">
                  {editingId ? "New password (optional)" : "Password"}
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                    placeholder={editingId ? "Leave blank to keep current" : "Minimum 6 characters"}
                  />
                </label>
                <label className="text-sm text-slate-500">
                  {editingId ? "Confirm new password" : "Confirm password"}
                  <input
                    type="password"
                    value={form.confirm}
                    onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
                    placeholder="Retype password"
                  />
                </label>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}
              {notice && <p className="text-sm text-emerald-600">{notice}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">
                  {editingId ? "Save Changes" : "Create User"}
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              You have view-only access. Please contact an admin to manage users.
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-slate-400">Users</p>
              <h2 className="text-xl font-semibold">Active accounts</h2>
            </div>
            <span className="text-xs text-slate-500">{users.length} total</span>
          </div>
          <div className="overflow-auto max-h-[420px]">
            <table className="min-w-full text-sm">
              <thead className="text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-semibold text-slate-200">{u.name}</td>
                    <td className="px-3 py-2 text-slate-300">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === "admin" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-slate-50 text-slate-700 border border-slate-200"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{formatDate(u.updatedAt)}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(u)} className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-semibold">Edit</button>
                          <button onClick={() => handleDelete(u)} className="px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold">Delete</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <p className="text-slate-400 text-sm mt-3">No users created yet.</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
