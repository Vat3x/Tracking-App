import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/register" replace />;
  }

  if (!firebaseUser.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <>{children}</>;
}
