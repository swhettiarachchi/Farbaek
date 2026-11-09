import { CheckSquareOffsetIcon, QuestionIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocalTime } from "@/components/ui/local-time";
import { contractHash } from "@/core/realityloop/contract";
import type { ContractRecord } from "@/server/workspace/types";

/** How each acceptance criterion is checked, in words. */
const VERIFICATION_WORDS: Record<string, string> = { test: "by a test", assertion: "by an assertion", read_back: "by reading it back", manual: "by a person" };

const OPERATION_WORDS: Record<string, string> = {
  "files.create": "Add new files",
  "files.edit": "Edit files",
  "files.delete": "Delete files",
};
/** A plan's operation in words; one Farbaek doesn't name stays as it was written. */
export const sayOperation = (op: string) => OPERATION_WORDS[op] ?? op;

function Clause({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-[0.9375rem] text-ink">{children}</dd>
    </div>
  );
}

/** Mono only for something that reads as a path or a command; a word like "products" is a word (ADR 0180). */
const looksLikeCode = (s: string) => /[/.\\:_]/.test(s) && !/\s[a-z]+\s/.test(s);

const Mono = ({ items }: { items: string[] }) =>
  items.length ? (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) =>
        looksLikeCode(i) ? (
          <code key={i} className="max-w-full break-all rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-[0.78125rem]">
            {i}
          </code>
        ) : (
          <span key={i} className="rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-[0.8125rem]">
            {i}
          </span>
        ),
      )}
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
        <span className="text-[0.8125rem] font-medium text-ink-3">Version {record.version}</span>
        {record.status === "approved" ? (
          <StatusBadge status="verified" label="Approved" />
        ) : record.status === "draft" ? (
          <StatusBadge status="approval" label="Draft, not approved" />
        ) : (
          <StatusBadge status="off" label="Replaced by a newer version" />
        )}
        <span className={`inline-flex items-center gap-1 text-xs ${intact ? "text-verified" : "text-failed"}`}>
          {intact ? <ShieldCheckIcon size={14} weight="fill" className="shrink-0" aria-hidden /> : <WarningCircleIcon size={14} weight="fill" className="shrink-0" aria-hidden />}
          {intact ? <span title={`sha256:${record.sha256}`}>Unchanged since it was written</span> : "This doesn't match what was saved. Don't approve it."}
        </span>
      </div>
      <p className="mt-3 text-lg font-medium leading-snug">{c.outcome}</p>
      <p className="mt-1 text-xs text-ink-3">
        Written <LocalTime iso={record.createdAt} />
        {record.approvedAt ? (
          <>
            , approved <LocalTime iso={record.approvedAt} />
          </>
        ) : null}
      </p>

      <dl className="mt-4">
        <Clause label="What it can change">
          <Mono items={c.scope.resources} />
        </Clause>
        <Clause label="Allowed">
          <Mono items={c.allowedOperations.map(sayOperation)} />
        </Clause>
        <Clause label="Not allowed">
          <Mono items={c.forbiddenOperations.map(sayOperation)} />
        </Clause>
        <Clause label="Protected fields">
          <Mono items={c.protectedFields} />
        </Clause>
        <Clause label="Must stay true">
          <List items={c.protectedInvariants.map((i) => i.statement)} />
        </Clause>
        <Clause label="Done when">
          <ul className="grid gap-1.5">
            {c.acceptanceCriteria.map((a) => (
              <li key={a.id} className="flex gap-2">
                <CheckSquareOffsetIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3" aria-hidden />
                <span>
                  {a.statement} <span className="text-[0.8125rem] text-ink-3">({VERIFICATION_WORDS[a.verification] ?? a.verification})</span>
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
          // Open questions need a person to answer them, so each carries the "your turn" blue (ADR 0183).
          <Clause label="Open questions">
            <ul className="grid gap-1.5">
              {c.openQuestions.map((q) => (
                <li key={q} className="flex gap-2">
                  <QuestionIcon size={16} weight="bold" className="mt-1 shrink-0 text-approval" aria-hidden />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </Clause>
        ) : null}
        <Clause label="If you need to undo it">{c.recovery}</Clause>
      </dl>
    </div>
  );
}

export async function contractIntact(record: ContractRecord): Promise<boolean> {
  return (await contractHash(record.body)) === record.sha256;
}
