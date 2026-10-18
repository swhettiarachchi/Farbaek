import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  EyeIcon,
  GearSixIcon,
  HourglassMediumIcon,
  KeyIcon,
  ListChecksIcon,
  LockSimpleIcon,
  PauseCircleIcon,
  PencilSimpleLineIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AGENT_MODE_LABELS, type AgentMode } from "@/core/agent/modes";
import { COMMAND_RISK_LABELS, type CommandRisk } from "@/core/agent/commands";
import type { RunState } from "@/core/agent/operations";
import type { AppState, Profile, Provider, RunDetail, RunSummary, TaskSummary, TaskView } from "../shared/api";

const api = window.farbaek;
type View = "tasks" | "runs" | "keys" | "settings";

const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude", gemini: "Gemini" };

const STATE: Record<RunState, { label: string; icon: Icon; tone: string }> = {
  planned: { label: "Planned", icon: HourglassMediumIcon, tone: "info" },
  approved: { label: "Approved", icon: HourglassMediumIcon, tone: "info" },
  queued: { label: "Queued", icon: HourglassMediumIcon, tone: "info" },
  running: { label: "Working", icon: CircleNotchIcon, tone: "info" },
  completed: { label: "Finished", icon: CheckCircleIcon, tone: "verified" },
  failed: { label: "Stopped", icon: XCircleIcon, tone: "failed" },
  cancelled: { label: "Cancelled", icon: ProhibitIcon, tone: "neutral" },
  interrupted: { label: "Interrupted", icon: PauseCircleIcon, tone: "approval" },
};

const time = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const tokens = (n: number) => n.toLocaleString("en-US");

function Badge({ tone, icon: BadgeIcon, children, spin = false }: { tone: string; icon: Icon; children: ReactNode; spin?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      <BadgeIcon size={14} weight="bold" className={spin ? "spin" : ""} aria-hidden /> {children}
    </span>
  );
}

