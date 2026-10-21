import type { Metadata } from "next";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { PageHeader } from "@/components/app/primitives";
import { RunStatusBadge } from "@/components/build/run-status";
import { RelativeTime } from "@/components/ui/local-time";
import { RUN_STATUSES, type RunStatus } from "@/core/agent/cloud-run";
import { maskEmail } from "@/core/office/permissions";
import { requireStaff } from "@/server/office/access";
import { listPeople, loadActivity } from "@/server/admin/data";

export const metadata: Metadata = { title: "Activity" };

const number = new Intl.NumberFormat("en-US");
const isRunStatus = (s: string): s is RunStatus => (RUN_STATUSES as readonly string[]).includes(s);

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-6 text-sm text-ink-2">{children}</p>;
}

export default async function OfficeActivity() {
  const staff = await requireStaff();
  const admin = staff.admin;
  const [activity, { people }] = await Promise.all([loadActivity(admin), listPeople(admin)]);
  const emails = new Map(people.map((p) => [p.id, staff.can("people.read_email") ? p.email : maskEmail(p.email)]));

  return (
    <div className="grid gap-10">
      <PageHeader title="Activity" description="The latest agent runs, security checks and recorded actions across every workspace, newest first." />

      <section aria-labelledby="runs-heading" className="grid gap-3">
        <h2 id="runs-heading" className="text-lg font-medium">
          Agent runs
        </h2>
        {activity.runs.length === 0 ? (
          <Empty>No cloud runs yet. They appear here when anyone starts the agent from Build.</Empty>
        ) : (
          <AdminTable caption="Agent runs" columns={["Task", "Workspace", "Status", "Model", "Steps", "Tokens", "Started"]}>
            {activity.runs.map((r) => (
              <tr key={r.id}>
                <Cell>
                  <span className="line-clamp-2 max-w-[36ch]">{r.task}</span>
                </Cell>
                <Cell muted>{r.workspace}</Cell>
                <Cell>{isRunStatus(r.status) ? <RunStatusBadge status={r.status} /> : <Chip>{r.status}</Chip>}</Cell>
                <Cell mono muted={!r.model}>
                  {r.model ?? "Not chosen"}
                </Cell>
                <Cell mono>{r.steps}</Cell>
                <Cell mono>{number.format(r.tokens)}</Cell>
                <Cell muted>
                  <RelativeTime iso={r.startedAt} />
                </Cell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section aria-labelledby="checks-heading" className="grid gap-3">
        <h2 id="checks-heading" className="text-lg font-medium">
          Security checks
        </h2>
        {activity.checks.length === 0 ? (
          <Empty>No security checks yet.</Empty>
        ) : (
          <AdminTable caption="Security checks" columns={["Project", "Workspace", "Result", "Started"]}>
            {activity.checks.map((c) => (
              <tr key={c.id}>
                <Cell>{c.project}</Cell>
                <Cell muted>{c.workspace}</Cell>
                <Cell>
                  {c.status === "done" && c.score !== null ? (
                    <Chip tone={c.score >= 80 ? "verified" : c.score >= 60 ? "approval" : "failed"}>
                      {c.score} · grade {c.grade}
                    </Chip>
                  ) : (
                    <Chip tone={c.status === "failed" ? "failed" : "neutral"}>{c.status === "failed" ? "Failed" : "Running"}</Chip>
                  )}
                </Cell>
                <Cell muted>
                  <RelativeTime iso={c.startedAt} />
                </Cell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section aria-labelledby="audit-heading" className="grid gap-3">
        <h2 id="audit-heading" className="text-lg font-medium">
          Recorded actions
        </h2>
        {activity.audit.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <AdminTable caption="Recorded actions" columns={["Action", "Target", "Workspace", "By", "When"]}>
            {activity.audit.map((a) => (
              <tr key={a.id}>
                <Cell mono>{a.action}</Cell>
                <Cell muted>
                  <span className="line-clamp-1 max-w-[28ch] break-all">{a.target || "None"}</span>
                </Cell>
                <Cell muted>{a.workspace}</Cell>
                <Cell muted>{a.actorId ? (emails.get(a.actorId) ?? "Deleted account") : "Farbaek"}</Cell>
                <Cell muted>
                  <RelativeTime iso={a.at} />
                </Cell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>
    </div>
  );
}
