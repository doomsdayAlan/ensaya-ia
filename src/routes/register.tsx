import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthShell, Field } from "@/components/AuthShell";
import { DemoAccountButton, goAfterLogin } from "@/components/DemoAccountButton";
import { useAuth } from "@/hooks/useAuth";
import { registerLocalAccount } from "@/lib/local-auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Crear cuenta - Ensaya IA" },
      {
        name: "description",
        content: "Registrate en Ensaya IA y empieza a ensayar teatro con IA.",
      },
    ],
  }),
  component: Register,
});

function Register() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) goAfterLogin();
  }, [authLoading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      toast.error("Debes aceptar los terminos para continuar");
      return;
    }
    if (password.length < 8) {
      toast.error("La contrasena debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      await registerLocalAccount({ email, password, displayName: name });
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      toast.success("Cuenta guardada en la base de datos. Ya puedes ensayar.");
      goAfterLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="La cuenta se guarda en IndexedDB, la base de datos del navegador."
      footer={
        <>
          Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Inicia sesion
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field
          label="Nombre"
          placeholder="Tu nombre artistico"
          icon={<User className="w-4 h-4" />}
          value={name}
          onChange={setName}
          required
          autoComplete="name"
        />
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
          placeholder="Minimo 8 caracteres"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
        />

        <label className="flex items-start gap-2 text-xs text-muted-foreground mb-5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary mt-0.5"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            Acepto los{" "}
            <a href="#" className="text-primary hover:underline">
              terminos
            </a>{" "}
            y la{" "}
            <a href="#" className="text-primary hover:underline">
              politica de privacidad
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg py-3 text-sm font-medium shadow-glow hover:scale-[1.01] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Crear mi cuenta <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
            o registrate con
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <DemoAccountButton />
      </form>
    </AuthShell>
  );
}
