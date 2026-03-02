import { useAuthStore } from "@/stores/auth";
import { logout } from "@/services/auth";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { userDoc } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Nexus Tracking</h1>
          <p className="text-xs text-gray-500">{userDoc?.displayName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">
        <p className="text-gray-500">
          Dashboard — live map and driver list will be implemented in Phase 4.
        </p>
      </main>
    </div>
  );
}
