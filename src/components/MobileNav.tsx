import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { NAV } from "./Sidebar";

/** Barra flotante inferior para pantallas menores a md. */
export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-3 z-40 flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-sidebar px-1.5 py-1.5 shadow-elevated md:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            title={label}
            className={`flex h-10 shrink-0 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "gap-2 bg-sidebar-active px-3 text-accent-foreground"
                : "w-10 text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {active ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </Link>
        );
      })}
      <Link
        to="/configuracion-ensayo"
        aria-label="Configurar ensayo"
        title="Configurar ensayo"
        className="sticky right-0 ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" />
      </Link>
    </nav>
  );
}
