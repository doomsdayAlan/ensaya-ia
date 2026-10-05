import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthShell, Field } from "@/components/AuthShell";
import { DemoAccountButton, goAfterLogin } from "@/components/DemoAccountButton";
import { useAuth } from "@/hooks/useAuth";
import { loginLocalAccount } from "@/lib/local-auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesion - Ensaya IA" },
      {
        name: "description",
        content: "Accede a tu cuenta de Ensaya IA para gestionar libretos y ensayar con IA.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) goAfterLogin();
  }, [authLoading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginLocalAccount({ email, password });
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      toast.success("Sesion iniciada");
      goAfterLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Bienvenido de nuevo"
      subtitle="Inicia sesion. Tu cuenta se guarda en la base de datos de este navegador."
      footer={
        <>
          Aun no tienes cuenta?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Registrate
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field
          label="Correo electronico"
          type="email"
          placeholder="tu@correo.com"
          icon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <Field
          label="Contrasena"
          type="password"
          placeholder="********"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg py-3 text-sm font-medium shadow-glow hover:scale-[1.01] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Entrar al escenario <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
            o continua con
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <DemoAccountButton />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Demo: {`demo@ensaya-ia.local`} · contraseña {`ensayo123`}
        </p>
      </form>
    </AuthShell>
  );
}
