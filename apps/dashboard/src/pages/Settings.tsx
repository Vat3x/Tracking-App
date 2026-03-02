import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { logout } from "@/services/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { COLLECTIONS } from "@nexus/shared";

export default function Settings() {
  const { userDoc } = useAuthStore();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) {
        setCompanyName(snap.data().name ?? null);
      }
    });
  }, [userDoc?.companyId]);

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Nexus Tracking</h1>
          <p className="text-xs text-gray-500">{userDoc?.displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="h-8 px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Map
          </button>
          <button
            onClick={() => navigate("/trips")}
            className="h-8 px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Trips
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Profile */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Profile
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Name</p>
                <p className="text-sm text-gray-900">{userDoc?.displayName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-gray-900">{userDoc?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Role</p>
                <p className="text-sm text-gray-900 capitalize">{userDoc?.role ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Company */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Company
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Company Name</p>
                <p className="text-sm text-gray-900">{companyName ?? "—"}</p>
              </div>
              {userDoc?.companyId && (
                <div>
                  <p className="text-xs text-gray-400">Company ID</p>
                  <p className="text-sm text-gray-500 font-mono text-xs">
                    {userDoc.companyId}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Account */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Account
            </h2>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
            >
              Sign Out
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
