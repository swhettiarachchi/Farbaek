import { UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { adminMetadata, isAdminEmail, requireAdmin } from "@/server/admin/access";
import { listPeople, workspaceCountsByPerson } from "@/server/admin/data";

export const generateMetadata = (): Promise<Metadata> => adminMetadata("People");

export default async function AdminPeople() {
  const { admin } = await requireAdmin();
  const [{ people, capped }, workspaces] = await Promise.all([listPeople(admin), workspaceCountsByPerson(admin)]);

  return (
    <div className="grid gap-6">
      <PageHeader title="People" description={`${people.length}${capped ? "+" : ""} ${people.length === 1 ? "account" : "accounts"}, newest first. Sign-in is by email link, so a confirmed email means they opened one.`} />
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
                  <span className="break-all font-medium">{p.email}</span>
                  {isAdminEmail(p.email) ? <Chip tone="accent">Admin</Chip> : null}
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
