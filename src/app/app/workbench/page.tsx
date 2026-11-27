import { redirect } from "next/navigation";
import { BUILD_START } from "@/core/agent/build-surface";

/**
 * Build's workspace is for one project (`/app/workbench/<project>`, ADR 0219). Its own starting page became Build's one
 * start in stage 286 (ADR 0294): the box and the projects to open are there, so this address leads to it.
 */
export default function WorkbenchIndexPage() {
  redirect(BUILD_START);
}
