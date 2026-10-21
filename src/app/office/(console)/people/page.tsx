import { UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { requireStaff } from "@/server/office/access";
import { maskEmail } from "@/core/office/permissions";
import { listPeople, workspaceCountsByPerson } from "@/server/admin/data";
import { listStaffEmails } from "@/server/office/staff-data";

export const metadata: Metadata = { title: "People" };

export default async function OfficePeople() {
  const staff = await requireStaff();
  const admin = staff.admin;
  const [{ people, capped }, workspaces, staffEmails] = await Promise.all([listPeople(admin), workspaceCountsByPerson(admin), listStaffEmails(admin)]);
  const showEmail = staff.can("people.read_email");

  return (
    <div className="grid gap-6">
      <PageHeader title="People" description={`${people.length}${capped ? "+" : ""} ${people.length === 1 ? "account" : "accounts"}, newest first. Sign-in is by email, so a confirmed email means they opened one.${showEmail ? "" : " Your role sees addresses masked."}`} />
      {capped ? <Notice tone="warning">Showing the newest {people.length}. Paging through more comes with a larger user base.</Notice> : null}
      {people.length === 0 ? (
        <EmptyState icon={UsersThreeIcon} title="No accounts yet">
          Someone appears here the first time they sign in.
        </EmptyState>
      ) : (
        <AdminTable caption="People" columns={["Email", "Signed up", "Last sign-in", "Workspaces"]}>
          {people.map((p) => (
            <tr key={p.id}>
              <Cell>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="break-all font-medium">{showEmail ? p.email : maskEmail(p.email)}</span>
                  {staffEmails.has(p.email.toLowerCase()) ? <Chip tone="accent">Staff</Chip> : null}
                  {!p.confirmed ? <Chip tone="approval">Not confirmed</Chip> : null}
                </span>
              </Cell>
              <Cell muted>
                <LocalTime iso={p.createdAt} />
              </Cell>
              <Cell muted>{p.lastSignInAt ? <RelativeTime iso={p.lastSignInAt} /> : "Never"}</Cell>
              <Cell mono>{workspaces.get(p.id) ?? 0}</Cell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
