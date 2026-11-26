import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { AuthGate } from "./AuthGate";
import { MobileNav } from "./MobileNav";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { TERMS_VERSION } from "@/lib/ai/interpretation";
import { acceptCurrentTerms } from "@/lib/local-auth";

/** Layout de la app. AuthGate aplica el candado de sesion a todas estas pantallas. */

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <TermsGate>
        <div className="min-h-screen flex bg-background text-foreground">
          <Sidebar />
          <main className="w-full min-w-0 flex-1 overflow-x-hidden px-6 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:py-8 md:pr-10 md:pb-8 md:pl-[13.25rem]">
            <OfflineBanner />
            {children}
          </main>
          <MobileNav />
        </div>
      </TermsGate>
    </AuthGate>
  );
}

function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useCurrentProfile();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Preparando el escenario...
      </div>
    );
  }
  const needsTerms =
    Boolean(user) &&
    profile &&
    profile.user_id !== "guest" &&
    profile.terms_version !== TERMS_VERSION;
  if (!needsTerms || !profile) return children;
  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="max-w-lg w-full rounded-2xl border border-border/60 bg-card p-6">
        <h1 className="font-display text-2xl mb-2">Términos de uso</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Para seguir ensayando hay que aceptar la versión actual. Si dejas activos los consejos de
          interpretación, las tomas de tu voz salen de este dispositivo solo para ese consejo. No
          son una evaluación de un maestro.
        </p>
        <p className="text-sm mb-5">
          <Link to="/terminos" className="text-primary hover:underline">
            Términos y condiciones
          </Link>
          {" · "}
          <Link to="/privacidad" className="text-primary hover:underline">
            Privacidad
          </Link>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            acceptCurrentTerms(profile);
            void queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] }).finally(() => {
              setBusy(false);
            });
          }}
          className="w-full rounded-lg bg-primary-gradient py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Acepto los Términos y condiciones
        </button>
      </div>
    </div>
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
