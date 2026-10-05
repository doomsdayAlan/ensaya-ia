/**
 * Banderas de producto para local y nube.
 *
 * VITE_REQUIRE_AUTH en .env (o en el panel del hosting) es el valor por defecto.
 * El override en localStorage solo se puede cambiar en modo desarrollo.
 */
import { LEGACY_STORAGE } from "@/lib/legacy-migration";

const REQUIRE_AUTH_OVERRIDE_KEY = "ensaya-ia-require-auth";
const REDIRECT_KEY = "ensaya-ia-post-login";

export function envFlag(name: string, fallback = false) {
  const value = import.meta.env[name];
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

/** Si es true, Inicio y el resto de la app piden cuenta antes de entrar. */
export function isAuthRequired() {
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    const override =
      localStorage.getItem(REQUIRE_AUTH_OVERRIDE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE.requireAuth);
    if (override === "on") return true;
    if (override === "off") return false;
  }
  return envFlag("VITE_REQUIRE_AUTH", true);
}

/** Solo disponible en desarrollo: en produccion manda VITE_REQUIRE_AUTH. */
export function setAuthRequired(required: boolean) {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  localStorage.setItem(REQUIRE_AUTH_OVERRIDE_KEY, required ? "on" : "off");
}

export function rememberPostLoginPath(path: string) {
  if (typeof window === "undefined") return;
  if (path === "/login" || path === "/register") return;
  sessionStorage.setItem(REDIRECT_KEY, path);
}

export function consumePostLoginPath() {
  if (typeof window === "undefined") return "/";
  const path = sessionStorage.getItem(REDIRECT_KEY) || sessionStorage.getItem(LEGACY_STORAGE.postLogin) || "/";
  sessionStorage.removeItem(REDIRECT_KEY);
  sessionStorage.removeItem(LEGACY_STORAGE.postLogin);
  return path.startsWith("/") ? path : "/";
}