function StateBadge({ run }: { run: Pick<RunDetail, "state" | "discarded" | "proposal"> }) {
  if (run.discarded) return <Badge tone="neutral" icon={TrashIcon}>Discarded</Badge>;
  if (run.proposal) return <Badge tone={run.proposal.status === "pending" ? "verified" : "failed"} icon={run.proposal.status === "pending" ? CheckCircleIcon : XCircleIcon}>{run.proposal.status === "pending" ? "Submitted" : "Blocked by Farbaek"}</Badge>;
  const s = STATE[run.state];
  return (
    <Badge tone={s.tone} icon={s.icon} spin={run.state === "running"}>
      {s.label}
    </Badge>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="alert">
      <WarningCircleIcon size={18} weight="bold" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ pairing */

function PairScreen({ state, onPaired }: { state: AppState; onPaired: (s: AppState) => void }) {
  const [server, setServer] = useState("");
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
          In Farbaek, open Agents and create a pairing code. Type it here to connect this computer to your workspace. The code works once, for 10 minutes.
        </p>
        {!state.keychain.available ? <Alert>{state.keychain.reason}</Alert> : null}
        <label className="field">
          <span>Farbaek address</span>
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://farbaek.com" inputMode="url" autoComplete="off" required />
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
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ keys */

function KeysView({ state, onState }: { state: AppState; onState: (s: AppState) => void }) {
  return (
    <section className="stack">
      <header className="view-head">
        <h1>Keys</h1>
        <p className="muted">The agent calls the model with your own key. Keys are encrypted with this computer&apos;s keychain, never shown again and never sent to Farbaek, so runs don&apos;t count toward your Farbaek AI usage. Your provider bills you for what a run uses.</p>
      </header>
      {!state.keychain.available ? <Alert>{state.keychain.reason}</Alert> : null}
      {(["anthropic", "gemini"] as const).map((p) => (
        <KeyCard key={p} provider={p} set={state.keys[p]} disabled={!state.keychain.available} onState={onState} />
      ))}
    </section>
  );
}

function KeyCard({ provider, set, disabled, onState }: { provider: Provider; set: boolean; disabled: boolean; onState: (s: AppState) => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api.setKey(provider, key);
    setBusy(false);
    setKey("");
    if (r.ok) onState(r.value);
    else setError(r.message);
  }

  return (
    <form className="card stack-sm" onSubmit={(e) => void save(e)}>
      <div className="row">
        <h2>{PROVIDER_LABEL[provider]}</h2>
        {set ? (
          <Badge tone="verified" icon={CheckCircleIcon}>
            Saved in the keychain
          </Badge>
        ) : (
          <Badge tone="neutral" icon={KeyIcon}>
            Not set
          </Badge>
        )}
      </div>
      <label className="field">
        <span>{set ? "Replace the key" : "API key"}</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} disabled={disabled} placeholder={provider === "anthropic" ? "sk-ant-…" : "Your Gemini API key"} />
      </label>
      {error ? <Alert>{error}</Alert> : null}
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="submit" disabled={disabled || busy || key.trim().length === 0}>
          {busy ? "Saving…" : "Save key"}
        </button>
        {set ? (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void api.removeKey(provider).then(onState)}>
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ tasks */

const MODES: { id: AgentMode; icon: Icon }[] = [
  { id: "review_only", icon: EyeIcon },
  { id: "controlled", icon: PencilSimpleLineIcon },
  { id: "sandboxed_autopilot", icon: ShieldCheckIcon },
];
const AUTOPILOT_REASON = "Not available yet: the desktop agent can't run commands in a Farbaek sandbox until that link is built.";

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
          <p className="muted">Tasks in {state.paired?.workspaceName} whose contract is approved and that are waiting for a change.</p>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void load()}>
          <ArrowClockwiseIcon size={16} aria-hidden /> Refresh
        </button>
      </header>
      {error ? <Alert>{error}</Alert> : null}
      {profile && !profile.canPropose ? <Alert>You can only view this workspace, so the agent can&apos;t propose changes. Ask an owner for a member role.</Alert> : null}
      {tasks === null && !error ? <p className="muted">Loading tasks…</p> : null}
      {tasks?.length === 0 ? (
        <div className="empty">
          <ListChecksIcon size={28} aria-hidden />
          <h2>No tasks are waiting for a change</h2>
          <p className="muted">In Farbaek, approve a task&apos;s intent contract. It then shows here for the agent to work on.</p>
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
      {selected ? <TaskPanel key={selected} taskId={selected} state={state} profile={profile} onRunStarted={onRunStarted} /> : null}
    </section>
  );
}

function TaskPanel({ taskId, state, profile, onRunStarted }: { taskId: string; state: AppState; profile: Profile | null; onRunStarted: (runId: string) => void }) {
  const [task, setTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>("review_only");
  const [provider, setProvider] = useState<Provider>(state.keys.anthropic || !state.keys.gemini ? "anthropic" : "gemini");
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
        ? "Your role can't propose changes."
        : !state.keys[provider]
          ? `Add your ${PROVIDER_LABEL[provider]} key in Keys first.`
          : null;

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api.startRun({ taskId, mode, provider });
    setBusy(false);
    if (r.ok) onRunStarted(r.value.runId);
    else setError(r.message);
  }

  return (
    <div className="card stack-sm">
      {task ? (
        <>
          <div>
            <p className="eyebrow">{"// "}{task.projectName}</p>
            <h2>{task.title}</h2>
          </div>
          {task.contract ? (
            <dl className="contract">
              <dt>Outcome</dt>
              <dd>{task.contract.outcome}</dd>
              <dt>In scope</dt>
              <dd className="mono small">{task.contract.resources.join(", ") || "Not limited by path"}</dd>
              <dt>Allowed</dt>
              <dd className="mono small">{task.contract.allowed.join(", ")}</dd>
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
              <dt>Contract</dt>
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
                    {unavailable ? <LockSimpleIcon size={18} aria-hidden /> : <m.icon size={18} aria-hidden />} {AGENT_MODE_LABELS[m.id].title}
                  </span>
                  <span className="muted small">{unavailable ? AUTOPILOT_REASON : AGENT_MODE_LABELS[m.id].detail}</span>
                </label>
              );
            })}
          </fieldset>
          <label className="field field-inline">
            <span>Model</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              {(["anthropic", "gemini"] as const).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                  {state.keys[p] ? "" : " (no key yet)"}
                </option>
              ))}
            </select>
          </label>
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
          <ClockCounterClockwiseIcon size={28} aria-hidden />
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
                  {AGENT_MODE_LABELS[r.mode].title} · {PROVIDER_LABEL[r.provider]} · {time(r.startedAt)}
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

function RunPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const total = run.usage.inputTokens + run.usage.outputTokens;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await api.submitRun(runId);
    setBusy(false);
    if (r.ok) setRun(r.value);
    else setError(r.message);
  }

  return (
    <div className="card stack-sm run">
      <div className="row">
        <div>
          <p className="eyebrow">{"// "}{run.projectName}</p>
          <h2>{run.taskTitle}</h2>
        </div>
        <StateBadge run={run} />
      </div>
      <p className="muted small mono">
        {AGENT_MODE_LABELS[run.mode].title} · {run.model} · {tokens(total)} tokens ({tokens(run.usage.inputTokens)} in, {tokens(run.usage.outputTokens)} out)
      </p>
      {run.mode === "controlled" ? (
        <p className="tag-local">
          <TerminalWindowIcon size={16} aria-hidden /> Commands run on this computer, not isolated.
        </p>
      ) : null}
      {run.outcome ? <p>{run.outcome}</p> : null}

      {run.pendingApproval ? <ApprovalCard run={run} /> : null}

      {working ? (
        <div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void api.cancelRun(run.id)}>
            <ProhibitIcon size={16} aria-hidden /> Cancel run
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
          <p>
            {run.proposal.status === "pending" ? "Farbaek checked the change and it's waiting for review." : "Farbaek checked the change and blocked it."} Policy: <span className="mono small">{run.proposal.policy}</span>.
          </p>
          {run.proposal.violations.length ? (
            <ul className="bullets">
              {run.proposal.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void api.openTaskInFarbaek(run.taskId)}>
              <ArrowSquareOutIcon size={16} aria-hidden /> Review it in Farbaek
            </button>
          </div>
        </div>
      ) : null}
      {!run.discarded ? (
        <div className="row-start">
          {run.state === "completed" && !run.proposal && run.changes.length > 0 ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit to Farbaek for review"}
            </button>
          ) : null}
          {!working ? (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void api.discardRun(run.id)}>
              <TrashIcon size={16} aria-hidden /> Discard run
            </button>
          ) : null}
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
                <p>
                  <span className={`dot dot-${e.status}`} aria-hidden /> <span className="mono small">{e.tool}</span> <span className="mono small muted">{e.target}</span>{" "}
                  <span className="small">{e.status === "done" ? "" : `· ${e.status}: ${e.detail.slice(0, 200)}`}</span>
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
  const answer = (approved: boolean) => {
    setBusy(true);
    void api.answerApproval({ runId: run.id, requestId: req.id, approved, bindingHash: req.bindingHash });
  };
  return (
    <div className="approval" role="region" aria-label="Approval needed">
      <p className="row-start">
        <HourglassMediumIcon size={18} weight="bold" aria-hidden /> <strong>The agent wants to run a command</strong>
      </p>
      <pre className="command">{req.display}</pre>
      <dl className="contract">
        <dt>Risk</dt>
        <dd>{COMMAND_RISK_LABELS[req.risk as CommandRisk] ?? req.risk}</dd>
        <dt>Why Farbaek asks</dt>
        <dd>{req.reason}</dd>
        <dt>The model says</dt>
        <dd className="muted">{req.why}</dd>
        <dt>Where</dt>
        <dd>{req.where === "local" ? "On this computer, not isolated" : "In a Farbaek sandbox"}</dd>
        <dt>Approval covers</dt>
        <dd className="mono small">This exact command only · {req.bindingHash.slice(0, 12)}…</dd>
      </dl>
      <div className="row-start">
        <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => answer(true)}>
          Run it
        </button>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => answer(false)}>
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
      <div className="card stack-sm">
        <h2>Unpair this computer</h2>
        <p className="muted">Revokes this computer&apos;s agent token in Farbaek and forgets it here. Your keys and past runs stay on this computer until you remove them.</p>
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

/* ------------------------------------------------------------------ shell */

const NAV: { id: View; label: string; icon: Icon }[] = [
  { id: "tasks", label: "Tasks", icon: ListChecksIcon },
  { id: "runs", label: "Runs", icon: ClockCounterClockwiseIcon },
  { id: "keys", label: "Keys", icon: KeyIcon },
  { id: "settings", label: "Settings", icon: GearSixIcon },
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("tasks");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  useEffect(() => {
    void api.state().then(setState);
    void api.runs().then(setRuns);
    return api.onRunUpdate(() => void api.runs().then(setRuns));
  }, []);

  if (!state) return <main className="pair muted">Loading…</main>;
  if (!state.paired) return <PairScreen state={state} onPaired={setState} />;
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
                  <n.icon size={19} weight={view === n.id ? "fill" : "regular"} aria-hidden /> {n.label}
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
        ) : view === "keys" ? (
          <KeysView state={state} onState={setState} />
        ) : (
          <SettingsView state={state} onState={setState} />
        )}
      </main>
    </div>
  );
}
