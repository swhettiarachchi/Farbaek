import { OFFICE_POLICY } from "@/config/office";
import { inputClasses, LABEL_CLASSES, textareaClasses } from "@/components/ui/field";

/** A reason for the audit log: required on every consequential office action. */
export function ReasonField({ id, label = "Reason, for the audit log" }: { id: string; label?: string }) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm">
      <span className={LABEL_CLASSES}>{label}</span>
      <textarea
        id={id}
        name="reason"
        required
        minLength={OFFICE_POLICY.reasonMin}
        maxLength={OFFICE_POLICY.reasonMax}
        rows={2}
        className={textareaClasses()}
        placeholder="What happened and why this is needed"
      />
      <span className="text-xs text-ink-3">
        {OFFICE_POLICY.reasonMin} to {OFFICE_POLICY.reasonMax} characters. Everyone who can read the audit log sees it.
      </span>
    </label>
  );
}

/** A fresh code from the authenticator app, checked in the same request as the action. */
export function StepUpField({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm">
      <span className={LABEL_CLASSES}>Code from your authenticator app</span>
      <input id={id} name="totp" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className={inputClasses("font-mono tracking-[0.3em]")} placeholder="123456" />
      <span className="text-xs text-ink-3">This action needs a fresh code, so a stolen session alone can&apos;t do it.</span>
    </label>
  );
}

export function TextField({ id, name, label, type = "text", hint, required = true, autoComplete }: { id: string; name: string; label: string; type?: string; hint?: string; required?: boolean; autoComplete?: string }) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm">
      <span className={LABEL_CLASSES}>{label}</span>
      <input id={id} name={name} type={type} required={required} autoComplete={autoComplete} className={inputClasses()} />
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
