/**
 * Migration v88 (ADR 0175): what two security audits found, each as the attack
 * it stops.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const join = (orgId: string, user: string, role = "member") => admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, $3)", [orgId, user, role]);
const H = (c: string) => c.repeat(64);
let seq = 0;
const tokenHash = () => (++seq).toString(16).padStart(64, "0");

const newAgent = async (paidBy: string, orgId: string = org) =>
  (await admin<{ id: string; token_sha256: string }>("insert into public.agents (org_id, name, platform, token_sha256, paired_by) values ($1, $2, 'windows', $3, $4) returning id, token_sha256", [orgId, `Laptop ${++seq}`, tokenHash(), paidBy]))[0]!;
const session = async (token: string) =>
  (await q<{ agents_paused: boolean; org_suspended: boolean; may_run_agents: boolean }>("select agents_paused, org_suspended, may_run_agents from public.app_agent_session($1)", [token]))[0];

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a test space kept for checking", () => {
  const createSession = async (actor: string = USERS.alice) =>
    (
      await q<{ session_id: string }>(
        "select * from public.app_create_sandbox_session($1, $2, $3, null, 'Checks', 'node-ts', 'small', 'farbaek-node-small', 'none', 1, 1024, 'test', 'microvm', 1800, 600, 100, 1000, now() - interval '1 day', $4)",
        [org, actor, project, `idem-key-audit-${++seq}`],
      )
    )[0]!.session_id;
  const purpose = async (id: string) => (await admin<{ purpose: string }>("select purpose from public.sandbox_sessions where id = $1", [id]))[0]!.purpose;
  const reserve = (id: string, actor: string = USERS.alice) => q("select public.app_reserve_sandbox_for_verification($1, $2)", [id, actor]);

  it("starts as someone's own, and is only marked before anything exists to tamper with", async () => {
    const id = await createSession();
    expect(await purpose(id)).toBe("person");
    await reserve(id);
    expect(await purpose(id)).toBe("verification");

    const running = await createSession();
    await admin("update public.sandbox_sessions set provider_sandbox_id = 'sbx_1' where id = $1", [running]);
    await expect(reserve(running)).rejects.toThrow(/NOT_FOUND/);
    expect(await purpose(running)).toBe("person");
  });

  it("can't be marked by someone else, or from the browser", async () => {
    const id = await createSession();
    await expect(reserve(id, USERS.bob)).rejects.toThrow(/NOT_FOUND/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_reserve_sandbox_for_verification($1, $2)", [id, USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.sandbox_sessions set purpose = 'verification' where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });
});

describe("the brakes reach a computer's agent", () => {
  it("tells the gateway when the workspace is paused or suspended, and when its person may not run agents", async () => {
    const agent = await newAgent(USERS.alice);
    expect(await session(agent.token_sha256)).toEqual({ agents_paused: false, org_suspended: false, may_run_agents: true });

    await admin("update public.organizations set agents_paused_at = now() where id = $1", [org]);
    expect(await session(agent.token_sha256)).toMatchObject({ agents_paused: true });
    await admin("update public.organizations set agents_paused_at = null where id = $1", [org]);

    await admin("update public.organizations set suspended_at = now(), suspended_reason = 'abuse' where id = $1", [org]).catch(() => admin("update public.organizations set suspended_at = now() where id = $1", [org]));
    expect(await session(agent.token_sha256)).toMatchObject({ org_suspended: true });
    await admin("update public.organizations set suspended_at = null where id = $1", [org]);
  });

  it("tells it about a member's withheld permission", async () => {
    const team = await createOrg(db, USERS.alice, "Permissions team");
    await join(team, USERS.bob);
    const agent = await newAgent(USERS.bob, team);
    await admin("update public.organization_members set permissions = '{\"run_agents\": false}' where org_id = $1 and user_id = $2", [team, USERS.bob]);
    expect(await session(agent.token_sha256)).toMatchObject({ may_run_agents: false });
  });
});

describe("custom domains can't be squatted", () => {
  let first: string;
  let second: string;
  const TOKEN = "a".repeat(32);
  const newSite = async (name: string) => {
    const p = (await q<{ id: string }>("select public.app_create_project($1, $2, $3, null, null) as id", [org, USERS.alice, `Project ${name}`]))[0]!.id;
    return (await admin<{ id: string }>("insert into public.sites (org_id, project_id, name, created_by) values ($1, $2, $3, $4) returning id", [org, p, name, USERS.alice]))[0]!.id;
  };
  const add = async (site: string, hostname: string, actor: string = USERS.alice) => (await q<{ id: string }>("select public.app_add_site_domain($1, $2, $3, $4) as id", [site, actor, hostname, TOKEN]))[0]!.id;
  const mark = (id: string, verified: boolean, actor: string = USERS.alice) => q("select public.app_mark_site_domain($1, $2, $3)", [id, actor, verified]);

  beforeAll(async () => {
    first = await newSite("audit-first");
    second = await newSite("audit-second");
  });

  it("lets two sites ask for a domain, and whoever proves it first holds it", async () => {
    const mine = await add(first, "shop.acme.test");
    const theirs = await add(second, "shop.acme.test");
    await mark(theirs, true);
    expect(await admin("select 1 from public.site_domains where id = $1", [mine])).toEqual([]);
    await expect(add(first, "shop.acme.test")).rejects.toThrow(/DOMAIN_TAKEN/);
  });

  it("ends a request nobody proved after a week", async () => {
    const old = await add(first, "old.acme.test");
    await admin("update public.site_domains set created_at = now() - interval '8 days' where id = $1", [old]);
    await add(second, "old.acme.test");
    expect(await admin("select 1 from public.site_domains where id = $1", [old])).toEqual([]);
  });

  it("keeps a request that was checked lately, such as a verified domain during a DNS blip", async () => {
    const holder = await newSite("audit-blip-one");
    const blip = await add(holder, "blip.acme.test");
    await admin("update public.site_domains set created_at = now() - interval '90 days', checked_at = now() - interval '1 day' where id = $1", [blip]);
    await add(await newSite("audit-blip-two"), "blip.acme.test");
    expect(await admin("select 1 from public.site_domains where id = $1", [blip])).toHaveLength(1);
  });

  it("needs the publish permission to add, check or remove one", async () => {
    await join(org, USERS.bob);
    const site = await newSite("audit-third");
    const id = await add(site, "www.bobs.test", USERS.bob);
    await admin("update public.organization_members set permissions = '{\"publish\": false}' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    await expect(add(site, "other.bobs.test", USERS.bob)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await expect(mark(id, true, USERS.bob)).rejects.toThrow(/PERMISSION_WITHHELD/);
    await expect(q("select public.app_remove_site_domain($1, $2)", [id, USERS.bob])).rejects.toThrow(/PERMISSION_WITHHELD/);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
  });

  it("keeps a site's name off 'sites', which its hostname points at", async () => {
    const p = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Named', null, null) as id", [org, USERS.alice]))[0]!.id;
    await expect(admin("insert into public.sites (org_id, project_id, name, created_by) values ($1, $2, 'sites', $3)", [org, p, USERS.alice])).rejects.toThrow(/sites_name_not_sites/);
  });
});

describe("deleting an account", () => {
  it("can't erase a workspace under review", async () => {
    const dan = "00000000-0000-4000-8000-00000000da01";
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, 'dan@review.test', now())", [dan]);
    const solo = await createOrg(db, dan, "Dan Solo");
    const outcome = async () => (await q<{ outcome: string }>("select outcome from public.app_account_deletion_plan($1) where org_id = $2", [dan, solo]))[0]!.outcome;
    expect(await outcome()).toBe("deleted");

    await admin("update public.organizations set suspended_at = now() where id = $1", [solo]);
    expect(await outcome()).toBe("blocked_review");
    await expect(q("select public.app_delete_account_data($1)", [dan])).rejects.toThrow(/ACCOUNT_DELETION_BLOCKED/);
    await admin("update public.organizations set suspended_at = null where id = $1", [solo]);
    expect(await outcome()).toBe("deleted");

    const p = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Blocked', null, null) as id", [solo, dan]))[0]!.id;
    await admin("insert into public.sites (org_id, project_id, name, created_by, blocked_at) values ($1, $2, 'audit-blocked', $3, now())", [solo, p, dan]);
    expect(await outcome()).toBe("blocked_review");
  });
});

describe("someone who leaves takes their access with them", () => {
  let team: string;
  const eve = "00000000-0000-4000-8000-00000000e4e1";

  beforeAll(async () => {
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, 'eve@leaver.test', now())", [eve]);
    team = await createOrg(db, USERS.alice, "Leaving team");
    await join(team, eve, "admin");
  });

  it("stops their computers and ends their open invitations, and leaves accepted ones alone", async () => {
    const agent = await newAgent(eve, team);
    await admin("insert into public.organization_invitations (org_id, email, role, token_sha256, invited_by, expires_at) values ($1, 'friend@leaver.test', 'member', $2, $3, now() + interval '7 days')", [team, tokenHash(), eve]);
    await q("select public.app_remove_member($1, $2, $3)", [team, USERS.alice, eve]);
    expect((await admin<{ revoked_at: unknown }>("select revoked_at from public.agents where id = $1", [agent.id]))[0]!.revoked_at).not.toBeNull();
    expect(await admin("select 1 from public.organization_invitations where org_id = $1 and invited_by = $2", [team, eve])).toEqual([]);
    expect(await session(agent.token_sha256)).toBeUndefined();
  });

  it("can't change a computer's access or unpair one afterwards", async () => {
    const left = await newAgent(eve, team);
    await expect(q("select public.app_revoke_agent($1, $2)", [left.id, eve])).rejects.toThrow(/FORBIDDEN/);
    await expect(q("select public.app_agent_lease_set($1, $2, 30, null, array['read'], 100)", [left.id, eve])).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("an account's export", () => {
  it("only reads workspaces the person is still in", async () => {
    const zoe = "00000000-0000-4000-8000-00000000c0e1";
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, 'zoe@export.test', now())", [zoe]);
    const team = await createOrg(db, USERS.alice, "Export team");
    await join(team, zoe);
    await q("select public.app_create_project($1, $2, 'Zoe project', null, null)", [team, zoe]);
    const exported = async () => (await q<{ e: { projects_created: { name: string }[] } }>("select public.app_account_export($1) as e", [zoe]))[0]!.e;
    expect((await exported()).projects_created.map((p) => p.name)).toEqual(["Zoe project"]);
    await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [team, zoe]);
    expect((await exported()).projects_created).toEqual([]);
  });
});

describe("free trials from one domain", () => {
  const billing = async (orgId: string) => (await q<{ state: string; trial_withheld: string | null }>("select state, trial_withheld from public.billing_accounts where org_id = $1", [orgId]))[0]!;
  const person = async (email: string) => {
    const id = crypto.randomUUID();
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
    return createOrg(db, id, `Org ${++seq}`);
  };

  it("stops at a handful a day from a catch-all domain, and says why", async () => {
    for (let i = 0; i < 5; i++) expect((await billing(await person(`a${i}@catchall.test`))).state).toBe("trialing");
    expect(await billing(await person("a6@catchall.test"))).toEqual({ state: "free", trial_withheld: "domain_busy" });
    // Another domain isn't touched.
    expect((await billing(await person("a@other.test"))).state).toBe("trialing");
  });

  it("leaves the big public providers alone, where each address is one person", async () => {
    for (let i = 0; i < 7; i++) expect((await billing(await person(`someone${i}@gmail.com`))).state).toBe("trialing");
  });
});

describe("a checkout a subscription can land on", () => {
  const claimable = async (orgId: string, product: string) => (await q<{ c: boolean }>("select public.app_billing_checkout_claimable($1, $2) as c", [orgId, product]))[0]!.c;
  const checkout = (orgId: string, session: string, age = "0 hours") =>
    admin(
      `insert into public.billing_checkouts (org_id, provider, mode, session_id, plan_id, product_id, amount_cents, consent_text, consent_sha256, created_at)
       values ($1, 'dodo', 'test', $2, 'pro', 'pdt_pro', 5000, $3, $4, now() - $5::interval)`,
      [orgId, session, "I agree to this plan being billed monthly until I cancel it.", H("a"), age],
    );

  it("needs an owner's or admin's recent checkout for that product", async () => {
    const orgId = await createOrg(db, USERS.alice, "Billing team");
    expect(await claimable(orgId, "pdt_pro")).toBe(false);
    await checkout(orgId, "cks_old", "49 hours");
    expect(await claimable(orgId, "pdt_pro")).toBe(false);
    await checkout(orgId, "cks_new");
    expect(await claimable(orgId, "pdt_pro")).toBe(true);
    expect(await claimable(orgId, "pdt_other")).toBe(false);
  });

  it("can't be replayed to overwrite a live subscription", async () => {
    const orgId = await createOrg(db, USERS.alice, "Paying team");
    await checkout(orgId, "cks_paid");
    await admin("update public.billing_accounts set state = 'active', paid_plan_id = 'pro', provider_subscription_id = 'sub_real' where org_id = $1", [orgId]);
    expect(await claimable(orgId, "pdt_pro")).toBe(false);
    await admin("update public.billing_accounts set state = 'expired', paid_plan_id = null where org_id = $1", [orgId]);
    expect(await claimable(orgId, "pdt_pro")).toBe(true);
  });

  it("can't be asked from the browser", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_billing_checkout_claimable($1, 'x')", [org]))).rejects.toThrow(/permission denied/);
  });
});

describe("deleting an account takes its access too", () => {
  it("ends the person's open invitations and stops their computers in workspaces they leave", async () => {
    const fay = "00000000-0000-4000-8000-00000000fa11";
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, 'fay@leaver.test', now())", [fay]);
    const team = await createOrg(db, USERS.alice, "Fay's team");
    await join(team, fay, "admin");
    const agent = await newAgent(fay, team);
    await admin("insert into public.organization_invitations (org_id, email, role, token_sha256, invited_by, expires_at) values ($1, 'second@fay.test', 'admin', $2, $3, now() + interval '7 days')", [team, tokenHash(), fay]);
    await q("select public.app_delete_account_data($1)", [fay]);
    expect(await admin("select 1 from public.organization_invitations where org_id = $1 and invited_by = $2", [team, fay])).toEqual([]);
    expect((await admin<{ revoked_at: unknown }>("select revoked_at from public.agents where id = $1", [agent.id]))[0]!.revoked_at).not.toBeNull();
  });
});

describe("a workflow that stops", () => {
  it("stops once, and can't be stopped from the browser", async () => {
    const wf = (await q<{ id: string }>("select public.app_create_workflow($1, $2, $3, 'Two steps', $4, 3000) as id", [org, USERS.alice, project, JSON.stringify([{ title: "One" }, { title: "Two" }])]))[0]!.id;
    await admin("update public.workflows set status = 'approved', approved_by = $2, approved_at = now(), approved_sha256 = $3 where id = $1", [wf, USERS.alice, H("a")]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_workflow_halt($1, 'x')", [wf]))).rejects.toThrow(/permission denied/);
    await q("select public.app_workflow_halt($1, 'A step changed.')", [wf]);
    expect((await admin<{ status: string; halted_reason: string }>("select status, halted_reason from public.workflows where id = $1", [wf]))[0]).toEqual({ status: "halted", halted_reason: "A step changed." });
    await q("select public.app_workflow_halt($1, 'Later reason')", [wf]);
    expect((await admin<{ halted_reason: string }>("select halted_reason from public.workflows where id = $1", [wf]))[0]!.halted_reason).toBe("A step changed.");
  });
});
