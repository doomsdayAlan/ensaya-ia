/** Quién es humano en un ensayo: solo la elección de esa sesión. */

export type SessionCastMember = {
  characterId: string;
  actorType: string;
};

export type SessionRole = {
  characterId: string;
  label: string;
};

export function rolesForSession(input: {
  selectedCharacterId: string | null;
  sessionCast?: SessionCastMember[] | null;
}): SessionRole[] {
  const cast = (input.sessionCast ?? []).filter((item) => item.characterId);
  if (cast.length > 0) {
    return cast.map((item, index) => ({
      characterId: item.characterId,
      label: castLabel(item.actorType, index),
    }));
  }
  if (!input.selectedCharacterId) return [];
  return [{ characterId: input.selectedCharacterId, label: "Tú" }];
}

function castLabel(actorType: string, index: number) {
  if (actorType.startsWith("actor-")) return `Actor ${actorType.slice("actor-".length)}`;
  if (index === 0 || actorType === "user") return "Tú";
  return "Tú";
}

export function roleLabelFor(characterId: string | null | undefined, roles: SessionRole[]) {
  if (!characterId) return "voz";
  return roles.find((role) => role.characterId === characterId)?.label ?? "voz";
}

export function humanIdsFor(roles: SessionRole[]) {
  return new Set(roles.map((role) => role.characterId));
}

/** El catálogo no guarda un humano fijo. La persona se elige al empezar el ensayo. */
export function catalogActorType(actorType: string | null | undefined) {
  if (!actorType || actorType === "user" || actorType.startsWith("actor-")) return "ai";
  return actorType;
}

export function isProtectedSeed(
  script: { id?: string | null; source_type?: string | null } | null | undefined,
  seedId: string,
) {
  if (!script || typeof script !== "object") return false;
  return script.source_type === "seed" || script.id === seedId;
}

export type DeleteDecision = "ok" | "missing" | "seed";

export function scriptDeleteDecision(
  script: { id?: string | null; source_type?: string | null } | string | null | undefined,
  seedId: string,
): DeleteDecision {
  if (typeof script === "string" || !script || typeof script !== "object" || !script.id) {
    return "missing";
  }
  if (isProtectedSeed(script, seedId)) return "seed";
  return "ok";
}
