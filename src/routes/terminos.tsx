import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos de uso - Ensaya IA" },
      {
        name: "description",
        content: "Términos de uso de Ensaya IA para cuentas, libretos y ensayos locales.",
      },
    ],
  }),
  component: Terminos,
});

function Terminos() {
  return (
    <AuthShell
      title="Términos de uso"
      subtitle="Condiciones para usar Ensaya IA en este dispositivo."
      footer={
        <p className="text-sm text-muted-foreground">
          ¿Ya los leíste?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Volver al registro
          </Link>
        </p>
      }
    >
      <div className="space-y-4 text-sm text-muted-foreground max-h-[60vh] overflow-y-auto pr-1">
        <p>
          Ensaya IA es una herramienta de ensayo teatral. Al crear una cuenta aceptas usar el
          servicio para practicar libretos, grabar tomas y revisar tu progreso.
        </p>
        <p>
          Los libretos, grabaciones y reportes se guardan en este navegador. Eres responsable del
          material que importas y de no subir contenido que no te pertenezca.
        </p>
        <p>
          La voz y el reconocimiento funcionan con el navegador. Las notas del director son
          opcionales: plantillas locales o, si está configurado, un modelo de lenguaje.
        </p>
        <p>
          Puedes borrar tu cuenta y tus datos desde este dispositivo. El uso es personal: no
          compartas tu contraseña.
        </p>
      </div>
    </AuthShell>
  );
}
