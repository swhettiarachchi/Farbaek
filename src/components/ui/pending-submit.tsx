"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses } from "@/components/ui/button";

/** A form's submit button that says what's happening while the server works, so nobody presses twice. */
export function PendingSubmit({ label, pending, variant = "primary", disabledReason }: { label: string; pending: string; variant?: "primary" | "secondary"; disabledReason?: string | null }) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending || Boolean(disabledReason)} title={disabledReason ?? undefined} className={buttonClasses(variant, "sm")}>
      {status.pending ? pending : label}
    </button>
  );
}
