import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogIn, LogOut, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "./AppLogo";
import { NAV } from "./Sidebar";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

/** Navegacion inferior + menu hamburguesa para pantallas < lg (la sidebar se oculta). */
export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, loading, signOut, displayName } = useCurrentProfile();

  return (
    <>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-sidebar border-r border-border/60 p-5 flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <AppLogo size={120} />
              <button
                type="button"
                aria-label="Cerrar menu"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg border border-border/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon }) => {
                const active = to === "/" ? path === "/" : path.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-surface/60 border-l-2 border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            {!loading && user ? (
              <>
                <div className="mt-4 px-3 py-2 rounded-lg bg-surface/60 border border-border/40 text-xs text-muted-foreground truncate">
                  {displayName}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setOpen(false);
                    toast.success("Sesión cerrada");
                  }}
                  className="mt-2 inline-flex items-center justify-center gap-2 border border-border/60 bg-surface rounded-lg px-4 py-2.5 text-sm"
                >
                  <LogOut className="w-4 h-4" /> Cerrar sesión
                </button>
              </>
            ) : !loading ? (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-4 inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium"
              >
                <LogIn className="w-4 h-4" /> Iniciar sesión
              </Link>
            ) : null}
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur px-1 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-stretch justify-around gap-0.5">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 text-[10px] text-muted-foreground min-w-0"
          >
            <Menu className="w-5 h-5" />
            <span>Menu</span>
          </button>
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 text-[10px] min-w-0 flex-1 transition ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-full">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
