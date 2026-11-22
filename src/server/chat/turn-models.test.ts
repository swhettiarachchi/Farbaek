/** Which models a Chat turn may use (stage 209): the own-key rule of ADR 0125, with stand-in models that call nothing. */
import { describe, expect, it } from "vitest";
import { turnModels } from "./turn-models";

const deps = { name: "farbaek" };
const own = { name: "own key log" };
const claudeFor = (client: string) => `claude via ${client}`;
const BROKEN = "This workspace's own AI key can't be read on this server anymore.";

describe("the models for one Chat turn", () => {
  it("uses Claude and OpenAI on Farbaek's keys when the workspace has no key of its own", () => {
    expect(turnModels({ provider: "anthropic", client: "farbaek", deps, own: false }, "openai", deps, claudeFor)).toEqual({ claude: "claude via farbaek", claudeUsage: deps, claudeOwnKey: false, openai: "openai", error: null });
  });

  it("marks a workspace on its own key, so the router keeps its words on that key", () => {
    const r = turnModels({ provider: "anthropic", client: "theirs", deps: own, own: true }, "openai", deps, claudeFor);
    expect(r).toMatchObject({ claude: "claude via theirs", claudeUsage: own, claudeOwnKey: true, error: null });
  });

  it("stops, and never falls back to OpenAI, when the workspace's own key can't be read", () => {
    const r = turnModels({ error: BROKEN, ownKey: true }, "openai", deps, claudeFor);
    expect(r).toEqual({ claude: null, claudeUsage: deps, claudeOwnKey: true, openai: null, error: BROKEN });
  });

  it("still answers with OpenAI when Farbaek's own Claude isn't set up, and says why when nothing is", () => {
    expect(turnModels({ error: "AI isn't available on this server right now." }, "openai", deps, claudeFor)).toMatchObject({ claude: null, openai: "openai", claudeOwnKey: false, error: null });
    expect(turnModels({ error: "AI isn't available on this server right now." }, null, deps, claudeFor)).toMatchObject({ claude: null, openai: null, error: "AI isn't available on this server right now." });
    expect(turnModels({ provider: "gemini", client: "farbaek", deps, own: false }, null, deps, claudeFor).error).toBe("Chat needs Claude or OpenAI, and this server uses Gemini.");
  });
});
