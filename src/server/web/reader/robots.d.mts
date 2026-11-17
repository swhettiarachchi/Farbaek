export interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}
export type Robots = { kind: "rules"; groups: RobotsGroup[] } | { kind: "allow-all" } | { kind: "disallow-all" };

export const ROBOTS_TOKEN: string;
export function parseRobots(text: string): RobotsGroup[];
export function robotsAllow(groups: RobotsGroup[], path: string, token?: string): boolean;
export function robotsFromResponse(result: { ok: boolean; text?: string; status?: number }): Robots;
export function robotsPermit(robots: Robots, url: string): boolean;
