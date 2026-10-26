import { toast } from "sonner";
import { getLocalAuthUser, loadLocalProfile } from "@/lib/local-auth";

function currentProfile() {
  const user = getLocalAuthUser();
  return user ? loadLocalProfile(user.id) : null;
}

export function notificationsEnabled() {
  const profile = currentProfile();
  return profile?.notifications_enabled !== false;
}

export function isOfflineMode() {
  return Boolean(currentProfile()?.offline_mode_enabled);
}

/** Avisos de sesion (inicio, linea reconocida, ensayo guardado). Los errores siempre se muestran. */
export function sessionSuccess(message: string) {
  if (!notificationsEnabled()) return;
  toast.success(message);
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  try {
    return (await Notification.requestPermission()) as NotificationPermission;
  } catch {
    return "denied" as const;
  }
}

export function desktopNotice(title: string, body: string) {
  if (!notificationsEnabled()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // Algunos navegadores bloquean Notification fuera de un gesto de usuario.
  }
}
