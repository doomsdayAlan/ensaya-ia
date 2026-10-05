import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { consumePostLoginPath } from "@/lib/app-config";
import { enterDemoAccount } from "@/lib/local-auth";

/** Vuelve a la ruta que AuthGate guardo (Inicio u otra pantalla). */
export function goAfterLogin() {
  window.location.assign(consumePostLoginPath());
}

export function DemoAccountButton() {
  const queryClient = useQueryClient();

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await enterDemoAccount();
          queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
          queryClient.invalidateQueries({ queryKey: ["scripts"] });
          toast.success("Sesion de demostracion lista");
          goAfterLogin();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo entrar");
        }
      }}
      className="w-full mt-3 border border-primary/40 bg-primary/10 text-primary rounded-lg py-2.5 text-sm hover:border-primary/70 transition"
    >
      Entrar con cuenta de demostracion
    </button>
  );
}
