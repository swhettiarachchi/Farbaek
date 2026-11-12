"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  DeviceMobileIcon,
  FileTextIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  ShareNetworkIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LOGO } from "@/components/brand/brand-logo";
import { DiffView } from "@/components/code/diff-view";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { PAGE_TITLE } from "@/components/ui/titles";
import { compareLines, deviceCopyPath, dequeue, enqueue, type DeviceCopyFile, type DeviceCopyManifest, type QueuedSave, type ServerFile } from "@/core/workspace/device-copy";
import { deviceOwner, deviceStorageSupport, keptProjects, readKept, readKeptText, readSaves, recordSaved, removeKept, updateSaves } from "./device-store";
import { fetchPost, sendOne, sendSaves, type SendResult, type SendStop } from "./send-saves";
import { shareOrDownload, zipName } from "./share-copy";

type Loaded =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "nothing" }
  | { kind: "ready"; owner: string; projects: DeviceCopyManifest[]; saves: QueuedSave[] };

type View = { kind: "home" } | { kind: "project"; projectId: string } | { kind: "file"; projectId: string; path: string } | { kind: "conflict"; projectId: string; path: string };

type Outcome = { kind: "conflict"; server: ServerFile } | { kind: "refused"; message: string };
type Stop = SendStop;

const keyOf = (s: { projectId: string; path: string }) => `${s.projectId}\u0000${s.path}`;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

async function load(): Promise<Loaded> {
  const support = deviceStorageSupport();
  if (!support.ok) return { kind: "unsupported", reason: support.reason };
  const owner = await deviceOwner();
  if (!owner) return { kind: "nothing" };
  const [projects, saves] = await Promise.all([keptProjects(owner), readSaves(owner)]);
  return { kind: "ready", owner, projects, saves };
}

function viewFromUrl(projects: readonly DeviceCopyManifest[]): View {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project");
  if (!projectId || !projects.some((p) => p.projectId === projectId)) return { kind: "home" };
  const path = params.get("file");
  if (path && params.get("compare") === "1") return { kind: "conflict", projectId, path };
  return path ? { kind: "file", projectId, path } : { kind: "project", projectId };
}

function urlFor(view: View): string {
  if (view.kind === "home") return "/device";
  const params = new URLSearchParams({ project: view.projectId });
  if (view.kind === "file" || view.kind === "conflict") params.set("file", view.path);
  if (view.kind === "conflict") params.set("compare", "1");
  return `/device?${params}`;
}

/**
 * The device page (ADR 0192): projects kept in this browser, opened and
 * edited with no connection, and the saves made here, sent when the person
 * chooses. Nothing on it comes from the server until they send.
 */
