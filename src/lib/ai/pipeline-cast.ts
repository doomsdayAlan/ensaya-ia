import { catalogActorType } from "../session-cast.ts";

/** El libreto importado no nace con un humano fijo. La voz llega aparte, por el nombre. */
export function pipelineCharacterCast(voice: string) {
  return {
    actor_type: catalogActorType("ai"),
    voice,
  };
}
