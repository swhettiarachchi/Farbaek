/**
 * Where a build from the build box goes (stage 176). A new build makes a new project, which the plan's project
 * limit can refuse; a project someone already has can always take more work. So once a workspace has projects,
 * the box offers them too, and when the limit is reached it starts on the most recent one and says why a new
 * project can't be made, instead of refusing after the person has written their build.
 */

export interface TargetProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string | null;
  archivedAt?: string | null;
}

export interface BuildTargets {
  /** Active projects, most recent first. Empty when there are none: the box then makes a new one. */
  projects: { id: string; name: string }[];
  /** Why a new project can't be made now, or null when it can. */
  newProject: string | null;
}

const MAX_LISTED = 25;
const touched = (p: TargetProject) => Date.parse(p.updatedAt ?? p.createdAt) || 0;

export function buildTargets(projects: readonly TargetProject[], limit: number | null): BuildTargets {
  const active = projects.filter((p) => !p.archivedAt).sort((a, b) => touched(b) - touched(a));
  const full = limit !== null && active.length >= limit;
  const plural = limit === 1 ? "project" : "projects";
  return {
    projects: active.slice(0, MAX_LISTED).map((p) => ({ id: p.id, name: p.name })),
    newProject: full
      ? `Your plan includes ${limit} ${plural}, and ${limit === 1 ? "it's" : "they're"} in use. Build in a project you have, archive one, or choose a bigger plan for a new one.`
      : null,
  };
}
