import { create } from "zustand";
import type { User } from "@nexus/shared";

interface AuthState {
  firebaseUser: { uid: string; email: string | null } | null;
  userDoc: User | null;
  loading: boolean;
  setFirebaseUser: (user: { uid: string; email: string | null } | null) => void;
  setUserDoc: (doc: User | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  userDoc: null,
  loading: true,
  setFirebaseUser: (user) => set({ firebaseUser: user }),
  setUserDoc: (doc) => set({ userDoc: doc }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ firebaseUser: null, userDoc: null, loading: false }),
}));
