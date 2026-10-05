import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { isAuthRequired, rememberPostLoginPath } from "@/lib/app-config";

/** Envuelve AppShell: si el candado esta activo y no hay sesion, manda a /login. */

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const locked = isAuthRequired();

  useEffect(() => {
    if (!locked || loading || user) return;
    rememberPostLoginPath(path);
    nav({ to: "/login" });
  }, [locked, loading, user, path, nav]);

  if (locked && (loading || !user)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Preparando el escenario...</p>
      </div>
    );
  }

  return children;
}
