import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthRequired } from "@/lib/app-config";
import {
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
    const sync = () => {
      setUser(getLocalAuthUser());
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      queryClient.invalidateQueries({ queryKey: ["current-user-id"] });
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    };

    sync();
    return subscribeLocalAuth(sync);
  }, [queryClient]);

  return {
    session: user ? { user } : null,
    user,
    loading,
    signOut: async () => {
      logoutLocalAccount();
      // Con el candado activo, Inicio no debe verse sin cuenta.
      if (isAuthRequired() && typeof window !== "undefined") {
        window.location.assign("/login");
      }
    },
  };
}
