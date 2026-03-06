import { createContext, useContext, useEffect, useState } from "react";

const FACTORY_USER = "Company_A";
const FACTORY_PASSWORD = "1234";
const STORAGE_KEY = "biot_auth";
const USERS_KEY = "biot_users_v1";

type StoredUser = {
  id: string;
  name?: string;
  email: string;
  role?: string;
  password: string;
};

const loadUsers = (): StoredUser[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export type AuthState = {
  userId: string | null;
  token: string | null;
  role: "admin" | "user" | null;
};

const AuthContext = createContext<{
  state: AuthState;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  hydrated: boolean;
}>({ state: { userId: null, token: null, role: null }, login: async () => {}, logout: () => {}, hydrated: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, token: null, role: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId && parsed?.token) setState({ role: null, ...parsed });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const login = async (userId: string, password: string) => {
    if (!userId || !password) throw new Error("User ID and password are required.");
    const input = String(userId).trim();
    if ((input === FACTORY_USER && password === FACTORY_PASSWORD)) {
      const next = { userId: input, token: "factory-token", role: "admin" as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
      return;
    }

    const users = loadUsers();
    const lower = input.toLowerCase();
    const matched = users.find((u) => {
      if (!u) return false;
      if (u.id === input) return true;
      if (u.email && u.email.toLowerCase() === lower) return true;
      if (u.name && u.name.toLowerCase() === lower) return true;
      return false;
    });
    if (matched && matched.password === password) {
      const role: "admin" | "user" = matched.role === "admin" ? "admin" : "user";
      const next: AuthState = { userId: matched.email || matched.id, token: `local-${matched.id}`, role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
      return;
    }

    throw new Error("Invalid credentials");
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ userId: null, token: null, role: null });
  };

  return <AuthContext.Provider value={{ state, login, logout, hydrated }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
