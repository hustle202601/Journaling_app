import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./client";
import { setActiveUser } from "./session";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  configured: false,
  signIn: async () => {
    throw new Error("Firebase is not configured.");
  },
  signUp: async () => {
    throw new Error("Firebase is not configured.");
  },
  signOut: async () => {},
});

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* values to your environment.");
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setActiveUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setActiveUser(nextUser?.uid ?? null);
        setLoading(false);
      },
      (error) => {
        console.error("Firebase auth state error", error);
        setActiveUser(null);
        setLoading(false);
      },
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured: isFirebaseConfigured,
      async signIn(email, password) {
        await signInWithEmailAndPassword(requireAuth(), email, password);
      },
      async signUp(email, password) {
        await createUserWithEmailAndPassword(requireAuth(), email, password);
      },
      async signOut() {
        await firebaseSignOut(requireAuth());
        setActiveUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
