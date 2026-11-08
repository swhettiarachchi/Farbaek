import { isNewerVersion } from "@/core/agent/app-version";
import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
  BroadcastIcon,
  ClockCounterClockwiseIcon,
  EyeIcon,
  GearSixIcon,
  ListChecksIcon,
  LockSimpleIcon,
  PencilSimpleLineIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AGENT_MODE_LABELS, type AgentMode } from "@/core/agent/modes";
import { COMMAND_RISK_LABELS, type CommandRisk } from "@/core/agent/commands";
import type { RunState } from "@/core/agent/operations";
import { EFFORTS, EFFORT_LABELS, type Effort } from "@/core/agent/routing";
import { TOOL_VERB, toolTarget } from "@/core/agent/run-phase";
import { modelName } from "@/core/billing/model-names";
import { approvalWindow } from "@/core/trust/approval-wallet";
import { shortHash } from "@/core/trust/canonical-json";
import { relativeLabel, useNow } from "@/components/ui/use-now";
import type { AgentHandoff, AppState, HandoffRun, McpCheck, McpServerSetting, Profile, ProposalReview, RunDetail, RunSummary, TaskSummary, TaskView } from "../shared/api";
import { NearbyView } from "./nearby";
import { Alert, Notice, StatusBadge, StatusGlyph, type Status } from "./status";

const api = window.farbaek;
type View = "tasks" | "runs" | "nearby" | "settings";

// Every state has its kind (ADR 0183), so each has its own icon, colour and border, as on the web's runs.
// A finished run has no proof behind it yet, so it's "done", not "verified": verified is the ProofPack's word.
const STATE: Record<RunState, { label: string; kind: Status }> = {
  planned: { label: "Planned", kind: "pending" },
  approved: { label: "Approved", kind: "pending" },
  queued: { label: "Queued", kind: "pending" },
  running: { label: "Working", kind: "working" },
  completed: { label: "Finished", kind: "done" },
  failed: { label: "Stopped", kind: "failed" },
  cancelled: { label: "Cancelled", kind: "off" },
  interrupted: { label: "Interrupted", kind: "paused" },
};

/** How a step that touched the files ended, as its kind's icon: through, not allowed by a rule, declined, or failed. */
const TOOL_KIND: Record<"done" | "denied" | "declined" | "failed", Status> = { done: "done", denied: "blocked", declined: "off", failed: "failed" };

const time = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const tokens = (n: number) => n.toLocaleString("en-US");

/** Where a checked proposal stands, as one badge (ADR 0042). */
function reviewBadge(review: ProposalReview, now: number): { kind: Status; label: string } {
  if (review.matchesSent === false) return { kind: "failed", label: "Doesn't match what was sent" };
  if (review.status === "applied") {
    const pack = review.proofPack?.status;
    if (pack === "verified") return { kind: "verified", label: "Verified" };
    if (pack === "failed") return { kind: "failed", label: "Checks failed" };
    if (pack === "partially_verified") return { kind: "attention", label: "Partly verified" };
    // Applied but not verified is a "not yet": the dashed circle and border say so, never a check.
    return { kind: "unverified", label: "Applied, not verified" };
  }
  if (review.status === "discarded") return { kind: "off", label: "Discarded in Farbaek" };
  if (review.status === "blocked") return { kind: "blocked", label: "Blocked by Farbaek" };
  return approvalWindow(review.checkedAt, review.expiresAt, new Date(now)).state === "expired"
    ? { kind: "off", label: "Expired" }
    : { kind: "approval", label: "Waiting for review" };
}

function StateBadge({ run }: { run: Pick<RunDetail, "state" | "discarded" | "proposal"> }) {
  // This app has no server render, so the fallback time is never drawn.
  const now = useNow(0);
  if (run.discarded) return <StatusBadge kind="off">Discarded</StatusBadge>;
  if (run.proposal?.review) {
    const b = reviewBadge(run.proposal.review, now);
    return <StatusBadge kind={b.kind}>{b.label}</StatusBadge>;
  }
  // Submitted is waiting for a person in Farbaek: their turn, in the blue of "your turn".
  if (run.proposal) return run.proposal.status === "pending" ? <StatusBadge kind="approval">Submitted</StatusBadge> : <StatusBadge kind="blocked">Blocked by Farbaek</StatusBadge>;
  const s = STATE[run.state];
  return <StatusBadge kind={s.kind}>{s.label}</StatusBadge>;
}

/** A plan's operations in words, as the web's plan shows them; one Farbaek doesn't name stays as it was written. */
const OPERATION_WORDS: Record<string, string> = { "files.create": "Add new files", "files.edit": "Edit files", "files.delete": "Delete files" };
const sayOperation = (op: string) => OPERATION_WORDS[op] ?? op;

/** Mono only for something that reads as a path; a word like "products" is a word (ADR 0180). */
const looksLikePath = (s: string) => /[/.\\:_]/.test(s) && !/\s[a-z]+\s/.test(s);

