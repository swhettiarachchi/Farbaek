/**
 * Auto routing on this server: the core rules (src/core/agent/routing.ts)
 * with the tiers an owner switched in Office Space (ADR 0090) applied. Every
 * server call that picks a model goes through here.
 */
import { route, type RouteChoice, type RouteInput } from "@/core/agent/routing";
import { platformModels } from "@/server/platform/state";

export function routeModel(input: Omit<RouteInput, "overrides">): RouteChoice {
  return route({ ...input, overrides: platformModels() });
}
