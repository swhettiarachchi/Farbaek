import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { OFFICE_POLICY } from "@/config/office";
import { OFFICE_ACTIONS, STAFF_ROLES, can } from "@/core/office/permissions";
import { createTestDb, readMigration } from "./harness";

/** The database and the console must agree on who may do what, and on the session limits. */

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

describe("Office Space permissions", () => {
  it("private.staff_can matches PERMISSIONS for every role and action, and refuses unknowns", async () => {
    for (const role of STAFF_ROLES) {
      for (const action of OFFICE_ACTIONS) {
        const r = await db.query<{ ok: boolean }>("select private.staff_can($1, $2) as ok", [role, action]);
        expect(r.rows[0]!.ok, `${role} ${action}`).toBe(can(role, action));
      }
    }
    expect((await db.query<{ ok: boolean }>("select private.staff_can('owner', 'database.drop') as ok")).rows[0]!.ok).toBe(false);
    expect((await db.query<{ ok: boolean }>("select private.staff_can('root', 'console.read') as ok")).rows[0]!.ok).toBe(false);
  });

  it("uses the same session and invite limits as src/config/office.ts", () => {
    const sql = readMigration("20261022090000_office_space.sql");
    expect(sql).toContain(`interval '${OFFICE_POLICY.idleMinutes} minutes'`);
    expect(sql).toContain(`interval '${OFFICE_POLICY.maxSessionHours} hours'`);
    expect(sql).toContain(`interval '${OFFICE_POLICY.inviteMaxDays} days'`);
    expect(sql).toContain(`between ${OFFICE_POLICY.reasonMin} and ${OFFICE_POLICY.reasonMax}`);
    expect(sql).toContain(`p_days not between 1 and ${OFFICE_POLICY.inviteMaxDays}`);
  });
});
