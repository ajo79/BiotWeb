import { Route, Routes, Navigate } from "react-router-dom";
import Shell from "./layout/Shell";
import DashboardPage from "./pages/DashboardPage";
import DevicesPage from "./pages/DevicesPage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import AlarmsPage from "./pages/AlarmsPage";
import ExportPage from "./pages/ExportPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import MorePage from "./pages/MorePage";
import NotificationsPage from "./pages/NotificationsPage";
import HelpPage from "./pages/HelpPage";
import AboutPage from "./pages/AboutPage";
import GraphPage from "./pages/GraphPage";
import LoginPage from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./auth/auth";

function Protected({ children }: { children: React.ReactNode }) {
  const { state, hydrated } = useAuth();
  if (!hydrated) return null; // wait for localStorage hydration to avoid redirect loop
  if (!state.token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Shell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/devices/:id" element={<DeviceDetailPage />} />
                <Route path="/graph" element={<GraphPage />} />
                <Route path="/alarms" element={<AlarmsPage />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<MorePage />} />
                <Route path="/more" element={<Navigate to="/settings" replace />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
