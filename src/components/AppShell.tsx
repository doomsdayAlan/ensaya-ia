import { Sidebar } from "./Sidebar";
import { AuthGate } from "./AuthGate";

/** Layout de la app. AuthGate aplica el candado de sesion a todas estas pantallas. */

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 px-6 lg:px-10 py-6 lg:py-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </AuthGate>
  );
}
