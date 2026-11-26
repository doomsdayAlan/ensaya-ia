import { Link, useRouterState } from "@tanstack/react-router";
import { Home, FileText, Drama, Settings, LogIn, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "./AppLogo";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

export const NAV = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/libretos", label: "Libretos", icon: FileText },
  { to: "/ensayos", label: "Ensayos", icon: Drama },
  { to: "/grupos", label: "Grupos", icon: Users },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

function NavLinks({ path }: { path: string }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            title={label}
            className={`flex items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "w-full gap-2 bg-sidebar-active px-3 py-2 text-accent-foreground"
                : "size-10 text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {active ? (
              <span className="truncate">{label}</span>
            ) : (
              <span className="sr-only">{label}</span>
            )}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, signOut, displayName } = useCurrentProfile();

  return (
    <aside
      id="ensaya-sidebar"
      className="fixed bottom-3 left-3 top-3 z-40 hidden w-44 flex-col rounded-3xl border border-border bg-sidebar p-3 shadow-elevated md:flex"
    >
      <div className="flex justify-center pb-3">
        <AppLogo size={140} />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        <NavLinks path={path} />
      </nav>

      {loading ? null : user ? (
        <>
          <div className="mt-3 truncate rounded-full border border-border bg-surface px-3 py-2 text-center text-xs text-muted-foreground">
            {displayName}
          </div>
          <button
            onClick={async () => {
              await signOut();
              toast.success("Sesión cerrada");
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-input bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4 shrink-0" /> Cerrar sesión
          </button>
        </>
      ) : (
        <>
          <Link
            to="/login"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-gradient px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogIn className="size-4 shrink-0" /> Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="mt-2 text-center text-xs text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ¿Sin cuenta? Regístrate
          </Link>
        </>
      )}
    </aside>
  );
}
