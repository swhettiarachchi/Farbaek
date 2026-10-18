import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreateOrganizationForm } from "@/components/app/forms";
import { Card, PageHeader } from "@/components/app/primitives";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const ctx = await loadAppContext();
  if (!ctx || ctx.mode === "demo") notFound();

  return (
    <div className="grid max-w-xl gap-8">
      <PageHeader
        title="New workspace"
        description="A separate workspace with its own projects, people and plan. Each person gets one trial; later workspaces start on Free."
      />
      <Card>
        <CreateOrganizationForm />
      </Card>
    </div>
  );
}
