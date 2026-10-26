import { refreshNetlifyLaunch } from "./netlify-launch";
import { refreshVercelLaunch, type LaunchDeps } from "./provider-launch";
import type { LaunchOrderView } from "./provider-store";

/** Looks once at a launch still building, with its own provider, when the page finds the background follow stopped. */
export function refreshLaunch(deps: LaunchDeps, orgId: string, order: Pick<LaunchOrderView, "id" | "provider">): Promise<void> {
  return order.provider === "netlify" ? refreshNetlifyLaunch(deps, orgId, order.id) : refreshVercelLaunch(deps, orgId, order.id);
}
