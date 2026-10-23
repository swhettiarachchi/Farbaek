"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, HourglassMediumIcon, ProhibitIcon, XCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { SAMPLE_CONTRACT, SAMPLE_DESCRIPTION, SAMPLE_VERSIONS } from "@/content/samples";
import { checkActionAgainstContract } from "@/core/realityloop/contract";
import { approvalBindingHash, checkApprovalForExecution, type ApprovalCheck, type ApprovalRecord, type ApprovalSubject } from "@/core/trust/approval";
import { canonicalize, shortHash, type JsonValue } from "@/core/trust/canonical-json";

type HashState = { status: "pending" } | { status: "ready"; hash: string } | { status: "unavailable" };

const APPROVAL_TTL_MS = 10 * 60 * 1000;

export function ApprovalDemo() {
  const reduce = useReducedMotion();
  const ids = { count: useId(), description: useId(), price: useId() };

  const [count, setCount] = useState(100);
  const [description, setDescription] = useState(SAMPLE_DESCRIPTION);
  const [raisePrices, setRaisePrices] = useState(false);
  const [hashed, setHashed] = useState<{ key: string; hash: string | null } | null>(null);
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);
  const [lastRun, setLastRun] = useState<{ key: string; check: ApprovalCheck } | null>(null);

  const action = useMemo(() => {
    const fields: Record<string, JsonValue> = { description };
    if (raisePrices) fields.price = { adjust: "+5%" };
    return { operation: "products.update", target: { collection: "products", count }, fields };
  }, [count, description, raisePrices]);
  const subject: ApprovalSubject = useMemo(() => ({ action, ...SAMPLE_VERSIONS }), [action]);
  const canonical = useMemo(() => canonicalize(subject.action), [subject]);

  const violations = useMemo(
    () => checkActionAgainstContract(SAMPLE_CONTRACT, { operation: action.operation, fields: Object.keys(action.fields), recordCount: count }),
    [action, count],
  );
  const blocked = violations.length > 0;

  // Everything derived below is keyed by the exact canonical subject, so a stale
  // hash or a stale run result is never shown against an edited payload.
  const subjectKey = useMemo(() => canonicalize(subject), [subject]);

  useEffect(() => {
    let cancelled = false;
    approvalBindingHash(subject)
      .then((h) => !cancelled && setHashed({ key: subjectKey, hash: h }))
      .catch(() => !cancelled && setHashed({ key: subjectKey, hash: null }));
    return () => {
      cancelled = true;
    };
  }, [subject, subjectKey]);

  const hash: HashState =
    hashed === null || hashed.key !== subjectKey
      ? { status: "pending" }
      : hashed.hash === null
        ? { status: "unavailable" }
        : { status: "ready", hash: hashed.hash };

  const currentHash = hash.status === "ready" ? hash.hash : null;
  const matches = approval !== null && currentHash !== null && approval.bindingHash === currentHash;
  const runKey = `${subjectKey}|${approval?.bindingHash ?? ""}`;
  const result = lastRun?.key === runKey ? lastRun.check : null;

  function approve() {
    if (!currentHash || blocked) return;
    setApproval({ id: "apr_demo", state: "approved", bindingHash: currentHash, expiresAt: new Date(Date.now() + APPROVAL_TTL_MS) });
  }

  async function run() {
    if (!approval) return;
    const key = runKey;
    setLastRun({ key, check: await checkApprovalForExecution(approval, subject, new Date()) });
  }

  function reset() {
    setCount(100);
    setDescription(SAMPLE_DESCRIPTION);
    setRaisePrices(false);
    setApproval(null);
    setLastRun(null);
  }

  const title = `Approve an update to ${count} product ${raisePrices ? "descriptions and prices" : "descriptions"}?`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr] lg:gap-6">
      {/* Proposed action */}
      <section aria-labelledby="demo-action" className="rounded-md border border-line bg-surface p-5 shadow-e2 sm:p-6">
        <h3 id="demo-action" className="text-[17px] font-medium">
          Proposed action
        </h3>
        <p className="mt-1 text-sm text-ink-2">An agent wants to run this against the sample storefront. Edit it.</p>

        <div className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <label htmlFor={ids.count} className="text-sm font-medium">
              Products to update
            </label>
            <input
              id={ids.count}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Math.trunc(Number(e.target.value) || 1))))}
              className="h-11 w-32 rounded-sm border border-line-strong bg-canvas px-3 text-base tabular"
            />
            <p className="text-xs text-ink-3">The contract allows at most {SAMPLE_CONTRACT.limits.maxRecords}.</p>
          </div>

          <div className="grid gap-2">
            <label htmlFor={ids.description} className="text-sm font-medium">
              New description
            </label>
            <textarea
              id={ids.description}
              rows={2}
              maxLength={160}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-sm border border-line-strong bg-canvas px-3 py-2.5 text-base leading-snug"
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              id={ids.price}
              type="checkbox"
              checked={raisePrices}
              onChange={(e) => setRaisePrices(e.target.checked)}
              className="mt-3 size-5 shrink-0 accent-[var(--accent)]"
            />
            <label htmlFor={ids.price} className="min-h-11 py-2.5 text-sm">
              Also raise prices by 5%
              <span className="block text-xs text-ink-3">Price is a protected field in this contract.</span>
            </label>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[13px] font-medium text-ink-3">Canonical payload (RFC 8785)</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded-sm bg-surface-raised px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-ink-2 whitespace-pre-wrap break-all">
            <code>{canonical}</code>
          </pre>
        </div>
      </section>

      {/* Approval */}
      <section aria-labelledby="demo-approval" className="flex flex-col rounded-md border border-line bg-surface p-5 shadow-e2 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-3">
            Contract version {SAMPLE_VERSIONS.contractVersion}, policy version {SAMPLE_VERSIONS.policyVersion}
          </p>
          {blocked ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-failed/40 px-2 text-xs font-medium text-failed">
              <ProhibitIcon size={14} weight="bold" aria-hidden /> Blocked
            </span>
          ) : (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-approval/40 px-2 text-xs font-medium text-approval">
              <HourglassMediumIcon size={14} weight="bold" aria-hidden /> Needs approval
            </span>
          )}
        </div>

        <h3 id="demo-approval" className="mt-4 text-xl font-medium leading-snug tracking-[-0.01em]">
          {title}
        </h3>

        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-ink-3">Binding hash of what you see</dt>
          <dd className="font-mono text-[13px] break-all text-ink" aria-live="polite">
            {hash.status === "ready" ? hash.hash : hash.status === "pending" ? "computing…" : "unavailable"}
          </dd>
        </dl>

        {hash.status === "unavailable" ? (
          <p className="mt-3 text-sm text-failed">
            This browser blocked Web Crypto on this connection (it needs HTTPS or localhost), so the demo can&apos;t compute hashes.
          </p>
        ) : null}

        {blocked ? (
          <ul className="mt-4 grid gap-2 rounded-sm border border-failed/30 bg-failed/[0.05] p-3 text-sm">
            {violations.map((v) => (
              <li key={v.kind + v.detail} className="flex gap-2">
                <XCircleIcon size={18} className="mt-px shrink-0 text-failed" aria-hidden />
                <span>{v.detail} The contract check runs before any approval is offered.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-2">Protected by the contract: {SAMPLE_CONTRACT.protectedFields.join(", ")}.</p>
        )}

        {approval ? (
          <div
            className={`mt-4 flex items-start gap-2 rounded-sm border p-3 text-sm ${
              matches ? "border-verified/40 text-ink" : "border-approval/50 text-ink"
            }`}
          >
            {matches ? (
              <CheckCircleIcon size={18} className="mt-px shrink-0 text-verified" aria-hidden />
            ) : (
              <HourglassMediumIcon size={18} className="mt-px shrink-0 text-approval" aria-hidden />
            )}
            <span>
              {matches
                ? `Approved ${shortHash(approval.bindingHash)}. It matches the payload above.`
                : `You approved ${shortHash(approval.bindingHash)}, but the payload is now ${currentHash ? shortHash(currentHash) : "different"}. That approval no longer covers it.`}
            </span>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-3 pt-6">
          <button
            type="button"
            onClick={approve}
            disabled={blocked || !currentHash || matches}
            aria-describedby={blocked ? "demo-approve-reason" : undefined}
            className={buttonClasses("primary")}
          >
            {matches ? "Approved" : "Approve this payload"}
          </button>
          <button type="button" onClick={run} disabled={!approval} className={buttonClasses("secondary")}>
            Run (demo)
          </button>
          <button type="button" onClick={reset} className={buttonClasses("ghost")}>
            <ArrowCounterClockwiseIcon size={16} aria-hidden /> Reset
          </button>
        </div>
        {blocked ? (
          <p id="demo-approve-reason" className="mt-2 text-xs text-ink-3">
            Approval is unavailable while the contract blocks this action.
          </p>
        ) : null}

        <div aria-live="polite">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.p
                key={result.valid ? "ok" : result.reason}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.1 } }}
                transition={{ duration: 0.22, ease: [0, 0, 0, 1] }}
                className={`mt-4 rounded-sm px-3 py-2.5 text-sm ${result.valid ? "bg-verified/[0.08] text-ink" : "bg-failed/[0.07] text-ink"}`}
              >
                {result.valid
                  ? "Approval matches. In Farbaek this would now run in the sandbox. Here, nothing runs."
                  : `Blocked: ${result.message}`}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
