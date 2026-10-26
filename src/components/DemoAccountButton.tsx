import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { goAfterLogin } from "@/lib/app-config";
import { enterDemoAccount } from "@/lib/local-auth";

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
          toast.success("Sesión de demostración lista");
          goAfterLogin();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo entrar");
        }
      }}
      className="w-full mt-3 border border-primary/40 bg-primary/10 text-primary rounded-lg py-2.5 text-sm hover:border-primary/70 transition"
    >
      Entrar con cuenta de demostración
    </button>
  );
}
