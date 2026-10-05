import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getPerfilUsuario } from "@/lib/rehearsal-data";

export function useCurrentProfile() {
  const { user, loading, signOut } = useAuth();
  const { data } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
    enabled: Boolean(user),
  });

  return {
    user,
    loading,
    signOut,
    displayName: data?.profile.display_name || user?.user_metadata?.display_name || user?.email,
  };
}
