import { isServerProvider } from "@/core/launch/providers";
import { refreshNetlifyLaunch } from "./netlify-launch";
import { refreshVercelLaunch } from "./provider-launch";
import type { LaunchOrderView } from "./provider-store";
import { refreshServerLaunch, type ServerLaunchDeps } from "./server-launch";

/** Looks once at a launch still building, with its own provider, when the page finds the background follow stopped. */
export function refreshLaunch(deps: ServerLaunchDeps, orgId: string, order: Pick<LaunchOrderView, "id" | "provider">): Promise<void> {
  if (isServerProvider(order.provider)) return refreshServerLaunch(deps, orgId, order.id, order.provider);
  return order.provider === "netlify" ? refreshNetlifyLaunch(deps, orgId, order.id) : refreshVercelLaunch(deps, orgId, order.id);
}
