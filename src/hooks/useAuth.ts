import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthRequired } from "@/lib/app-config";
import {
  ensureLocalAuthReady,
  getLocalAuthUser,
  logoutLocalAccount,
  subscribeLocalAuth,
  type LocalAuthUser,
} from "@/lib/local-auth";

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const sync = () => {
      if (!alive) return;
      setUser(getLocalAuthUser());
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      queryClient.invalidateQueries({ queryKey: ["current-user-id"] });
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    };

    void ensureLocalAuthReady().finally(sync);
    const unsubscribe = subscribeLocalAuth(sync);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [queryClient]);

  return {
    session: user ? { user } : null,
    user,
    loading,
    signOut: async () => {
      logoutLocalAccount();
      if (isAuthRequired() && typeof window !== "undefined") {
        window.location.assign("/login");
      }
    },
  };
}
