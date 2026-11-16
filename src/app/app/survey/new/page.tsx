import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { NewSurveyProjectForm } from "@/components/survey/forms";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New survey project" };

export default async function NewSurveyProjectPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  return (
    <div className="grid max-w-2xl gap-6 lg:gap-8">
      <PageHeader title="New survey project" description="Name it and confirm the coordinate system your points are in. Next you import them." />
      <Card>
        <NewSurveyProjectForm disabledReason={surveyReadOnlyReason(ctx)} />
      </Card>
    </div>
  );
}
