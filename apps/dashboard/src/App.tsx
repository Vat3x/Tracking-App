import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthListener } from "@/hooks/useAuthListener";
import { useThemeStore } from "@/stores/theme";
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Trips from "@/pages/Trips";
import Settings from "@/pages/Settings";
import InviteLanding from "@/pages/InviteLanding";
import TrackingPage from "@/pages/TrackingPage";
import VerifyEmail from "@/pages/VerifyEmail";
import AuthAction from "@/pages/AuthAction";

function App() {
  useAuthListener();
  const theme = useThemeStore((s) => s.theme);

  return (
    <>
    <Toaster position="top-right" richColors theme={theme} closeButton />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trips"
        element={
          <ProtectedRoute>
            <Trips />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="/auth/action" element={<AuthAction />} />
      <Route path="/invite/:inviteId" element={<InviteLanding />} />
      <Route path="/track/:linkId" element={<TrackingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default App;