/** A lease within 14 days of its end (ADR 0117), the same warning the Agents page shows. */
function leaseEndsSoon(expiresAt: string): boolean {
  const left = Date.parse(expiresAt) - Date.now();
  return Number.isFinite(left) && left < 14 * 86_400_000;
}

/* ------------------------------------------------------------------ pairing */

function PairScreen({ state, onPaired, onNearby }: { state: AppState; onPaired: (s: AppState) => void; onNearby: () => void }) {
  const [server, setServer] = useState("https://www.farbaek.com");
  const [code, setCode] = useState("");
  const [name, setName] = useState(state.computerName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api.pair({ server, code, name });
    setBusy(false);
    if (r.ok) onPaired(r.value);
    else setError(r.message);
  }

  return (
    <main className="pair">
      <form className="card pair-card" onSubmit={(e) => void submit(e)}>
        <img src="./logo.webp" alt="Farbaek" className="pair-logo" />
        <h1>Pair this computer</h1>
        <p className="muted">
          In Farbaek, open the Desktop app page and create a pairing code. Type it here to connect this computer to your workspace. The code works once, for 10 minutes.
        </p>
        {!state.keychain.available ? <Alert>{state.keychain.reason}</Alert> : null}
        <label className="field">
          <span>Farbaek address</span>
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://www.farbaek.com" inputMode="url" autoComplete="off" required />
        </label>
        <label className="field">
          <span>Pairing code</span>
          <input className="mono code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-23456" autoComplete="off" spellCheck={false} required />
        </label>
        <label className="field">
          <span>Name for this computer</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        {error ? <Alert>{error}</Alert> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || !state.keychain.available}>
          {busy ? "Pairing…" : "Pair"}
        </button>
        <p className="small muted pair-alt">
          Only moving files between your computers?{" "}
          <button className="link-button" type="button" onClick={onNearby}>
            Use Nearby without pairing
          </button>
        </p>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ tasks */

const MODES: { id: AgentMode; icon: Icon }[] = [
  { id: "review_only", icon: EyeIcon },
  { id: "controlled", icon: PencilSimpleLineIcon },
  { id: "sandboxed_autopilot", icon: ShieldCheckIcon },
];
const AUTOPILOT_REASON = "Not available yet: the desktop agent can't run commands in a Farbaek test space until that link is built.";

/**
 * Continue on my computer (ADR 0139): tasks handed here from a phone or
 * browser. Nothing runs until the person here starts one; each shows the
 * commands it will run first.
 */
function HandoffsPanel() {
  const [list, setList] = useState<AgentHandoff[] | null>(null);
  const [runs, setRuns] = useState<HandoffRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  // A list that can't load (offline, or a Farbaek without handoffs yet) shows nothing; only starting one reports an error.
  const refresh = useCallback(async () => {
    const [h, r] = await Promise.all([api.handoffs(), api.handoffRuns()]);
    if (h.ok) setList(h.value);
    setRuns(r);
  }, []);

  useEffect(() => {
    let live = true;
    const tick = () =>
      void Promise.all([api.handoffs(), api.handoffRuns()]).then(([h, r]) => {
        if (!live) return;
        if (h.ok) setList(h.value);
        setRuns(r);
      });
    tick();
    // New handoffs arrive from Farbaek; a running one changes here.
    const timer = window.setInterval(tick, 5_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  const shown = [...(list ?? []).map((h) => h.id), ...runs.map((r) => r.id)].filter((id, i, all) => all.indexOf(id) === i);
  if (shown.length === 0) return error ? <Alert>{error}</Alert> : null;

  async function start(id: string) {
    setError(null);
    const r = await api.startHandoff(id);
    if (!r.ok) setError(r.message);
    await refresh();
  }

  return (
    <div className="card stack-sm">
      <h2>From your phone or browser</h2>
      <p className="muted small">
        Tasks you sent to this computer. Each runs the listed checks on a copy of the project with the change waiting for review written in, on this computer and not
        isolated, only when you start it here. The results go back to Farbaek, labelled as reported by this computer.
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <ul className="list">
        {shown.map((id) => {
          const h = list?.find((x) => x.id === id) ?? null;
          const run = runs.find((r) => r.id === id) ?? null;
          return (
            <li key={id} className="handoff stack-sm">
              <p className="row">
                <strong>{h?.taskTitle ?? "Handoff"}</strong>
                {h ? <span className="muted small">{h.projectName}</span> : null}
              </p>
              {h?.note ? <p className="small">Your note: {h.note}</p> : null}
              {h ? (
                <div className="small">
                  <p className="muted">{"These run the project's own code on this computer, so start it only if you trust the project. If it needs packages, they're installed first, without running their install scripts."}</p>
                  <p className="muted">{h.proposal ? "With the change waiting for review. It runs:" : "There's no change waiting, so it runs on the project as it is:"}</p>
                  <ul className="mono">
                    {h.checks.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {run?.step ? <p className="small">{run.step}…</p> : null}
              {run && run.checks.length > 0 ? (
                <ul className="small checks">
                  {run.checks.map((c, i) => (
                    <li key={`${c.command}-${i}`}>
                      <StatusGlyph kind={c.skipped ? "unverified" : c.timedOut ? "attention" : c.exitCode === 0 ? "verified" : "failed"} size={14} /> <span className="mono">{c.command}</span>: {c.skipped ? `didn't run (${c.skipped})` : c.timedOut ? "ran out of time" : c.exitCode === 0 ? "passed" : `failed (exit ${c.exitCode})`}
                    </li>
                  ))}
                </ul>
              ) : null}
              {run?.message ? (
                <p className="small">
                  {run.message}
                  {run.digest ? <span className="mono"> sha256:{run.digest.slice(0, 12)}</span> : null}
                </p>
              ) : null}
              {h && run?.state !== "running" && run?.state !== "reported" ? (
                <div className="row-start">
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => void start(id)}>
                    Run the checks here
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TasksView({ state, onRunStarted }: { state: AppState; onRunStarted: (runId: string) => void }) {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [t, p] = await Promise.all([api.tasks(), api.profile()]);
    if (t.ok) setTasks(t.value);
    else setError(t.message);
    if (p.ok) setProfile(p.value);
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([api.tasks(), api.profile()]).then(([t, p]) => {
      if (!live) return;
      if (t.ok) setTasks(t.value);
      else setError(t.message);
      if (p.ok) setProfile(p.value);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="stack">
      <header className="view-head row">
        <div>
          <h1>Tasks</h1>
          <p className="muted">Tasks in {state.paired?.workspaceName} whose plan is approved and that are waiting for a change.</p>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void load()}>
          <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Refresh
        </button>
      </header>
      {error ? <Alert>{error}</Alert> : null}
      {profile?.latestVersion && isNewerVersion(profile.latestVersion, state.version) ? (
        <Notice tone="warning">Version {profile.latestVersion} of this app is out, with safety fixes. Get it from the Desktop app page in Farbaek. If you installed it from the Microsoft Store, it updates by itself.</Notice>
      ) : null}
      <HandoffsPanel />
      {profile && !profile.canPropose ? (
        <Notice>
          {profile.lease && !profile.lease.capabilities.includes("propose")
            ? "This computer's access doesn't include suggesting changes. An owner, an admin or the person who paired it can change that on the Desktop app page in Farbaek."
            : "You can only view this workspace, so the agent can't suggest changes. Ask an owner for a member role."}
        </Notice>
      ) : null}
      {profile?.lease && leaseEndsSoon(profile.lease.expiresAt) ? (
        <Notice tone="warning">This computer&apos;s access ends on {time(profile.lease.expiresAt)}. Renew it on the Desktop app page in Farbaek to keep the agent working.</Notice>
      ) : null}
      {tasks === null && !error ? <p className="muted">Loading tasks…</p> : null}
      {tasks?.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <ListChecksIcon size={24} aria-hidden />
          </span>
          <h2>No tasks are waiting for a change</h2>
          <p className="muted">In Farbaek, approve a task&apos;s plan. It then shows here for the agent to work on.</p>
        </div>
      ) : null}
      {tasks && tasks.length > 0 ? (
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" className={`list-item ${selected === t.id ? "is-selected" : ""}`} onClick={() => setSelected(t.id)}>
                <span className="list-title">{t.title}</span>
                <span className="muted small">
                  {t.projectName} · updated {time(t.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? <TaskPanel key={selected} taskId={selected} profile={profile} localModel={state.localModel} onRunStarted={onRunStarted} /> : null}
    </section>
  );
}

function TaskPanel({ taskId, profile, localModel, onRunStarted }: { taskId: string; profile: Profile | null; localModel: AppState["localModel"]; onRunStarted: (runId: string) => void }) {
  const [task, setTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>("review_only");
  const [effort, setEffort] = useState<Effort>("balanced");
  const [model, setModel] = useState<"farbaek" | "local">("farbaek");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void api.task(taskId).then((r) => {
      if (!live) return;
      if (r.ok) setTask(r.value);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [taskId]);

  const blocked = !task
    ? "Loading the task…"
    : !task.ready || !task.contract
      ? "This task isn't waiting for a change anymore. Refresh the list."
      : profile && !profile.canPropose
        ? profile.lease && !profile.lease.capabilities.includes("propose")
          ? "This computer's access doesn't include suggesting changes."
          : "Your role can't suggest changes."
        : null;

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api.startRun({ taskId, mode, effort, model: localModel ? model : "farbaek" });
    setBusy(false);
    if (r.ok) onRunStarted(r.value.runId);
    else setError(r.message);
  }

  return (
    <div className="card stack-sm">
      {task ? (
        <>
          <div>
            <p className="muted small">{task.projectName}</p>
            <h2>{task.title}</h2>
          </div>
          {task.contract ? (
            <dl className="contract">
              <dt>Outcome</dt>
              <dd>{task.contract.outcome}</dd>
              <dt>In scope</dt>
              <dd className="small">
                {task.contract.resources.length
                  ? task.contract.resources.map((r, i) => (
                      <span key={r}>
                        {i > 0 ? ", " : null}
                        {looksLikePath(r) ? <span className="mono">{r}</span> : r}
                      </span>
                    ))
                  : "Not limited by path"}
              </dd>
              <dt>Allowed</dt>
              <dd className="small">{task.contract.allowed.map(sayOperation).join(", ")}</dd>
              {task.contract.acceptance.length ? (
                <>
                  <dt>Done when</dt>
                  <dd>
                    <ul className="bullets">
                      {task.contract.acceptance.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : null}
              <dt>Plan</dt>
              <dd className="muted small">
                Version {task.contract.version} · {task.fileCount} files in the project
              </dd>
            </dl>
          ) : null}
          <fieldset className="modes">
            <legend>Mode</legend>
            {MODES.map((m) => {
              const unavailable = m.id === "sandboxed_autopilot";
              return (
                <label key={m.id} className={`mode ${mode === m.id ? "is-selected" : ""} ${unavailable ? "is-disabled" : ""}`}>
                  <input type="radio" name="mode" value={m.id} checked={mode === m.id} disabled={unavailable} onChange={() => setMode(m.id)} />
                  <span className="mode-head">
                    {unavailable ? <LockSimpleIcon size={20} aria-hidden /> : <m.icon size={20} aria-hidden />} {AGENT_MODE_LABELS[m.id].title}
                  </span>
                  <span className="muted small">{unavailable ? AUTOPILOT_REASON : AGENT_MODE_LABELS[m.id].detail}</span>
                </label>
              );
            })}
          </fieldset>
          <fieldset className="effort">
            <legend>Effort</legend>
            <div className="segmented">
              {EFFORTS.map((e) => (
                <label key={e} className={`segment ${effort === e ? "is-selected" : ""}`}>
                  <input type="radio" name="effort" value={e} checked={effort === e} onChange={() => setEffort(e)} />
                  {EFFORT_LABELS[e].title}
                </label>
              ))}
            </div>
            <p className="muted small">{EFFORT_LABELS[effort].detail} Farbaek picks the model, and the run uses your workspace&apos;s AI usage. You don&apos;t need an AI account of your own.</p>
          </fieldset>
          {localModel ? (
            <fieldset className="effort">
              <legend>Model</legend>
              <div className="segmented">
                <label className={`segment ${model === "farbaek" ? "is-selected" : ""}`}>
                  <input type="radio" name="model" value="farbaek" checked={model === "farbaek"} onChange={() => setModel("farbaek")} />
                  Farbaek
                </label>
                <label className={`segment ${model === "local" ? "is-selected" : ""}`}>
                  <input type="radio" name="model" value="local" checked={model === "local"} onChange={() => setModel("local")} />
                  On this computer
                </label>
              </div>
              <p className="muted small">
                {model === "local" ? (
                  <>
                    Runs on <span className="mono">{localModel.model}</span> here. Nothing is sent to an AI service and nothing is counted against your usage; the change still goes to Farbaek for review. Results depend on the model.
                  </>
                ) : (
                  "Farbaek's AI, counted against your workspace's usage."
                )}
              </p>
            </fieldset>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          <div className="row-start">
            <button className="btn btn-primary" type="button" disabled={blocked !== null || busy} onClick={() => void start()}>
              {busy ? "Copying the project…" : "Start run"}
            </button>
            {blocked && task ? <span className="muted small">{blocked}</span> : null}
          </div>
        </>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (
        <p className="muted">Loading the task…</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ runs */

function RunsView({ runs, selected, onSelect }: { runs: RunSummary[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <section className="stack">
      <header className="view-head">
        <h1>Runs</h1>
        <p className="muted">Each run works on its own copy of the project on this computer. Nothing reaches Farbaek until you submit it.</p>
      </header>
      {runs.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <ClockCounterClockwiseIcon size={24} aria-hidden />
          </span>
          <h2>No runs yet</h2>
          <p className="muted">Start one from Tasks.</p>
        </div>
      ) : (
        <ul className="list">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className={`list-item ${selected === r.id ? "is-selected" : ""}`} onClick={() => onSelect(r.id)}>
                <span className="row">
                  <span className="list-title">{r.taskTitle}</span>
                  <StateBadge run={r} />
                </span>
                <span className="muted small">
                  {AGENT_MODE_LABELS[r.mode].title}, {EFFORT_LABELS[r.effort ?? "balanced"].title.toLowerCase()} effort. Started {time(r.startedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? <RunPanel key={selected} runId={selected} /> : null}
    </section>
  );
}

/** What Farbaek's record says about the submitted proposal, in words (ADR 0042). */
function ReviewState({ review, sentSha256 }: { review: ProposalReview; sentSha256?: string }) {
  const now = useNow(0);
  const expired = review.status === "pending" && approvalWindow(review.checkedAt, review.expiresAt, new Date(now)).state === "expired";
  const pack = review.proofPack;
  return (
    <>
      {review.matchesSent === false ? (
        <Alert>Farbaek&apos;s record of this change doesn&apos;t match what this computer sent. Don&apos;t approve it: discard it in Farbaek and start a new run.</Alert>
      ) : null}
      {expired ? (
        <p>
          Expired in Farbaek {relativeLabel(Date.parse(review.expiresAt) - now)}, so it can&apos;t be approved anymore. Discard it there, then start a new run against the files as they are now.
        </p>
      ) : review.status === "pending" ? (
        <p>
          Waiting for review in Farbaek. It can be approved until {new Date(review.expiresAt).toLocaleString()} ({relativeLabel(Date.parse(review.expiresAt) - now)}); after that it can only be discarded.
        </p>
      ) : review.status === "applied" ? (
        <p>
          Approved and applied in Farbaek{review.decidedAt ? ` on ${new Date(review.decidedAt).toLocaleString()}` : ""}.{" "}
          {pack?.status === "verified"
            ? "Its checks passed, so it's verified."
            : pack?.status === "failed"
              ? "Its checks failed: open it in Farbaek to see why and recover."
              : pack?.status === "partially_verified"
                ? "Some of its checks passed; it isn't fully verified."
                : "It isn't verified until its checks run and pass."}
        </p>
      ) : review.status === "discarded" ? (
        <p>Discarded in Farbaek. Nothing from this run was applied.</p>
      ) : (
        <p>Farbaek blocked it: it breaks the plan.</p>
      )}
      {review.matchesSent && sentSha256 ? (
        <p className="muted small">
          <ShieldCheckIcon size={14} weight="bold" className="glyph" aria-hidden /> Farbaek&apos;s record matches what this computer sent: <span className="mono">{shortHash(sentSha256, 8, 6)}</span>
        </p>
      ) : null}
      {review.appliedSha256 ? <p className="muted small mono">Approved content {shortHash(review.appliedSha256, 8, 6)}</p> : null}
      {pack ? <p className="muted small mono">ProofPack {shortHash(pack.digest, 8, 6)}</p> : null}
    </>
  );
}

/** Asks Farbaek every 30 seconds, while the proposal can still change and the window is visible. Draws nothing. */
function ProposalWatch({ runId, review }: { runId: string; review?: ProposalReview }) {
  const settled =
    review !== undefined && (review.status === "discarded" || review.status === "blocked" || (review.status === "applied" && review.proofPack !== null && review.proofPack.status !== "unverified"));
  useEffect(() => {
    if (settled) return;
    const check = () => {
      if (document.visibilityState === "visible") void api.checkProposal(runId);
    };
    check();
    const t = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [runId, settled]);
  return null;
}

function RunPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Discarding forgets the run's work on this computer, so it asks first, like Unpair does.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /** Runs a control and says why when it refuses, instead of leaving the page unchanged. */
  async function tryTo(what: () => Promise<void>, failed: string) {
    setBusy(true);
    setError(null);
    try {
      await what();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : failed);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    void api.run(runId).then((r) => live && setRun(r));
    const off = api.onRunUpdate((r) => {
      if (r.id === runId) setRun(r);
    });
    return () => {
      live = false;
      off();
    };
  }, [runId]);

  if (!run) return <p className="muted">Loading the run…</p>;
  const working = run.state === "running";
  const review = run.proposal?.review;
  const total = run.usage.inputTokens + run.usage.outputTokens;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await api.submitRun(runId);
    setBusy(false);
    if (r.ok) setRun(r.value);
    else setError(r.message);
  }

  async function checkNow() {
    setBusy(true);
    setError(null);
    const r = await api.checkProposal(runId);
    setBusy(false);
    if (r.ok) setRun(r.value);
    else setError(r.message);
  }

  return (
    <div className="card stack-sm run">
      <div className="row">
        <div>
          <p className="muted small">{run.projectName}</p>
          <h2>{run.taskTitle}</h2>
        </div>
        <StateBadge run={run} />
      </div>
      {/* One sentence, with the model by its product name (ADR 0180). */}
      <p className="muted small">
        {AGENT_MODE_LABELS[run.mode].title}. {run.model === "auto" ? "Farbaek chooses the model for each step." : `Runs on ${modelName(run.model)}.`}
        {total > 0 ? ` It has used about ${tokens(total)} tokens so far.` : ""}
      </p>
      {run.usagePercent !== null && run.usagePercent !== undefined ? (
        <p className={`small ${run.usagePercent >= 80 ? "text-caution" : "muted"}`}>Your workspace has used {run.usagePercent}% of its AI usage.</p>
      ) : null}
      {run.mode === "controlled" ? (
        <p className="tag-local">
          <TerminalWindowIcon size={16} weight="bold" aria-hidden /> Commands run on this computer, not isolated.
        </p>
      ) : null}
      {run.outcome ? <p>{run.outcome}</p> : null}

      {run.pendingApproval ? <ApprovalCard run={run} /> : null}

      {working ? (
        <div>
          <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void tryTo(() => api.cancelRun(run.id), "The run couldn't be cancelled. Try again.")}>
            <ProhibitIcon size={16} weight="bold" aria-hidden /> Cancel run
          </button>
        </div>
      ) : null}

      {run.finish ? (
        <div className="stack-sm">
          <h3>Summary</h3>
          <p>{run.finish.summary}</p>
          {run.finish.risks.length ? (
            <>
              <h3>Risks the agent flagged</h3>
              <ul className="bullets">
                {run.finish.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          {run.finish.checks.length ? (
            <>
              <h3>Checks to run</h3>
              <ul className="bullets mono small">
                {run.finish.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {run.changes.length ? (
        <div className="stack-sm">
          <h3>Files changed</h3>
          <ul className="files">
            {run.changes.map((c) => (
              <li key={c.path}>
                <span className="mono small">{c.path}</span>
                <span className="muted small">
                  {c.kind === "create" ? "New file" : "Edited"} · {tokens(c.bytes)} bytes
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {run.notProposed.length ? (
        <div className="stack-sm">
          <h3>Left out</h3>
          <ul className="files">
            {run.notProposed.map((n) => (
              <li key={n.path}>
                <span className="mono small">{n.path}</span>
                <span className="muted small">{n.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}
      {run.proposal ? (
        <div className="stack-sm">
          <ProposalWatch runId={run.id} review={review} />
          {review ? (
            <ReviewState review={review} sentSha256={run.proposal.sentSha256} />
          ) : (
            <p>
              {run.proposal.status === "pending" ? "Farbaek checked the change and it's waiting for review." : "Farbaek checked the change and blocked it."} Policy: <span className="mono small">{run.proposal.policy}</span>.
            </p>
          )}
          {run.proposal.violations.length ? (
            <ul className="bullets">
              {run.proposal.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void api.openTaskInFarbaek(run.taskId)}>
              <ArrowUpRightIcon size={16} weight="bold" aria-hidden /> {review?.status === "applied" || review?.status === "discarded" ? "Open it in Farbaek" : "Review it in Farbaek"}
            </button>{" "}
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void checkNow()}>
              <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> {busy ? "Checking…" : "Check now"}
            </button>
          </div>
          {review ? (
            <p className="muted small">
              Last checked <time dateTime={review.checkedAt}>{new Date(review.checkedAt).toLocaleTimeString()}</time>. While it can still change, this app checks every 30 seconds.
            </p>
          ) : null}
        </div>
      ) : null}
      {!run.discarded ? (
        <div className="row-start">
          {run.state === "completed" && !run.proposal && run.changes.length > 0 ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit to Farbaek for review"}
            </button>
          ) : null}
          {!working && !confirmDiscard ? (
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              <TrashIcon size={16} weight="bold" aria-hidden /> Discard run
            </button>
          ) : null}
        </div>
      ) : null}
      {confirmDiscard && !run.discarded ? (
        <div className="stack-sm">
          <p className="small">Discard this run? Its working copy on this computer is removed. Anything already sent to Farbaek stays there.</p>
          <div className="row-start">
            <button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={() => void tryTo(() => api.discardRun(run.id), "The run couldn't be discarded. Try again.").then(() => setConfirmDiscard(false))}>
              Discard it
            </button>
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => setConfirmDiscard(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      <div className="stack-sm">
        <h3>Steps</h3>
        <ol className="timeline">
          {run.events.map((e, i) => (
            <li key={i} className={`event event-${e.kind}`}>
              {e.kind === "model" ? (
                <p className="model-text">{e.text}</p>
              ) : e.kind === "tool" ? (
                // The step in words: its kind's icon (ADR 0183), a verb, the path in mono, and why when it didn't go through.
                <p className="small">
                  <StatusGlyph kind={TOOL_KIND[e.status]} size={14} /> {TOOL_VERB[e.tool] ?? e.tool.replace(/_/g, " ")}
                  {(() => {
                    const t = toolTarget(e.tool, e.target);
                    return t ? <> {t.mono ? <span className="mono">{t.text}</span> : t.text}</> : null;
                  })()}
                  {e.status === "done" ? "" : `. ${e.status === "denied" ? "Not allowed" : e.status === "declined" ? "Declined" : "Failed"}: ${e.detail.slice(0, 200)}`}
                </p>
              ) : e.kind === "approval" ? (
                <p className="small">
                  Asked to run <span className="mono">{e.display}</span>
                </p>
              ) : (
                <p className="muted small">{e.text}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ApprovalCard({ run }: { run: RunDetail }) {
  const req = run.pendingApproval!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed answer says why and frees the buttons, so the agent is never left waiting behind two dead controls.
  const answer = async (approved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.answerApproval({ runId: run.id, requestId: req.id, approved, bindingHash: req.bindingHash });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The answer didn't reach the agent. Try again.");
      setBusy(false);
    }
  };
  return (
    <div className="approval" role="region" aria-label="Approval needed">
      <p className="row-start">
        <TerminalWindowIcon size={20} aria-hidden /> <strong>The agent wants to run a command</strong>
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <pre className="command">{req.display}</pre>
      <dl className="contract">
        <dt>Risk</dt>
        <dd>{COMMAND_RISK_LABELS[req.risk as CommandRisk] ?? req.risk}</dd>
        <dt>Why Farbaek asks</dt>
        <dd>{req.reason}</dd>
        <dt>The model says</dt>
        <dd className="muted">{req.why}</dd>
        <dt>Where</dt>
        <dd>{req.where === "local" ? "On this computer, not isolated" : "In a Farbaek test space"}</dd>
        <dt>Approval covers</dt>
        <dd className="small">This exact command only</dd>
      </dl>
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void answer(true)}>
          {busy ? "Sending…" : "Run it"}
        </button>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void answer(false)}>
          Decline
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

function SettingsView({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  async function unpair() {
    const r = await api.unpair();
    if (r.ok) onState(r.value);
    else setError(r.message);
  }
  return (
    <section className="stack">
      <header className="view-head">
        <h1>Settings</h1>
      </header>
      <div className="card">
        <dl className="contract">
          <dt>Farbaek</dt>
          <dd className="mono small">{state.paired?.server}</dd>
          <dt>Workspace</dt>
          <dd>{state.paired?.workspaceName}</dd>
          <dt>This computer</dt>
          <dd>{state.paired?.agentName}</dd>
          <dt>App version</dt>
          <dd className="mono small">{state.version}</dd>
          <dt>Data folder</dt>
          <dd className="mono small break">{state.dataFolder}</dd>
        </dl>
      </div>
      <LocalModelCard state={state} onState={onState} />
      <McpServersCard state={state} onState={onState} />
      <div className="card stack-sm">
        <h2>Unpair this computer</h2>
        <p className="muted">Revokes this computer&apos;s agent token in Farbaek and forgets it here. Past runs stay on this computer until you discard them.</p>
        {error ? <Alert>{error}</Alert> : null}
        <div className="row-start">
          {confirm ? (
            <>
              <button className="btn btn-danger btn-sm" type="button" onClick={() => void unpair()}>
                Unpair now
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirm(false)}>
                Keep paired
              </button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirm(true)}>
              Unpair
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** A model on this computer (ADR 0134): the address of a local OpenAI-compatible server, and one of its models. */
function LocalModelCard({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  const [base, setBase] = useState(state.localModel?.base ?? "http://127.0.0.1:11434/v1");
  const [models, setModels] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState(state.localModel?.model ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function find() {
    setBusy(true);
    setError(null);
    const r = await api.localModels(base);
    setBusy(false);
    if (r.ok) {
      setModels(r.value);
      if (!r.value.includes(chosen)) setChosen(r.value[0] ?? "");
      if (r.value.length === 0) setError("The server answered but offers no models. Download one first, for example with ollama pull.");
    } else setError(r.message);
  }
  async function save(next: { base: string; model: string } | null) {
    setBusy(true);
    setError(null);
    const r = await api.setLocalModel(next);
    setBusy(false);
    if (r.ok) onState(r.value);
    else setError(r.message);
  }
  return (
    <div className="card stack-sm">
      <h2>A model on this computer</h2>
      <p className="muted">
        Run the agent on a model you host here, with Ollama, LM Studio or llama.cpp&apos;s server. Only an address on this computer is accepted, so your code stays here. Nothing is counted against your workspace&apos;s usage.
      </p>
      {state.localModel ? (
        <p className="small">
          In use: <span className="mono">{state.localModel.model}</span> at <span className="mono">{state.localModel.base}</span>
        </p>
      ) : null}
      <label className="field">
        <span>Address</span>
        <input className="mono" value={base} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
      </label>
      {models && models.length ? (
        <label className="field">
          <span>Model</span>
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="row-start">
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void find()}>
          {busy ? "Checking…" : "Find models"}
        </button>
        {models && chosen && !(state.localModel?.model === chosen && state.localModel.base === base.trim().replace(/\/+$/, "")) ? (
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void save({ base, model: chosen })}>
            Use {chosen}
          </button>
        ) : null}
        {state.localModel ? (
          <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void save(null)}>
            Stop using it
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** MCP servers (ADR 0148): their tools are offered in Controlled Development runs, and every call waits for the person. */
function McpServersCard({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [checked, setChecked] = useState<{ name: string; check: McpCheck } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = (): McpServerSetting => ({ name: name.trim(), command: command.trim(), args: args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean) });

  async function check(server: McpServerSetting): Promise<boolean> {
    setBusy(true);
    setError(null);
    const r = await api.checkMcpServer(server);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return false;
    }
    setChecked({ name: server.name, check: r.value });
    return true;
  }
  async function save(next: McpServerSetting[]) {
    setBusy(true);
    setError(null);
    const r = await api.setMcpServers(next);
    setBusy(false);
    if (r.ok) onState(r.value);
    else setError(r.message);
    return r.ok;
  }
  async function add() {
    const server = draft();
    if (state.mcpServers.some((s) => s.name === server.name)) return setError("Each MCP server needs its own name.");
    if (!(await check(server))) return;
    if (await save([...state.mcpServers, server])) {
      setName("");
      setArgs("");
    }
  }

  return (
    <div className="card stack-sm">
      <h2>Tools from MCP servers</h2>
      <p className="muted">
        Add an MCP server to offer its tools to the agent in Controlled Development runs. It runs on this computer, outside the project&apos;s copy and the plan&apos;s checks, so every call waits for your approval. Review Only never offers them.
      </p>
      <p className="small muted">
        The first time this agent offers new tools, Farbaek holds its AI steps until an owner or admin approves them on the Desktop app page. Runs on a model on this computer don&apos;t go through Farbaek.
      </p>
      {state.mcpServers.length > 0 ? (
        <ul className="stack-sm">
          {state.mcpServers.map((s) => (
            <li key={s.name} className="stack-sm">
              <p className="small">
                <strong>{s.name}</strong> <span className="mono">{[s.command, ...s.args].join(" ")}</span>
              </p>
              <div className="row-start">
                <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void check(s)}>
                  {busy ? "Checking…" : "Check its tools"}
                </button>
                <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => void save(state.mcpServers.filter((x) => x.name !== s.name))}>
                  Remove {s.name}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No MCP servers yet.</p>
      )}
      {checked ? (
        <div className="stack-sm" role="status">
          <p className="small">
            <StatusGlyph kind={checked.check.problems.length > 0 ? "attention" : "verified"} /> {checked.name}
            {checked.check.server ? ` (${checked.check.server.name} ${checked.check.server.version})` : ""} offers {checked.check.tools.length} {checked.check.tools.length === 1 ? "tool" : "tools"}:
          </p>
          <ul className="small stack-sm">
            {checked.check.tools.map((t) => (
              <li key={t.name}>
                <span className="mono">{t.name}</span> {t.description}
              </li>
            ))}
          </ul>
          {checked.check.problems.map((p) => (
            <p key={p} className="small muted">
              {p}
            </p>
          ))}
        </div>
      ) : null}
      {state.mcpServers.length < 5 ? (
        <>
          <label className="field">
            <span>Name</span>
            <input className="mono" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="notes" maxLength={24} spellCheck={false} />
          </label>
          <label className="field">
            <span>Program</span>
            <input className="mono" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" maxLength={64} spellCheck={false} />
          </label>
          <label className="field">
            <span>Arguments, one per line</span>
            <textarea className="mono" rows={3} value={args} onChange={(e) => setArgs(e.target.value)} placeholder={"-y\n@modelcontextprotocol/server-filesystem\nC:\\notes"} spellCheck={false} />
          </label>
        </>
      ) : (
        <p className="small muted">Five servers is the most a run starts.</p>
      )}
      {error ? <Alert>{error}</Alert> : null}
      {state.mcpServers.length < 5 ? (
        <div className="row-start">
          <button className="btn btn-primary btn-sm" type="button" disabled={busy || !name.trim() || !command.trim()} onClick={() => void add()}>
            {busy ? "Starting it…" : "Check and add"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

const NAV: { id: View; label: string; icon: Icon }[] = [
  { id: "tasks", label: "Tasks", icon: ListChecksIcon },
  { id: "runs", label: "Runs", icon: ClockCounterClockwiseIcon },
  { id: "nearby", label: "Nearby", icon: BroadcastIcon },
  { id: "settings", label: "Settings", icon: GearSixIcon },
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("tasks");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [nearbyOnly, setNearbyOnly] = useState(false);

  useEffect(() => {
    void api.state().then(setState);
    void api.runs().then(setRuns);
    return api.onRunUpdate(() => void api.runs().then(setRuns));
  }, []);

  if (!state) return <main className="pair muted">Loading…</main>;
  if (!state.paired && nearbyOnly) {
    return (
      <main className="content solo">
        <NearbyView
          intro={
            <button className="link-button" type="button" onClick={() => setNearbyOnly(false)}>
              Pair this computer with Farbaek instead
            </button>
          }
        />
      </main>
    );
  }
  if (!state.paired) return <PairScreen state={state} onPaired={setState} onNearby={() => setNearbyOnly(true)} />;
  const waiting = runs.filter((r) => r.state === "running").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <img src="./logo.webp" alt="Farbaek" className="sidebar-logo" />
        <p className="workspace">
          <span className="small muted">Workspace</span>
          <span className="workspace-name">{state.paired.workspaceName}</span>
        </p>
        <nav aria-label="App">
          <ul>
            {NAV.map((n) => (
              <li key={n.id}>
                <button type="button" className={`nav-item ${view === n.id ? "is-active" : ""}`} aria-current={view === n.id ? "page" : undefined} onClick={() => setView(n.id)}>
                  <n.icon size={20} weight={view === n.id ? "fill" : "regular"} aria-hidden /> {n.label}
                  {n.id === "runs" && waiting > 0 ? <span className="count">{waiting}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <p className="small muted sidebar-foot">{state.paired.agentName}</p>
      </aside>
      <main className="content">
        {view === "tasks" ? (
          <TasksView
            state={state}
            onRunStarted={(id) => {
              setSelectedRun(id);
              setView("runs");
              void api.runs().then(setRuns);
            }}
          />
        ) : view === "runs" ? (
          <RunsView runs={runs} selected={selectedRun} onSelect={setSelectedRun} />
        ) : view === "nearby" ? (
          <NearbyView />
        ) : (
          <SettingsView state={state} onState={setState} />
        )}
      </main>
    </div>
  );
}
