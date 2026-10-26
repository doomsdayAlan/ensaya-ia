import { Sidebar } from "./Sidebar";
import { AuthGate } from "./AuthGate";
import { MobileNav } from "./MobileNav";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

/** Layout de la app. AuthGate aplica el candado de sesion a todas estas pantallas. */

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 px-6 lg:px-10 py-6 lg:py-8 pb-24 lg:pb-8 overflow-x-hidden">
          <OfflineBanner />
          {children}
        </main>
        <MobileNav />
      </div>
    </AuthGate>
  );
}

function OfflineBanner() {
  const { profile } = useCurrentProfile();
  if (!profile?.offline_mode_enabled) return null;
  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
      Modo sin conexión activo: las notas del director usan plantillas locales. Libretos y ensayos
      siguen en este dispositivo.
    </div>
  );
}
