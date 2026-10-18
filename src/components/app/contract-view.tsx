import { CheckCircleIcon, QuestionIcon, ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocalTime } from "@/components/ui/local-time";
import { contractHash } from "@/core/realityloop/contract";
import { shortHash } from "@/core/trust/canonical-json";
import type { ContractRecord } from "@/server/workspace/types";

function Clause({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-[15px] text-ink">{children}</dd>
    </div>
  );
}

const Mono = ({ items }: { items: string[] }) =>
  items.length ? (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <code key={i} className="rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-[12.5px]">
          {i}
        </code>
      ))}
    </span>
  ) : (
    <span className="text-ink-3">None</span>
  );

const List = ({ items }: { items: string[] }) =>
  items.length ? (
    <ul className="grid gap-1">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  ) : (
    <span className="text-ink-3">None</span>
  );

/** A stored contract version, with its hash re-computed on every render. */
export async function ContractView({ record }: { record: ContractRecord }) {
  const c = record.body;
  const recomputed = await contractHash(c);
  const intact = recomputed === record.sha256;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-3">contract v{record.version}</span>
        {record.status === "approved" ? (
          <StatusBadge status="verified" label="Approved" />
        ) : record.status === "draft" ? (
          <StatusBadge status="approval" label="Draft, not approved" />
        ) : (
          <StatusBadge status="unverified" label="Superseded" />
        )}
        <span className={`inline-flex items-center gap-1 text-xs ${intact ? "text-verified" : "text-failed"}`}>
          {intact ? <ShieldCheckIcon size={14} weight="bold" aria-hidden /> : <WarningIcon size={14} weight="bold" aria-hidden />}
          {intact ? `Hash checks out: ${shortHash(record.sha256)}` : "Stored hash doesn't match the contract. Don't approve it."}
        </span>
      </div>
      <p className="mt-3 text-lg font-medium leading-snug">{c.outcome}</p>
      <p className="mt-1 text-xs text-ink-3">
        Written <LocalTime iso={record.createdAt} />
        {record.approvedAt ? (
          <>
            {" "}
            · approved <LocalTime iso={record.approvedAt} />
          </>
        ) : null}
      </p>

      <dl className="mt-4">
        <Clause label="Resources">
          <Mono items={c.scope.resources} />
        </Clause>
        <Clause label="Allowed">
          <Mono items={c.allowedOperations} />
        </Clause>
        <Clause label="Forbidden">
          <Mono items={c.forbiddenOperations} />
        </Clause>
        <Clause label="Protected fields">
          <Mono items={c.protectedFields} />
        </Clause>
        <Clause label="Invariants">
          <List items={c.protectedInvariants.map((i) => i.statement)} />
        </Clause>
        <Clause label="Acceptance">
          <ul className="grid gap-1.5">
            {c.acceptanceCriteria.map((a) => (
              <li key={a.id} className="flex gap-2">
                <CheckCircleIcon size={17} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>
                  {a.statement} <span className="font-mono text-xs text-ink-3">{a.verification}</span>
                </span>
              </li>
            ))}
          </ul>
        </Clause>
        <Clause label="Required checks">
          <Mono items={c.requiredChecks} />
        </Clause>
        <Clause label="Limits">
          {c.limits.maxRecords || c.limits.maxRetries !== undefined ? (
            <span>
              {c.limits.maxRecords ? `At most ${c.limits.maxRecords} records. ` : ""}
              {c.limits.maxRetries !== undefined ? `At most ${c.limits.maxRetries} retries.` : ""}
            </span>
          ) : (
            <span className="text-ink-3">None</span>
          )}
        </Clause>
        {c.assumptions.length ? (
          <Clause label="Assumptions">
            <List items={c.assumptions} />
          </Clause>
        ) : null}
        {c.openQuestions.length ? (
          <Clause label="Open questions">
            <span className="flex items-start gap-2 text-approval">
              <QuestionIcon size={17} className="mt-0.5 shrink-0" aria-hidden />
              <List items={c.openQuestions} />
            </span>
          </Clause>
        ) : null}
        <Clause label="Recovery">{c.recovery}</Clause>
      </dl>
    </div>
  );
}

export async function contractIntact(record: ContractRecord): Promise<boolean> {
  return (await contractHash(record.body)) === record.sha256;
}
