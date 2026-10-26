import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Privacidad - Ensaya IA" },
      {
        name: "description",
        content: "Cómo Ensaya IA trata cuentas, libretos y grabaciones en este dispositivo.",
      },
    ],
  }),
  component: Privacidad,
});

function Privacidad() {
  return (
    <AuthShell
      title="Política de privacidad"
      subtitle="Qué datos se guardan y quién puede ver tus libretos."
      footer={
        <p className="text-sm text-muted-foreground">
          ¿Listo para continuar?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Volver al registro
          </Link>
        </p>
      }
    >
      <div className="space-y-4 text-sm text-muted-foreground max-h-[60vh] overflow-y-auto pr-1">
        <p>
          La cuenta, el perfil, los libretos importados o creados y las grabaciones de ensayo se
          almacenan de forma local (IndexedDB y localStorage de este navegador).
        </p>
        <p>
          En Configuración puedes marcar tus libretos como privados o públicos para otras cuentas
          del mismo dispositivo. Las grabaciones de grupo solo las ven los miembros de ese grupo.
        </p>
        <p>
          Si activas notificaciones, el navegador puede mostrar avisos al terminar un ensayo. Si
          activas el modo sin conexión, las notas del director usan plantillas locales.
        </p>
        <p>
          No vendemos tus datos. Puedes borrar libretos, historial y tu cuenta desde la propia
          aplicación.
        </p>
      </div>
    </AuthShell>
  );
}
