import { create } from "zustand";
import type { User } from "@nexus/shared";

interface AuthState {
  firebaseUser: { uid: string; email: string | null } | null;
  userDoc: User | null;
  loading: boolean;
  pendingInviteId: string | null;
  setFirebaseUser: (user: { uid: string; email: string | null } | null) => void;
  setUserDoc: (doc: User | null) => void;
  setLoading: (loading: boolean) => void;
  setPendingInviteId: (id: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  userDoc: null,
  loading: true,
  pendingInviteId: null,
  setFirebaseUser: (user) => set({ firebaseUser: user }),
  setUserDoc: (doc) => set({ userDoc: doc }),
  setLoading: (loading) => set({ loading }),
  setPendingInviteId: (id) => set({ pendingInviteId: id }),
  reset: () => set({ firebaseUser: null, userDoc: null, loading: false, pendingInviteId: null }),
}));
