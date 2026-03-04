import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuthStore } from "@/stores/auth";
import { useDriversStore } from "@/stores/drivers";
import { logout } from "@/services/auth";
import { subscribeToInvites, generateInviteLink, expireInvite } from "@/services/invites";
import { subscribeToCompanyLocations } from "@/services/locations";
import { subscribeToCompanyTrips } from "@/services/trips";
import { getCompanyDrivers } from "@/services/drivers";
import InviteModal from "@/components/InviteModal";
import MapView from "@/components/MapView";
import DriverList from "@/components/DriverList";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { toast } from "sonner";
import { COLLECTIONS, type Invite, type User, type Trip } from "@nexus/shared";
import ThemeToggle from "@/components/ThemeToggle";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function InviteStatusBadge({ invite }: { invite: Invite }) {
  const now = Date.now();
  if (invite.status === "accepted") {
    return <span className="text-xs font-medium text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Accepted</span>;
  }
  if (invite.status === "expired" || invite.expiresAt < now) {
    return <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 px-2 py-0.5 rounded-full">Expired</span>;
  }
  return <span className="text-xs font-medium text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">Pending</span>;
}

export default function Dashboard() {
  const { userDoc } = useAuthStore();
  const { drivers, selectedDriverId, setDrivers, selectDriver } = useDriversStore();
  const navigate = useNavigate();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [driverProfiles, setDriverProfiles] = useState<Map<string, User>>(new Map());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [companyName, setCompanyName] = useState("My Company");

  // Fetch company name
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getDoc(doc(db, COLLECTIONS.COMPANIES, userDoc.companyId)).then((snap) => {
      if (snap.exists()) setCompanyName(snap.data().name ?? "My Company");
    });
  }, [userDoc?.companyId]);

  // Subscribe to invites
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToInvites(userDoc.companyId, setInvites);
  }, [userDoc?.companyId]);

  // Subscribe to real-time driver locations
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyLocations(userDoc.companyId, setDrivers);
  }, [userDoc?.companyId, setDrivers]);

  // Subscribe to trips (for active trip marker colors)
  useEffect(() => {
    if (!userDoc?.companyId) return;
    return subscribeToCompanyTrips(userDoc.companyId, setTrips);
  }, [userDoc?.companyId]);

  // Load driver profiles from Firestore
  useEffect(() => {
    if (!userDoc?.companyId) return;
    getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
  }, [userDoc?.companyId]);

  // Re-fetch profiles when a new driver appears that we don't have a profile for
  useEffect(() => {
    if (!userDoc?.companyId) return;
    const unknownDriver = drivers.find((d) => !driverProfiles.has(d.driverId));
    if (unknownDriver) {
      getCompanyDrivers(userDoc.companyId).then(setDriverProfiles);
    }
  }, [drivers, driverProfiles, userDoc?.companyId]);

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await logout();
    navigate("/login");
  }

  function handleCopyLink(inviteId: string) {
    navigator.clipboard.writeText(generateInviteLink(inviteId));
    setCopiedId(inviteId);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleExpire(inviteId: string) {
    try {
      await expireInvite(inviteId);
      toast.success("Invite revoked");
    } catch {
      toast.error("Failed to revoke invite");
    }
  }

  const handleSelectDriver = useCallback(
    (driverId: string | null) => selectDriver(driverId),
    [selectDriver]
  );

  const activeDriverIds = useMemo(
    () => new Set(
      trips
        .filter((t) => t.status === "accepted" || t.status === "in_progress")
        .map((t) => t.driverId)
        .filter((id): id is string => id !== null)
    ),
    [trips]
  );

  const pendingInvites = invites.filter(
    (i) => i.status === "pending" && i.expiresAt > Date.now()
  ).length;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nexus Tracking</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{userDoc?.displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/trips")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Trips
          </button>
          <button
            onClick={() => setInvitesOpen(!invitesOpen)}
            className="relative h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Invites
            {pendingInvites > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingInvites}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="h-8 px-3 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Settings
          </button>
          <ThemeToggle />
          <button
            onClick={() => setInviteModalOpen(true)}
            className="h-8 px-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Invite Driver
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content: map + driver panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 flex">
          <MapView
            drivers={drivers}
            driverProfiles={driverProfiles}
            selectedDriverId={selectedDriverId}
            onSelectDriver={handleSelectDriver}
            activeDriverIds={activeDriverIds}
            trips={trips}
          />
        </div>

        {/* Driver side panel */}
        <DriverList
          drivers={drivers}
          driverProfiles={driverProfiles}
          selectedDriverId={selectedDriverId}
          onSelectDriver={selectDriver}
          activeDriverIds={activeDriverIds}
        />

        {/* Invites slide-over panel */}
        {invitesOpen && (
          <>
            <div
              className="absolute inset-0 bg-black/10 z-20"
              onClick={() => setInvitesOpen(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-xl z-30 flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Tracking Requests
                </h2>
                <button
                  onClick={() => setInvitesOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {invites.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      No invites yet. Generate a tracking request link.
                    </p>
                    <button
                      onClick={() => {
                        setInvitesOpen(false);
                        setInviteModalOpen(true);
                      }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Create first invite
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {invites.map((invite) => {
                      const isActive =
                        invite.status === "pending" && invite.expiresAt > Date.now();
                      return (
                        <div key={invite.id} className="px-5 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
                              {invite.id.slice(0, 8)}...
                            </span>
                            <InviteStatusBadge invite={invite} />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Created {formatTime(invite.createdAt)}
                            {invite.status === "accepted" && invite.acceptedBy && (
                              <> · Driver: {invite.acceptedBy.slice(0, 8)}...</>
                            )}
                          </p>
                          {isActive && (
                            <div className="flex items-center gap-3 mt-2">
                              <button
                                onClick={() => handleCopyLink(invite.id)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700"
                              >
                                {copiedId === invite.id ? "Copied!" : "Copy link"}
                              </button>
                              <button
                                onClick={() => handleExpire(invite.id)}
                                className="text-xs text-gray-400 hover:text-red-500"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        companyName={companyName}
      />
    </div>
  );
}
