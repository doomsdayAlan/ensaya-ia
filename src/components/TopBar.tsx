import { Bell, ArrowLeft, LogIn, LogOut, Moon, Sun, User as UserIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useThemePreference } from "@/lib/theme";

export function TopBar({ back }: { back?: { to: string; label: string; className?: string } }) {
  const { user, loading, signOut, displayName } = useCurrentProfile();
  const { resolved, setTheme } = useThemePreference();
  const dark = resolved === "dark";

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        {back ? (
          <Link
            to={back.to}
            className={`inline-flex items-center gap-2 text-xs tracking-[0.25em] uppercase transition ${back.className ?? "text-muted-foreground hover:text-primary"}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {back.label}
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={dark ? "Usar modo claro" : "Usar modo oscuro"}
          onClick={() => setTheme(dark ? "light" : "dark")}
          className="relative w-9 h-9 rounded-full bg-surface border border-input flex items-center justify-center text-muted-foreground hover:text-primary transition"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          type="button"
          aria-label="Notificaciones"
          onClick={() => toast.message("Sin avisos nuevos")}
          className="relative w-9 h-9 rounded-full bg-surface border border-input flex items-center justify-center text-muted-foreground hover:text-primary transition"
        >
          <Bell className="w-4 h-4" />
        </button>
        {loading ? null : user ? (
          <>
            <Link
              to="/configuracion"
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-input text-sm hover:border-primary/40"
            >
              <UserIcon className="w-4 h-4 text-primary" />
              <span className="text-foreground/80 max-w-[160px] truncate">{displayName}</span>
            </Link>
            <button
              onClick={async () => {
                await signOut();
                toast.success("Sesión cerrada");
              }}
              className="inline-flex items-center gap-2 border border-input bg-surface text-foreground rounded-lg px-4 py-2 text-sm font-medium hover:border-primary/40 transition"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow hover:scale-[1.02] transition"
          >
            <LogIn className="w-4 h-4" /> Iniciar sesión
          </Link>
        )}
      </div>
    </div>
  );
}