export function DeviceApp() {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [view, setView] = useState<View>({ kind: "home" });
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [sending, setSending] = useState(false);
  const [stop, setStop] = useState<Stop>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const online = useOnline();

  useEffect(() => {
    let alive = true;
    load().then(
      (l) => {
        if (!alive) return;
        setLoaded(l);
        if (l.kind === "ready") setView(viewFromUrl(l.projects));
      },
      () => alive && setLoaded({ kind: "unsupported", reason: "This browser's storage couldn't be opened." }),
    );
    return () => {
      alive = false;
    };
  }, []);

  // The phone's back button walks back through the views; the handler reads the latest projects through a ref.
  const latest = useRef(loaded);
  useEffect(() => {
    latest.current = loaded;
  }, [loaded]);
  useEffect(() => {
    const onPop = () => {
      const l = latest.current;
      setView(l.kind === "ready" ? viewFromUrl(l.projects) : { kind: "home" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function go(next: View) {
    setView(next);
    window.history.pushState(null, "", urlFor(next));
    window.scrollTo({ top: 0 });
  }

  async function refresh(owner: string) {
    const [projects, saves] = await Promise.all([keptProjects(owner), readSaves(owner)]);
    setLoaded({ kind: "ready", owner, projects, saves });
  }

  /**
   * The copy moves to a revision Farbaek has, and the waiting save for that file goes, unless it was edited
   * again meanwhile. That newer edit grew out of the person's own words only when theirs is what landed
   * (`ours`), so only then does it move onto the new revision; otherwise it keeps its old one and meets
   * Farbaek's version as a conflict again.
   */
  async function landed(owner: string, sent: QueuedSave, revision: number, landedContent: string, ours: boolean) {
    await recordSaved(owner, sent.projectId, { path: sent.path, content: landedContent, revision });
    await updateSaves(owner, (q) =>
      q.flatMap((x) =>
        x.projectId === sent.projectId && x.path === sent.path ? (x.content === sent.content ? [] : [ours ? { ...x, baseRevision: revision } : x]) : [x],
      ),
    );
    setOutcomes((o) => {
      const next = { ...o };
      delete next[keyOf(sent)];
      return next;
    });
  }

  async function applyResult(owner: string, r: SendResult) {
    if (r.kind === "saved" || r.kind === "same") await landed(owner, r.save, r.revision, r.save.content, true);
    else if (r.kind === "conflict") setOutcomes((o) => ({ ...o, [keyOf(r.save)]: { kind: "conflict", server: r.server } }));
    else setOutcomes((o) => ({ ...o, [keyOf(r.save)]: { kind: "refused", message: r.message } }));
  }

  async function sendAll() {
    if (loaded.kind !== "ready") return;
    const owner = loaded.owner;
    setSending(true);
    setStop(null);
    setSentCount(null);
    let sent = 0;
    const result = await sendSaves(fetchPost, owner, loaded.saves, async (r) => {
      if (r.kind === "saved" || r.kind === "same") sent += 1;
      await applyResult(owner, r);
    });
    setStop(result);
    setSentCount(sent);
    await refresh(owner);
    setSending(false);
  }

  if (loaded.kind === "loading") {
    return (
      <Shell online={online}>
        <div className="mt-8 grid gap-3" aria-hidden>
          <div className="h-5 w-64 rounded-full bg-surface-sunken motion-safe:animate-pulse" />
          <div className="h-24 rounded-md bg-surface-sunken motion-safe:animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (loaded.kind === "unsupported") {
    return (
      <Shell online={online}>
        <Intro />
        <p className="mt-6 flex items-start gap-2.5 rounded-sm border border-line bg-surface-raised/70 px-4 py-3 text-sm">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
          {loaded.reason}
        </p>
      </Shell>
    );
  }

  if (loaded.kind === "nothing" || (loaded.projects.length === 0 && loaded.saves.length === 0)) {
    return (
      <Shell online={online}>
        <Intro />
        <div className="mt-8 flex flex-col items-center rounded-md border border-line bg-surface px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
            <DeviceMobileIcon size={24} aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-medium">Nothing kept here yet</h2>
          <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-ink-2">
            Open a project in Farbaek and choose Keep on this device. It appears here, ready without a connection. If you signed out with changes still waiting, sign in again
            to see and send them.
          </p>
          <Link prefetch={false} href="/app/projects" className={buttonClasses("secondary", "sm", "mt-6")}>
            Open your projects <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        </div>
      </Shell>
    );
  }

  const { owner, projects, saves } = loaded;
  const project = view.kind === "home" ? null : (projects.find((p) => p.projectId === view.projectId) ?? null);

  if (view.kind === "conflict" && project) {
    const save = saves.find((s) => s.projectId === project.projectId && s.path === view.path);
    const outcome = save ? outcomes[keyOf(save)] : undefined;
    if (save && outcome?.kind === "conflict") {
      return (
        <Shell online={online}>
          <Conflict
            project={project}
            save={save}
            server={outcome.server}
            online={online}
            taken={new Set([...project.files.map((f) => f.path), ...saves.filter((s) => s.projectId === project.projectId).map((s) => s.path)])}
            onBack={() => go({ kind: "home" })}
            onKeepMine={async () => {
              const r = await sendOne(fetchPost, owner, save, outcome.server.revision);
              if (r.kind === "offline" || r.kind === "signed_out" || r.kind === "other_account") return setStop(r);
              await applyResult(owner, r);
              await refresh(owner);
              if (r.kind === "saved" || r.kind === "same") go({ kind: "home" });
            }}
            onKeepBoth={async (copyPath) => {
              const r = await sendOne(fetchPost, owner, { ...save, path: copyPath }, 0);
              if (r.kind === "offline" || r.kind === "signed_out" || r.kind === "other_account") return setStop(r);
              if (r.kind === "conflict") return setOutcomes((o) => ({ ...o, [keyOf(save)]: { kind: "refused", message: `${copyPath} was just made on Farbaek too. Choose again.` } }));
              if (r.kind === "refused") return setOutcomes((o) => ({ ...o, [keyOf(save)]: { kind: "refused", message: r.message } }));
              await recordSaved(owner, save.projectId, { path: copyPath, content: save.content, revision: r.revision });
              if (outcome.server.content !== null) await landed(owner, save, outcome.server.revision, outcome.server.content, false);
              else await updateSaves(owner, (q) => dequeue(q, save));
              await refresh(owner);
              go({ kind: "home" });
            }}
            onUseTheirs={async () => {
              if (outcome.server.content !== null) await landed(owner, save, outcome.server.revision, outcome.server.content, false);
              else {
                await updateSaves(owner, (q) => dequeue(q, save));
                setOutcomes((o) => {
                  const next = { ...o };
                  delete next[keyOf(save)];
                  return next;
                });
              }
              await refresh(owner);
              go({ kind: "home" });
            }}
          />
        </Shell>
      );
    }
  }

  if (view.kind === "file" && project) {
    const file = project.files.find((f) => f.path === view.path) ?? null;
    const save = saves.find((s) => s.projectId === project.projectId && s.path === view.path) ?? null;
    return (
      <Shell online={online}>
        <BackButton onClick={() => go({ kind: "project", projectId: project.projectId })}>{project.projectName}</BackButton>
        <Editor
          key={`${project.projectId}:${view.path}`}
          owner={owner}
          project={project}
          path={view.path}
          file={file}
          save={save}
          onSaved={async (content) => {
            await updateSaves(owner, (q) => enqueue(q, { orgId: project.orgId, projectId: project.projectId, path: view.path, content, baseRevision: file?.revision ?? 0, savedAt: new Date().toISOString() }));
            await refresh(owner);
          }}
          onUndo={async () => {
            await updateSaves(owner, (q) => dequeue(q, { projectId: project.projectId, path: view.path }));
            await refresh(owner);
          }}
        />
      </Shell>
    );
  }

  if (view.kind === "project" && project) {
    return (
      <Shell online={online}>
        <BackButton onClick={() => go({ kind: "home" })}>On this device</BackButton>
        <ProjectView
          owner={owner}
          project={project}
          saves={saves.filter((s) => s.projectId === project.projectId)}
          online={online}
          onOpen={(path) => go({ kind: "file", projectId: project.projectId, path })}
          onRemoved={async () => {
            await removeKept(owner, project.projectId);
            await refresh(owner);
            go({ kind: "home" });
          }}
        />
      </Shell>
    );
  }

  const names = new Map(projects.map((p) => [p.projectId, p.projectName]));
  return (
    <Shell online={online}>
      <Intro />
      {saves.length > 0 ? (
        <section aria-labelledby="waiting-heading" className="mt-8 rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
          <h2 id="waiting-heading" className="flex items-center gap-2.5 text-lg font-medium">
            <CloudArrowUpIcon size={20} className="shrink-0 text-ink-3" aria-hidden /> Waiting to be sent
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            <span className="tabular font-medium text-ink">{saves.length}</span> {saves.length === 1 ? "change is" : "changes are"} saved on this device. Farbaek gets{" "}
            {saves.length === 1 ? "it" : "them"} when you send.
          </p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {saves.map((s) => {
              const outcome = outcomes[keyOf(s)];
              return (
                <li key={keyOf(s)} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm">{s.path}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {names.get(s.projectId) ?? "A project no longer kept here"}, saved <RelativeTime iso={s.savedAt} />
                    </p>
                    {outcome?.kind === "refused" ? (
                      <p role="alert" className="mt-1.5 flex items-start gap-2 text-sm text-failed">
                        <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                        {outcome.message}
                      </p>
                    ) : null}
                  </div>
                  {outcome?.kind === "conflict" && names.has(s.projectId) ? (
                    <button type="button" onClick={() => go({ kind: "conflict", projectId: s.projectId, path: s.path })} className={buttonClasses("secondary", "sm", "justify-self-start")}>
                      Compare and choose
                    </button>
                  ) : outcome?.kind === "conflict" ? (
                    <StatusBadge status="attention" label="Changed on Farbaek too" />
                  ) : (
                    <StatusBadge status="pending" label="Not sent yet" />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={sendAll} disabled={!online || sending} className={buttonClasses("primary", "sm")}>
              <CloudArrowUpIcon size={16} weight="bold" aria-hidden /> {sending ? "Sending…" : saves.length === 1 ? "Send the change" : `Send ${saves.length} changes`}
            </button>
            {!online ? <p className="text-sm text-ink-2">You&apos;re offline. Your changes stay here until you&apos;re connected.</p> : null}
          </div>
          <div aria-live="polite" className="empty:hidden">
            {stop?.kind === "signed_out" ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-caution" aria-hidden />
                {stop.message}
                <Link prefetch={false} href="/sign-in?next=/device" className="font-medium text-accent hover:underline">
                  Sign in
                </Link>
              </p>
            ) : null}
            {stop?.kind === "offline" ? <p className="mt-3 text-sm text-ink-2">The connection dropped. Nothing was lost: the rest are still here, ready to send.</p> : null}
            {stop?.kind === "other_account" ? (
              <p className="mt-3 flex items-start gap-2 text-sm">
                <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                {stop.message}
              </p>
            ) : null}
            {sentCount !== null && sentCount > 0 && !sending ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
                <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
                {sentCount === 1 ? "One change is on Farbaek." : `${sentCount} changes are on Farbaek.`}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section aria-labelledby="kept-heading" className="mt-8">
          <h2 id="kept-heading" className="text-lg font-medium">
            Kept here
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {projects.map((p, i) => {
              const waiting = saves.filter((s) => s.projectId === p.projectId).length;
              return (
                <li key={p.projectId} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
                  <button
                    type="button"
                    onClick={() => go({ kind: "project", projectId: p.projectId })}
                    className="group flex w-full items-start justify-between gap-3 rounded-md border border-line bg-surface p-4 text-left shadow-e1 transition-[transform,box-shadow] duration-150 hover:shadow-e2 motion-safe:active:scale-[0.99]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-medium">{p.projectName}</span>
                      <span className="mt-1 block text-sm text-ink-2">
                        <span className="tabular">{p.files.length.toLocaleString("en-US")}</span> {p.files.length === 1 ? "file" : "files"}, kept <RelativeTime iso={p.keptAt} />
                      </span>
                      {waiting > 0 ? (
                        <span className="mt-1 block text-sm text-ink-2">
                          <span className="tabular font-medium text-ink">{waiting}</span> not sent yet
                        </span>
                      ) : null}
                    </span>
                    <ArrowRightIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3 transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 max-w-[64ch] text-xs leading-relaxed text-ink-3">
        Copies are kept in this browser for the account last signed in here, and never leave it until you send or share them. Signing out removes them; changes still
        waiting to be sent stay hidden until you sign in here again. The browser can clear its storage when the device runs short of space.
      </p>
    </Shell>
  );
}

function Shell({ online, children }: { online: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link prefetch={false} href="/app" className="flex min-h-11 items-center gap-2 rounded-full" aria-label="Farbaek, Home">
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo's own file, which the service worker keeps for offline; the image optimiser isn't reachable then. */}
          <img src={LOGO.src} alt="" width={21} height={32} className="h-8 w-auto shrink-0" />
          <span className="text-base font-medium tracking-[-0.02em] max-[18em]:sr-only">Farbaek</span>
        </Link>
        {online ? <StatusBadge status="info" label="Online" /> : <StatusBadge status="off" label="Offline" />}
      </div>
      <main id="main" className="mt-6">
        {children}
      </main>
    </div>
  );
}

function Intro() {
  return (
    <>
      <h1 className={PAGE_TITLE}>On this device</h1>
      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-ink-2">
        Projects you kept in this browser, ready without a connection. Changes you save here wait on the device, and go to Farbaek when you send them.
      </p>
    </>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm text-ink-2 hover:text-ink">
      <ArrowLeftIcon size={16} weight="bold" aria-hidden /> {children}
    </button>
  );
}

function ProjectView({
  owner,
  project,
  saves,
  online,
  onOpen,
  onRemoved,
}: {
  owner: string;
  project: DeviceCopyManifest;
  saves: QueuedSave[];
  online: boolean;
  onOpen: (path: string) => void;
  onRemoved: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"share" | "remove" | null>(null);
  const [note, setNote] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const waiting = new Set(saves.map((s) => s.path));
  // Files made on this device that Farbaek hasn't got yet appear with the kept ones.
  const extra = saves.filter((s) => !project.files.some((f) => f.path === s.path)).map((s) => s.path);
  const paths = [...project.files.map((f) => f.path), ...extra].sort((a, b) => a.localeCompare(b));
  const shown = query.trim() ? paths.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase())) : paths;

  async function share() {
    setBusy("share");
    setNote(null);
    try {
      const files: { path: string; content: string | Uint8Array }[] = [];
      for (const f of project.files) {
        const queued = saves.find((s) => s.path === f.path);
        if (queued) {
          files.push({ path: f.path, content: queued.content });
          continue;
        }
        const bytes = await readKept(owner, project.projectId, f);
        if (!bytes) throw new Error(`${f.path} is damaged on this device. Update the copy from the project page.`);
        files.push({ path: f.path, content: bytes });
      }
      for (const s of saves) if (!project.files.some((f) => f.path === s.path)) files.push({ path: s.path, content: s.content });
      const how = await shareOrDownload(zipName(project.projectName), files, project.projectName);
      if (how !== "cancelled") setNote({ tone: "done", text: how === "shared" ? "Shared." : "Downloaded as a .zip." });
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error && e.message ? e.message : "The copy couldn't be shared. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await onRemoved();
    } catch {
      setNote({ tone: "error", text: "The copy couldn't be removed. Try again." });
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className={`mt-2 ${PAGE_TITLE}`}>{project.projectName}</h1>
      <p className="mt-2 text-sm text-ink-2">
        <span className="tabular">{project.files.length.toLocaleString("en-US")}</span> {project.files.length === 1 ? "file" : "files"}, kept <RelativeTime iso={project.keptAt} />.
        {saves.length > 0 ? ` ${saves.length} not sent yet.` : ""}
      </p>
      {project.saveReason !== null ? <p className="mt-1 text-sm text-ink-2">{project.saveReason} You can read the copy here.</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={share} disabled={busy !== null} className={buttonClasses("secondary", "sm")}>
          <ShareNetworkIcon size={16} weight="bold" aria-hidden /> {busy === "share" ? "Preparing…" : "Share a copy"}
        </button>
        {online ? (
          <Link prefetch={false} href={`/app/projects/${project.projectId}`} className={buttonClasses("ghost", "sm")}>
            Open in Farbaek <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        ) : null}
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} disabled={busy !== null} className={buttonClasses("ghost", "sm")}>
            <TrashIcon size={16} weight="bold" aria-hidden /> Remove from this device
          </button>
        ) : null}
      </div>
      {confirm ? (
        <div role="group" aria-label="Remove the copy" className="mt-3 grid gap-3 rounded-sm border border-line bg-surface-raised/70 p-4">
          <p className="text-sm">
            Remove {project.projectName} from this device?{" "}
            {saves.length > 0 ? (saves.length === 1 ? "One change here hasn't been sent, and it goes too." : `${saves.length} changes here haven't been sent, and they go too.`) : "It stays on Farbaek."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={remove} disabled={busy !== null} className={buttonClasses("danger", "sm")}>
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} disabled={busy !== null} className={buttonClasses("ghost", "sm")}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
      <p aria-live="polite" className="empty:hidden">
        {note ? (
          <span className={`mt-3 flex items-start gap-2 text-sm ${note.tone === "error" ? "text-failed" : "text-ink-2"}`}>
            {note.tone === "error" ? (
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            ) : (
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            )}
            {note.text}
          </span>
        ) : null}
      </p>

      {paths.length > 12 ? (
        <label className="relative mt-6 block">
          <span className="sr-only">Find a file</span>
          <MagnifyingGlassIcon size={16} weight="bold" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a file"
            className="h-12 w-full rounded-sm border border-line bg-surface pl-10 pr-4 text-base outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
      ) : null}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
        {shown.map((path) => {
          const kept = project.files.find((f) => f.path === path);
          const FileGlyph = kept?.kind === "image" ? ImageIcon : FileTextIcon;
          return (
            <li key={path}>
              <button type="button" onClick={() => onOpen(path)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-raised">
                <FileGlyph size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 break-all font-mono text-sm">{path}</span>
                {waiting.has(path) ? <StatusBadge status="pending" label={kept ? "Not sent yet" : "New, not sent yet"} /> : null}
              </button>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-2">No file matches that.</li> : null}
      </ul>
    </>
  );
}

function Editor({
  owner,
  project,
  path,
  file,
  save,
  onSaved,
  onUndo,
}: {
  owner: string;
  project: DeviceCopyManifest;
  path: string;
  file: DeviceCopyFile | null;
  save: QueuedSave | null;
  onSaved: (content: string) => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  // What the copy holds now: the waiting save, or the kept file.
  const [base, setBase] = useState<{ kind: "loading" } | { kind: "text"; text: string } | { kind: "image"; url: string } | { kind: "damaged" } | { kind: "missing" }>(
    save ? { kind: "text", text: save.content } : file ? { kind: "loading" } : { kind: "missing" },
  );
  const [draft, setDraft] = useState<string | null>(save ? save.content : null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (save || !file) return;
    let alive = true;
    let url: string | null = null;
    if (file.kind === "image") {
      readKept(owner, project.projectId, file).then((bytes) => {
        if (!alive) return;
        if (!bytes) return setBase({ kind: "damaged" });
        url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
        setBase({ kind: "image", url });
      });
    } else {
      readKeptText(owner, project.projectId, file).then((text) => {
        if (!alive) return;
        if (text === null) return setBase({ kind: "damaged" });
        setBase({ kind: "text", text });
        setDraft(text);
      });
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [owner, project.projectId, file, save]);

  const changed = base.kind === "text" && draft !== null && draft !== base.text;

  async function saveHere() {
    if (draft === null) return;
    setBusy(true);
    try {
      await onSaved(draft);
      setBase({ kind: "text", text: draft });
      setNote("Saved on this device. Send it from On this device when you're online.");
    } catch {
      setNote("It couldn't be saved on this device. The browser's storage may be full.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className={`mt-2 break-all ${PAGE_TITLE}`}>{fileName(path)}</h1>
      <p className="mt-1 break-all font-mono text-sm text-ink-3">{path}</p>
      <p className="mt-2 text-sm text-ink-2">
        {file ? `Revision ${file.revision} when it was kept.` : "Made on this device."}
        {save ? " Your changes here haven't been sent yet." : ""}
      </p>

      {base.kind === "loading" ? <div className="mt-5 h-64 rounded-md bg-surface-sunken motion-safe:animate-pulse" aria-hidden /> : null}
      {base.kind === "damaged" ? (
        <p className="mt-5 flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          This file&apos;s copy is damaged. Update the copy from the project&apos;s page in Farbaek.
        </p>
      ) : null}
      {base.kind === "missing" ? <p className="mt-5 text-sm text-ink-2">This file isn&apos;t in the copy on this device. Update the copy from the project&apos;s page in Farbaek.</p> : null}
      {base.kind === "image" ? (
        <figure className="mt-5 grid gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture from this browser's own storage, shown as a blob address. */}
          <img src={base.url} alt={fileName(path)} className="max-h-[60dvh] w-auto max-w-full justify-self-start rounded-md border border-line bg-surface-sunken object-contain" />
          <figcaption className="text-sm text-ink-2">Pictures can be viewed here. To change one, use Farbaek online.</figcaption>
        </figure>
      ) : null}
      {base.kind === "text" && draft !== null ? (
        <>
          <label htmlFor="device-editor" className="sr-only">
            Contents of {path}
          </label>
          <textarea
            id="device-editor"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNote(null);
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            // Viewers, archived projects and paused workspaces read the copy; nothing they type could be saved.
            readOnly={project.saveReason !== null}
            className="mt-5 min-h-[55dvh] w-full resize-y rounded-sm border border-line bg-surface p-4 font-mono text-base leading-relaxed outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 sm:text-sm"
          />
          <div className="sticky bottom-[var(--tab-bar,0px)] mt-3 flex flex-wrap items-center gap-3 bg-canvas/90 py-3 backdrop-blur">
            {project.saveReason !== null ? (
              <p className="text-sm text-ink-2">{project.saveReason} You can read the copy here.</p>
            ) : (
              <button type="button" onClick={saveHere} disabled={!changed || busy} className={buttonClasses("primary", "sm")}>
                {busy ? "Saving…" : "Save on this device"}
              </button>
            )}
            {save ? (
              <button
                type="button"
                onClick={async () => {
                  // The kept version comes back through the effect, once the waiting save is gone.
                  await onUndo();
                  setNote("Your changes here are undone.");
                }}
                disabled={busy}
                className={buttonClasses("ghost", "sm")}
              >
                Undo my changes
              </button>
            ) : null}
            {!changed && !note && project.saveReason === null ? <span className="text-sm text-ink-3">{save ? "No new changes." : "Edit the text to save a change here."}</span> : null}
          </div>
          <p aria-live="polite" className="empty:hidden">
            {note ? <span className="flex items-start gap-2 text-sm text-ink-2">{note}</span> : null}
          </p>
        </>
      ) : null}
    </>
  );
}

function Conflict({
  project,
  save,
  server,
  online,
  taken,
  onBack,
  onKeepMine,
  onKeepBoth,
  onUseTheirs,
}: {
  project: DeviceCopyManifest;
  save: QueuedSave;
  server: ServerFile;
  online: boolean;
  taken: ReadonlySet<string>;
  onBack: () => void;
  onKeepMine: () => Promise<void>;
  onKeepBoth: (copyPath: string) => Promise<void>;
  onUseTheirs: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"mine" | "both" | "theirs" | null>(null);
  const deleted = server.revision === 0 || server.content === null;
  const compared = useMemo(() => (deleted ? null : compareLines(server.content ?? "", save.content)), [deleted, server.content, save.content]);
  const copyPath = deviceCopyPath(save.path, taken);

  async function run(which: "mine" | "both" | "theirs", fn: () => Promise<void>) {
    setBusy(which);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <BackButton onClick={onBack}>On this device</BackButton>
      <h1 className={`mt-2 break-all ${PAGE_TITLE}`}>{fileName(save.path)}</h1>
      <p className="mt-1 break-all font-mono text-sm text-ink-3">{save.path}</p>
      <p className="mt-3 max-w-[62ch] text-body leading-relaxed text-ink-2">
        {deleted
          ? `Someone deleted this file in ${project.projectName} on Farbaek after the copy was kept. Your version is still here.`
          : `Someone changed this file in ${project.projectName} on Farbaek after the copy was kept. Lines marked minus are Farbaek's, lines marked plus are yours.`}
      </p>

      {compared ? (
        <div className="mt-5">
          {compared.lines.length > 0 ? <DiffView lines={compared.lines} path={save.path} /> : <p className="text-sm text-ink-2">The two versions differ only in line endings or spacing at the end.</p>}
          {compared.truncated ? <p className="mt-2 text-xs text-ink-3">Only the first part of the differences is shown.</p> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
        <button type="button" onClick={() => run("mine", onKeepMine)} disabled={!online || busy !== null} className={buttonClasses("primary", "sm")}>
          {busy === "mine" ? "Sending…" : deleted ? "Save mine again" : "Keep mine"}
        </button>
        {!deleted ? (
          <button type="button" onClick={() => run("both", () => onKeepBoth(copyPath))} disabled={!online || busy !== null} className={buttonClasses("secondary", "sm")}>
            {busy === "both" ? "Sending…" : "Keep both"}
          </button>
        ) : null}
        <button type="button" onClick={() => run("theirs", onUseTheirs)} disabled={busy !== null} className={buttonClasses("ghost", "sm")}>
          {deleted ? "Let mine go" : "Use Farbaek's"}
        </button>
      </div>
      <p className="mt-3 max-w-[62ch] text-xs leading-relaxed text-ink-3">
        {deleted ? "Saving yours again brings the file back on Farbaek. " : `Keep mine makes yours the newest version; Farbaek's stays in the file's history. Keep both saves yours as ${copyPath}. `}
        {online ? "" : "You're offline, so only the last choice works until you're connected."}
      </p>
    </>
  );
}
