import { describe, expect, it } from "vitest";
import type { TaskState } from "@/core/realityloop/task-machine";
import { firstSteps, type FirstStepFacts } from "./first-steps";

const OPEN = { checks: null, publishing: null };
const none: FirstStepFacts = { projects: [], tasks: [], latestProofPack: null, verifiedTaskId: null, liveSite: null };
const task = (id: string, state: TaskState, projectId = "p1") => ({ id, state, projectId });
const states = (facts: FirstStepFacts, limits = OPEN) => firstSteps(facts, limits).steps.map((s) => s.state);

describe("first steps", () => {
  it("starts at describing a build, with only that step offered", () => {
    const r = firstSteps(none, OPEN);
    expect(r.steps.map((s) => s.state)).toEqual(["next", "later", "later", "later", "later"]);
    expect(r.steps[0]).toMatchObject({ href: "#start", action: "Write it" });
    expect(r.steps.slice(1).every((s) => s.href === null && s.action === null)).toBe(true);
    expect(r).toMatchObject({ done: 0, complete: false });
  });

  it("sends a drafted plan to its plan card", () => {
    const r = firstSteps({ ...none, projects: [{ id: "p1" }], tasks: [task("t1", "CONTRACT_DRAFTED")] }, OPEN);
    expect(r.steps.map((s) => s.state)).toEqual(["done", "next", "later", "later", "later"]);
    expect(r.steps[1]!.href).toBe("/app/new/t1");
  });

  it("counts an approved plan from any state after approval, but not from rejected or cancelled tasks", () => {
    expect(states({ ...none, tasks: [task("t1", "EXPIRED")] })).toEqual(["done", "done", "next", "later", "later"]);
    expect(states({ ...none, tasks: [task("t1", "REJECTED")] })).toEqual(["done", "next", "later", "later", "later"]);
    expect(states({ ...none, tasks: [task("t1", "CANCELLED")] })).toEqual(["done", "next", "later", "later", "later"]);
  });

  it("points the review step at a change waiting for approval first", () => {
    const r = firstSteps({ ...none, tasks: [task("t2", "EXECUTING"), task("t1", "APPROVAL_PENDING")] }, OPEN);
    expect(r.steps[2]).toMatchObject({ state: "next", href: "/app/tasks/t1#change" });
    expect(firstSteps({ ...none, tasks: [task("t2", "EXECUTING")] }, OPEN).steps[2]!.href).toBe("/app/tasks/t2#change");
  });

  it("counts an applied change from its ProofPack, and sends the unverified one to its checks", () => {
    const r = firstSteps({ ...none, tasks: [task("t1", "REJECTED")], latestProofPack: { taskId: "t1", status: "unverified" } }, OPEN);
    expect(r.steps.map((s) => s.state)).toEqual(["done", "done", "done", "next", "later"]);
    expect(r.steps[3]!.href).toBe("/app/tasks/t1#checks");
  });

  it("marks every earlier step done once a later one is, and sends publishing to the verified project", () => {
    const r = firstSteps({ ...none, projects: [{ id: "p9" }], tasks: [task("t1", "VERIFIED", "p3")], latestProofPack: { taskId: "t1", status: "verified" }, verifiedTaskId: "t1" }, OPEN);
    expect(r.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "next"]);
    expect(r.steps[4]).toMatchObject({ href: "/app/projects/p3#publish", action: "Publish" });
    // A verified task proves the loop even without its ProofPack in hand (the demo has none).
    expect(states({ ...none, tasks: [task("t1", "VERIFIED")] })).toEqual(["done", "done", "done", "done", "next"]);
  });

  it("is complete with a live site", () => {
    const r = firstSteps({ ...none, liveSite: { projectId: "p1", name: "ledgerline" } }, OPEN);
    expect(r).toMatchObject({ done: 5, complete: true });
  });

  it("says why a step can't happen here, and offers the next one that can", () => {
    const limits = { checks: "Checks need a sandbox, and none is connected.", publishing: null };
    const r = firstSteps({ ...none, tasks: [task("t1", "REVIEW_REQUIRED")] }, limits);
    expect(r.steps.map((s) => s.state)).toEqual(["done", "done", "done", "unavailable", "next"]);
    expect(r.steps[3]).toMatchObject({ reason: limits.checks, href: null, action: null });
    // Nothing left that can happen here counts as complete.
    const both = { checks: limits.checks, publishing: "Publishing isn't set up on this server." };
    expect(firstSteps({ ...none, tasks: [task("t1", "REVIEW_REQUIRED")] }, both).complete).toBe(true);
    expect(firstSteps(none, both).complete).toBe(false);
  });

  it("never claims a partly verified change as verified", () => {
    const r = firstSteps({ ...none, tasks: [task("t1", "PARTIALLY_VERIFIED")], latestProofPack: { taskId: "t1", status: "partially_verified" } }, OPEN);
    expect(r.steps[3]).toMatchObject({ state: "next", href: "/app/tasks/t1#checks" });
  });
});
