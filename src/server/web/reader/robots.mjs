// robots.txt, as RFC 9309 describes it (stage 205, ADR 0222): Farbaek's reader reads a page only when the site allows its
// user agent, FarbaekBot (or every agent, when no group names it). The longest matching rule wins; on a tie, Allow wins; `*`
// matches any characters and `$` anchors the end. A site with no robots.txt (a 4xx answer) allows everything; one whose
// robots.txt can't be reached (5xx, a network error, a timeout) is treated as disallowing everything, as the RFC asks.
export const ROBOTS_TOKEN = "farbaekbot";

/** Parses robots.txt into groups of user agents and their rules. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(text).split(/\r\n|\r|\n/).slice(0, 20_000)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      // The product token only: "FarbaekBot/1.0" names farbaekbot.
      current.agents.push(value.toLowerCase().split(/[/\s]/)[0] ?? "");
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      // An empty Disallow allows everything; an empty Allow says nothing.
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern, path) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/** True when the rules let this user agent read the path (with its query string). */
export function robotsAllow(groups, path, token = ROBOTS_TOKEN) {
  const named = groups.filter((g) => g.agents.some((a) => a === token));
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!matches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

/** What a robots.txt answer means: rules to follow, everything allowed, or everything disallowed. */
export function robotsFromResponse(result) {
  if (result.ok && typeof result.text === "string") return { kind: "rules", groups: parseRobots(result.text) };
  const status = result.status ?? 0;
  if (status >= 400 && status < 500) return { kind: "allow-all" };
  return { kind: "disallow-all" };
}

/** Checks one URL against a site's robots.txt answer. */
export function robotsPermit(robots, url) {
  if (robots.kind === "allow-all") return true;
  if (robots.kind === "disallow-all") return false;
  const u = new URL(url);
  return robotsAllow(robots.groups, `${u.pathname}${u.search}`);
}
