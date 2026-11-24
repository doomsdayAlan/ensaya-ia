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
          Si aceptas estos términos y dejas activo el interruptor de consejos de interpretación, las
          tomas de tu voz salen de este dispositivo hacia el servidor de Ensaya IA y, desde ahí, al
          proveedor del modelo (Google). Solo se usan para un consejo orientativo al cerrar el
          ensayo. No se guardan en el servidor. En el plan gratuito, Google puede usar ese contenido
          para mejorar sus productos. El consejo no es la evaluación de un maestro ni sustituye la
          dirección escénica. El modo sin conexión no envía audio. Puedes apagar el envío en
          Configuración.
        </p>
        <p>
          Puedes borrar tu cuenta y tus datos desde este dispositivo. El uso es personal: no
          compartas tu contraseña.
        </p>
      </div>
    </AuthShell>
  );
}
