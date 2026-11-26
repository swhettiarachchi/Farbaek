"use client";

/**
 * The drafting assistant's bar (stage 195, ADR 0210): a command line for the plan, reimagined. It floats along the bottom of the sheet
 * (above the tab bar on phones) so the plan stays in view while the surveyor talks or types.
 *
 * An instruction goes the same way however it arrives: the local reader first (instant, free, offline), then the model for anything
 * else. Either way code checks it (check.ts) and the engine does the work: views and paper apply at once with Undo, anything with a value
 * waits in a card for Apply, measurements and divisions are handed to their tools, and questions are answered by the engine.
 *
 * Two voice modes: push to talk (hold the microphone, or Space on the sheet, and let go to send; or tap to start and tap to send) and
 * live talk (one tap, then talk: each pause ends an instruction, and "apply", "undo" or "stop listening" answer by voice).
 */
import { ArrowCounterClockwiseIcon, ClockCounterClockwiseIcon, MicrophoneIcon, MicrophoneSlashIcon, PaperPlaneRightIcon, SlidersHorizontalIcon, StopIcon } from "@/components/icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { answer as engineAnswer } from "@/core/survey/assistant/answer";
import type { Applied, Patch } from "@/core/survey/assistant/apply";
import { checkTurn } from "@/core/survey/assistant/check";
import { assistContext } from "@/core/survey/assistant/context";
import { describeOp, describeTurn, readBack } from "@/core/survey/assistant/describe";
import { LANGUAGES, SURVEY_PHRASES, browserFamily, languageOf, scriptOf, voiceAvailability, type AssistLanguage } from "@/core/survey/assistant/languages";
import { tierOf, type AssistOutput, type CheckedTurn, type PlanOp } from "@/core/survey/assistant/ops";
import { readCommand, type StepId } from "@/core/survey/assistant/reader";
import { ambiguousNumbers } from "@/core/survey/assistant/session";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import type { buildPlan } from "@/core/survey/view";
import { canonicalHash } from "@/core/trust/canonical-json";
import { decideAssistTurnAction, recordLocalAssistTurnAction } from "@/app/app/survey/assistant-actions";
import { buttonClasses } from "@/components/ui/button";
import { useAssistant, type Turn } from "./assistant-context";
import { AnswerCard, ChangeCard, HandoffCard, NoteCard, QuestionCard } from "./cards";
import { SettingsPanel } from "./settings-panel";
import { TurnsDrawer } from "./turns-drawer";
import { speechErrorMessage, useSpeech } from "./use-speech";
import { useMicLevel, useVoiceReply } from "./use-voice-io";
import { VoiceCore, type VoiceCoreState } from "./voice-core";

type ViewOp = Extract<PlanOp, { kind: "view" }>;
type DivideOp = Extract<PlanOp, { kind: "divide" }>;
type MeasureOp = Extract<PlanOp, { kind: "measure" }>;

/** What the plan editor lends the assistant: the plan as it stands, and the editor's own ways to change and show it. */
export interface EditorBridge {
  projectId: string;
  doc: SurveyDocument;
  points: SurveyPoint[];
  plan: ReturnType<typeof buildPlan>;
  /** What's picked on the sheet, in the order picked. */
  selection: string[];
  /** Why the plan can't be changed here (the sample, a viewer), or null. */
  readOnly: string | null;
  /** Why the model can't be asked here (the demo, no AI), or null; the local reader still works. */
  aiOff: string | null;
  /** What the assistant's AI costs, in a sentence (ADR 0212), or null when there's nothing to say. */
  aiCost: string | null;
  approved: boolean;
  dirty: boolean;
  setPreview(ops: PlanOp[] | null): void;
  apply(ops: PlanOp[]): Applied;
  revert(patch: Patch): { ok: true } | { ok: false; changedSince: string[] };
  view(op: ViewOp): void;
  /** Takes one step back or forward in the editor's history; false when there was none to take. */
  history(action: "undo" | "redo"): boolean;
  setMarks(entities: string[]): void;
  save(): void;
  openDivide(op: DivideOp): void;
  openEntry(op: MeasureOp): void;
  goto(step: StepId): void;
}

const CANNOT: Record<NonNullable<CheckedTurn["cannot"]>, string> = {
  points: "Surveyed points can't be changed: they're the record of the survey. Import new points to add some.",
  crs: "The coordinate system is changed in the project's settings, after a check, never by the assistant.",
  approval: "Approving is yours alone, on the Export step.",
  surveyor: "Who the surveyor is, is chosen on the Plan step's Sheet panel.",
  export: "Exports are made on the Export step.",
  unsupported: "That isn't something the assistant can do yet. The Lots and Plan steps have the tools for it.",
  unclear: "I couldn't tell what to change from that. Say it another way, or name the lot, road or points.",
};

const noSubscribe = () => () => {};
const MODES = [
  ["push", "Push to talk"],
  ["live", "Live talk"],
] as const;
/** When the last bar went away: a save starts the editor afresh, and a live conversation carries on only across that. */
let leftAt = 0;
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const recent = (turns: readonly Turn[]) => turns.slice(-6).map((t) => `${t.words.slice(0, 120)} (${t.outcome})`);

/** Tells the server what became of a model turn; a record only, so a failure here never stops the work. */
function decide(t: Turn, outcome: "applied" | "discarded" | "reverted", ops: readonly PlanOp[] = []) {
  if (!t.serverId) return;
  const id = t.serverId;
  void (outcome === "applied" ? canonicalHash(ops) : Promise.resolve(null))
    .then((hash) => decideAssistTurnAction({ turnId: id, outcome, appliedSha256: hash }))
    .catch(() => null);
}

/**
 * Records a change the local rules read and the surveyor applied, so the project's record (and the next visit's drawer) has every
 * change, not only the model's. A record only: a failure never stops the work. Its id lets "Take back" be recorded too.
 */
function recordLocal(projectId: string, t: Pick<Turn, "id" | "words" | "lang" | "inputMethod">, ops: readonly PlanOp[], update: (id: string, change: Partial<Turn>) => void) {
  void canonicalHash(ops)
    // The server reads the words again itself; only the hash of what was applied goes with them.
    .then((hash) => recordLocalAssistTurnAction({ projectId, words: t.words, lang: t.lang, inputMethod: t.inputMethod, appliedSha256: hash }))
    .then((r) => {
      if (r.ok && r.turnId) update(t.id, { serverId: r.turnId });
    })
    .catch(() => null);
}

export function AssistantDock({ bridge }: { bridge: EditorBridge }) {
  const a = useAssistant();
  if (!a) return null;
  return <Dock bridge={bridge} a={a} />;
}

function Dock({ bridge, a }: { bridge: EditorBridge; a: NonNullable<ReturnType<typeof useAssistant>> }) {
  const { earlier, settings, setSettings, session, dispatch, turns, addTurn, updateTurn } = a;
  const speech = useSpeech();
  const voice = useVoiceReply();
  const level = useMicLevel(session.phase === "listening");
  const family = useSyncExternalStore(noSubscribe, () => browserFamily(navigator.userAgent), () => "other" as const);
  // English heard on this computer, when the surveyor chose it in the settings (Chrome on a computer, after its download).
  const onDeviceTag = settings.lang === "en" ? settings.onDeviceTag : null;
  const availability = voiceAvailability(settings.lang, family, speech.supported === true, onDeviceTag);
  // The line starts with the conversation's words, so words held for checking survive a save (the editor starts afresh).
  const [text, setText] = useState(() => (session.phase === "heard" ? session.text : ""));
  const [drawer, setDrawer] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const pauseTimer = useRef<number | undefined>(undefined);
  const countdownTimer = useRef<number | undefined>(undefined);
  const silenceTimer = useRef<number | undefined>(undefined);
  const tailTimer = useRef<number | undefined>(undefined);
  const restartTimer = useRef<number | undefined>(undefined);
  const emptyRuns = useRef(0);
  const pressedAt = useRef(0);
  const holding = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<() => void>(() => {});
  const runRef = useRef<(words: string, method: "voice" | "typed") => void>(() => {});
  // The latest plan, settings and conversation, for work that finishes later (a model reply, a spoken reply ending): it acts on the
  // plan as it is then, never as it was when the instruction was sent.
  const latest = useRef({ bridge, settings, session, listening: speech.listening });
  useLayoutEffect(() => {
    latest.current = { bridge, settings, session, listening: speech.listening };
  });

  const active = useMemo(() => [...turns].reverse().find((t) => t.open) ?? null, [turns]);
  const pending = active && active.outcome === "suggested" && active.ops.some((o) => tierOf(o) === "confirm" || tierOf(o) === "caution" || tierOf(o) === "now") ? active : null;
  // The ticks live on the turn, so a save (which starts the editor afresh) keeps the items left out, out.
  const ticked = useMemo(() => pending?.ticked ?? [], [pending]);
  const setTicked = (next: boolean[]) => pending && updateTurn(pending.id, { ticked: next });
  const lastUndoable = useMemo(() => [...turns].reverse().find((t) => (t.outcome === "applied" || t.outcome === "done") && t.patch) ?? null, [turns]);
  const ctx = useMemo(() => ({ doc: bridge.doc, points: bridge.points }), [bridge.doc, bridge.points]);
  const changeOps = useMemo(() => (pending ? pending.ops.filter((o) => ["now", "confirm", "caution"].includes(tierOf(o))) : []), [pending]);

  // The sheet shows the change while it waits, with what it adds marked; "show the plan without it" compares.
  const shownOps = useMemo(() => changeOps.filter((_, i) => ticked[i] !== false), [changeOps, ticked]);
  useEffect(() => {
    bridge.setPreview(pending && !comparing && shownOps.length ? shownOps : null);
    // bridge methods are stable for a mounted editor; the preview follows the pending change and its ticks only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, comparing, shownOps]);

  /** Says a reply when spoken replies are on, never over an open microphone: listening stops first and starts again after. */
  const say = useCallback(
    (sentences: string[], lang: AssistLanguage, spoken: boolean, then?: () => void) => {
      if (latest.current.settings.speak && spoken && sentences.length && !voice.unavailable(lang)) {
        if (latest.current.listening) speech.abort();
        voice.speak(sentences, lang, then);
      } else then?.();
    },
    [speech, voice],
  );

  /** Live talk listens again after a reply, if the conversation is still open in live mode now. */
  const resumeLive = useCallback(() => {
    const { settings: s, session: c } = latest.current;
    if (s.mode === "live" && c.live) startRef.current();
  }, []);

  /**
   * A card is done with. Whatever the microphone was hearing meanwhile is dropped, so the screen and the microphone agree; in live talk
   * it opens again, unless the surveyor is turning to type.
   */
  const decided = (resume: boolean) => {
    if (latest.current.listening) speech.abort();
    dispatch({ type: "decided" });
    if (resume) resumeLive();
  };

  /**
   * After a failed turn in live talk: three in a row (often steady noise read as instructions) end the conversation rather than
   * keep sending fragments. Returns whether it ended.
   */
  const endLiveAfterFailures = () => {
    const c = latest.current.session;
    if (!c.live || c.failures + 1 < 3) return false;
    stopLiveRef.current();
    setNotice("Three instructions in a row didn't work, so live talk stopped. Push to talk may suit a noisy place better.");
    return true;
  };

  /** What came of a checked turn: views at once; layers, labels and paper at once with Undo; values wait in a card; tools are handed over. */
  const finish = useCallback(
    (words: string, method: "voice" | "typed", engine: Turn["engine"], raw: CheckedTurn, serverId: string | null) => {
      const bridge = latest.current.bridge;
      const settings = latest.current.settings;
      const lang = method === "voice" ? settings.lang : scriptOf(words);
      // Undo and redo run only from the surveyor's own word, read by the local rules, never from the model.
      const fromModelHistory = engine === "model" && raw.ops.some((o) => o.kind === "history");
      const checked: CheckedTurn = fromModelHistory ? { ...raw, ops: raw.ops.filter((o) => o.kind !== "history"), dropped: [...raw.dropped, { what: "Undo or redo", why: 'Say "undo" or "redo" on its own, or use Undo.' }] } : raw;
      const views = checked.ops.filter((o) => tierOf(o) === "view");
      // Undo and redo say what they did, or that there was nothing to take.
      let historyNote: string | null = null;
      for (const v of views) {
        if (v.kind === "view") bridge.view(v);
        else if (v.kind === "history") {
          const did = bridge.history(v.action);
          historyNote = v.action === "undo" ? (did ? 'Undone. Say "redo" to put it back.' : "There's nothing to undo.") : did ? "Redone." : "There's nothing to redo.";
        }
      }
      const changes = checked.ops.filter((o) => ["now", "confirm", "caution"].includes(tierOf(o)));
      // Changes from the model always wait in a card, even layers and paper: only the surveyor's own words, read by the local rules,
      // change the plan at once.
      const needsLook = engine === "model" || changes.some((o) => tierOf(o) !== "now");
      const answers = checked.ops.filter((o): o is Extract<PlanOp, { kind: "answer" }> => o.kind === "answer").map((o) => engineAnswer(o, { doc: bridge.doc, points: bridge.points, findings: bridge.plan.findings, scale: bridge.plan.sheet.scale, suggestedScale: bridge.plan.sheet.suggestedScale }));
      const handoffs = checked.ops.filter((o) => tierOf(o) === "handoff");
      const base: Turn = { id: newId(), at: Date.now(), words, inputMethod: method, lang, engine, say: checked.say, ops: checked.ops, dropped: checked.dropped, question: checked.question, answers, outcome: "failed", patch: null, serverId, message: "", open: false };
      const spoken = method === "voice" || settings.mode === "live";
      if (changes.length && (needsLook || bridge.readOnly)) {
        setComparing(false);
        addTurn({ ...base, outcome: "suggested", open: true, ticked: changes.map(() => true) });
        dispatch({ type: "result", phase: "suggested" });
        say([checked.say || `${changes.length === 1 ? "One change" : `${changes.length} changes`} to check.`, ...readBack(changes, { doc: bridge.doc, points: bridge.points })].filter(Boolean), lang, spoken, resumeLive);
        return;
      }
      if (changes.length) {
        const r = bridge.apply(changes);
        if (!r.ok) {
          addTurn({ ...base, outcome: "failed", message: r.error, open: true });
          dispatch({ type: "failed", message: r.error });
          say([r.error], lang, spoken, resumeLive);
          return;
        }
        bridge.setMarks(r.touched);
        const did = changes.map((o) => describeOp(o, ctx).text).join(". ");
        // What came with the change is said too: a refusal ("approve it and hide the walls") or the engine's answer in its card.
        const refused = checked.cannot ? CANNOT[checked.cannot] : "";
        addTurn({ ...base, outcome: "done", patch: r.patch, message: did, open: answers.length > 0 });
        if (engine === "reader") recordLocal(bridge.projectId, base, changes, updateTurn);
        dispatch({ type: "result", phase: answers.length ? "answered" : "applied" });
        setNotice(`${did}.${refused ? ` ${refused}` : ""}`);
        say(["Done.", refused, ...answers.map((x) => x.speak)].filter(Boolean), lang, spoken, resumeLive);
        return;
      }
      if (handoffs.length) {
        addTurn({ ...base, outcome: "suggested", open: true });
        dispatch({ type: "result", phase: "handoff" });
        say([checked.say || "That opens in its own tool, to check first."], lang, spoken, resumeLive);
        return;
      }
      if (checked.question) {
        addTurn({ ...base, outcome: "asked", open: true });
        dispatch({ type: "result", phase: "asking" });
        say([checked.question.text], lang, spoken, resumeLive);
        return;
      }
      if (answers.length) {
        addTurn({ ...base, outcome: "answered", open: true });
        dispatch({ type: "result", phase: "answered" });
        say(answers.map((x) => x.speak), lang, spoken, resumeLive);
        return;
      }
      if (views.length) {
        // The bar says what moved, since on a phone the sheet may be out of sight.
        const shown = views.filter((v) => v.kind === "view");
        const note = [historyNote ?? (shown.length ? `${shown.map((o) => describeOp(o, ctx).text).join(". ")}.` : null), checked.cannot ? CANNOT[checked.cannot] : null].filter(Boolean).join(" ") || null;
        addTurn({ ...base, outcome: "done", open: false, message: note ?? "" });
        dispatch({ type: "result", phase: "applied" });
        if (note) setNotice(note);
        resumeLive();
        return;
      }
      const why = checked.cannot ? CANNOT[checked.cannot] : checked.dropped.length ? `${checked.dropped[0]!.what}: ${checked.dropped[0]!.why}` : CANNOT.unclear;
      addTurn({ ...base, outcome: "failed", message: why, open: true });
      const ended = endLiveAfterFailures();
      dispatch({ type: "failed", message: why });
      say([why], lang, spoken, ended ? undefined : resumeLive);
    },
    [addTurn, ctx, dispatch, resumeLive, say, updateTurn],
  );

  const control = useCallback(
    (c: NonNullable<ReturnType<typeof readCommand>> & { kind: "control" }, words: string, method: "voice" | "typed") => {
      const close = (id: string, outcome: Turn["outcome"]) => updateTurn(id, { open: false, outcome });
      if (c.control === "apply") {
        if (pending) applyTurn(pending);
        else {
          setNotice("Nothing is waiting to be applied.");
          dispatch({ type: "result", phase: "applied" });
          resumeLive();
        }
      } else if (c.control === "discard") {
        if (active?.outcome === "suggested") decide(active, "discarded");
        if (active) close(active.id, active.outcome === "suggested" ? "discarded" : active.outcome);
        bridge.setPreview(null);
        decided(true);
      } else if (c.control === "stop") {
        stopLive();
      } else if (c.control === "goto" && c.step) {
        // Going to another step ends the conversation here.
        stopLive();
        bridge.goto(c.step);
      } else {
        if (c.control === "save") bridge.save();
        dispatch({ type: "result", phase: "applied" });
        if (c.control === "readback") {
          const lines = pending ? readBack(changeOps, ctx) : [];
          if (lines.length && !voice.unavailable(settings.lang)) {
            if (latest.current.listening) speech.abort();
            voice.speak(lines, settings.lang, resumeLive);
            return;
          }
          setNotice(lines.length ? "This device can't read it back; the values are in the card." : "Nothing to read back.");
        }
        resumeLive();
      }
      if (c.control === "stop" || c.control === "goto") dispatch({ type: "result", phase: "applied" });
      void words;
      void method;
    },
    // applyTurn, decided and stopLive are declared below and read through the latest closure on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, pending, changeOps, ctx, settings.lang, voice, speech, resumeLive],
  );

  /** Sends an instruction. */
  const run = useCallback(
    async (words: string, method: "voice" | "typed", answering = false) => {
      const said = words.trim();
      if (!said) return;
      // An answer to an open question carries on the instruction that raised it, unless it's an instruction of its own. "Yes" and
      // "no" answer the question, rather than apply or discard nothing.
      const asked = active?.open && active.outcome === "asked" ? active : null;
      const alone = readCommand(said);
      const yesNo = alone?.kind === "control" && (alone.control === "apply" || alone.control === "discard");
      const combined = asked && (answering || !alone || yesNo) ? `${asked.words.replace(/[.\s]+$/, "")}. ${said}` : said;
      const instruction = combined.length <= 2_000 ? combined : said;
      // A newer instruction replaces one still being worked out: its reply never lands on top of this one. Anything the microphone
      // is hearing meanwhile (a tap on an answer while listening) is dropped too.
      inFlight.current?.abort();
      inFlight.current = null;
      if (latest.current.listening) speech.abort();
      voice.cancel();
      bridge.setMarks([]);
      setNotice(null);
      // Sending something is activity: live talk's minute of silence starts again.
      if (latest.current.session.live) {
        window.clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => stopLiveRef.current(), 60_000);
      }
      if (active?.open && active.outcome !== "suggested") updateTurn(active.id, { open: false });
      dispatch({ type: "edit", text: instruction });
      dispatch({ type: "send" });
      const read = instruction === said ? alone : readCommand(instruction);
      if (read?.kind === "control") {
        control(read, instruction, method);
        setText("");
        return;
      }
      if (pending) {
        decide(pending, "discarded");
        updateTurn(pending.id, { open: false, outcome: "discarded", message: "Replaced by the next instruction." });
      }
      const context = assistContext({ doc: bridge.doc, points: bridge.points, selection: bridge.selection, recent: recent(turns), step: "plan" });
      const check = (output: AssistOutput) => checkTurn({ instruction, output, doc: bridge.doc, points: bridge.points, selection: bridge.selection, refs: context.refs, inputMethod: method });
      setText("");
      if (read?.kind === "output") {
        finish(instruction, method, "reader", check(read.output), null);
        return;
      }
      const failed = (why: string, engine: Turn["engine"]) => {
        addTurn({ id: newId(), at: Date.now(), words: instruction, inputMethod: method, lang: settings.lang, engine, say: "", ops: [], dropped: [], question: null, answers: [], outcome: "failed", patch: null, serverId: null, message: why, open: true });
        const ended = endLiveAfterFailures();
        dispatch({ type: "failed", message: why });
        say([why], settings.lang, method === "voice" || latest.current.settings.mode === "live", ended ? undefined : resumeLive);
      };
      if (bridge.aiOff) {
        failed(`${bridge.aiOff} Without AI the assistant still zooms, shows and hides layers, sets the paper and scale, moves labels, makes lots from picked points, and answers the area, the checks and what's missing.`, "reader");
        return;
      }
      const ac = new AbortController();
      inFlight.current = ac;
      const timeout = window.setTimeout(() => ac.abort("timeout"), 15_000);
      try {
        const res = await fetch(`/app/survey/${bridge.projectId}/assist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ words: instruction, lang: method === "voice" ? settings.lang : scriptOf(instruction), inputMethod: method, document: bridge.doc, selection: bridge.selection, recent: recent(turns) }),
          signal: ac.signal,
        });
        const body = (await res.json().catch(() => null)) as { ok: true; turnId: string; output: AssistOutput } | { ok: false; message: string } | null;
        if (ac.signal.aborted) {
          // The time ran out while the answer was being read: said like any other timeout.
          if (ac.signal.reason === "timeout") failed("The assistant took too long, so it was stopped. Try again, or say it more simply.", "model");
          return;
        }
        if (!body || !body.ok) {
          failed(body && !body.ok ? body.message : "The assistant didn't answer. Try again, or use the tools on the Lots and Plan steps.", "model");
          return;
        }
        // Checked again against the plan as it is now, edits made while waiting included; "these points" are still the ones picked
        // when it was said.
        // The model's refs (L1, P:12) are the ones it was sent; they name items by id, so an item removed meanwhile is left out.
        const now = latest.current.bridge;
        finish(instruction, method, "model", checkTurn({ instruction, output: body.output, doc: now.doc, points: now.points, selection: bridge.selection, refs: context.refs, inputMethod: method }), body.turnId);
      } catch {
        if (ac.signal.reason === "timeout") failed("The assistant took too long, so it was stopped and nothing was charged. Try again, or say it more simply.", "model");
        else if (!ac.signal.aborted) failed("The answer didn't arrive: the connection may have dropped. Try again.", "model");
        // Otherwise it was stopped on purpose (Stop, the microphone, a newer instruction, leaving the page), and that already said so.
      } finally {
        window.clearTimeout(timeout);
        if (inFlight.current === ac) inFlight.current = null;
      }
    },
    [active, addTurn, bridge, control, dispatch, finish, pending, resumeLive, say, settings.lang, speech, turns, updateTurn, voice],
  );
  useEffect(() => {
    runRef.current = (w, m) => void run(w, m);
  }, [run]);

  function applyTurn(t: Turn) {
    const b = latest.current.bridge;
    const ops = changeOps.filter((_, i) => ticked[i] !== false);
    const r = b.apply(ops);
    b.setPreview(null);
    if (!r.ok) {
      updateTurn(t.id, { open: false, outcome: "failed", message: r.error });
      setNotice(r.error);
      decided(true);
      return;
    }
    b.setMarks(r.touched);
    decide(t, "applied", ops);
    if (t.engine === "reader") recordLocal(b.projectId, t, ops, updateTurn);
    const skipped = r.skipped.length ? ` ${r.skipped.map((s) => `${s.what}: ${s.why}`).join(" ")}` : "";
    updateTurn(t.id, { open: false, outcome: "applied", patch: r.patch, message: `${ops.length === 1 ? "One change" : `${ops.length} changes`} applied.${skipped}` });
    setNotice(`${ops.length === 1 ? "One change" : `${ops.length} changes`} applied.${skipped}`);
    decided(false);
    // The reply is spoken with the microphone closed, then live talk listens again.
    say(["Applied."], t.lang, t.inputMethod === "voice" || settings.mode === "live", resumeLive);
  }

  function takeBack(t: Turn) {
    if (!t.patch) return;
    const r = bridge.revert(t.patch);
    if (r.ok) {
      if (t.outcome === "applied" || t.outcome === "done") decide(t, "reverted");
      updateTurn(t.id, { outcome: "reverted", message: "Taken back." });
      setNotice("Taken back.");
    } else setNotice(`It can't be taken back: ${r.changedSince.join(", ")} changed since. Undo by hand, or change it again.`);
  }

  // ---- Listening ----------------------------------------------------------------------------------------------------------------
  const clearTimers = () => {
    window.clearTimeout(pauseTimer.current);
    window.clearTimeout(countdownTimer.current);
    window.clearTimeout(tailTimer.current);
    window.clearTimeout(restartTimer.current);
  };

  const onHeard = useCallback(
    (words: string) => {
      clearTimers();
      const w = words.trim();
      if (!w) {
        dispatch({ type: "no_speech" });
        // Live talk listens again after a silence, but a recogniser that keeps ending at once with nothing heard stops it, rather
        // than flicker on and off.
        if (latest.current.settings.mode === "live" && latest.current.session.live) {
          emptyRuns.current++;
          if (emptyRuns.current >= 4) {
            stopLiveRef.current();
            setNotice("Nothing was heard for a while, so live talk stopped. Tap the microphone to start again.");
            return;
          }
          restartTimer.current = window.setTimeout(() => startRef.current(), 150);
        }
        return;
      }
      emptyRuns.current = 0;
      const hold = settings.review || ambiguousNumbers(w);
      dispatch({ type: "final", text: w, review: settings.review });
      setText(w);
      if (hold) {
        window.setTimeout(() => input.current?.focus(), 0);
        return;
      }
      if (settings.mode === "live") {
        countdownTimer.current = window.setTimeout(() => {
          dispatch({ type: "countdown_done" });
          runRef.current(w, "voice");
        }, 900);
        return;
      }
      runRef.current(w, "voice");
    },
    [dispatch, settings.mode, settings.review],
  );

  const startListening = useCallback(() => {
    if (!availability.ok) return;
    if (!settings.privacyNoted) {
      setPrivacy(true);
      return;
    }
    voice.cancel();
    inFlight.current?.abort();
    inFlight.current = null;
    clearTimers();
    setText("");
    dispatch({ type: "listen", live: settings.mode === "live" });
    // A new live conversation starts its minute of silence; listening again after a reply carries the same one on.
    if (settings.mode === "live" && silenceTimer.current === undefined) silenceTimer.current = window.setTimeout(() => stopLiveRef.current(), 60_000);
    speech.start({
      lang: availability.tag,
      continuous: true,
      processLocally: availability.where === "device" && onDeviceTag !== null,
      phrases: SURVEY_PHRASES,
      onWords: (w) => {
        dispatch({ type: "interim", text: w });
        if (latest.current.settings.mode === "live") {
          window.clearTimeout(pauseTimer.current);
          window.clearTimeout(silenceTimer.current);
          silenceTimer.current = window.setTimeout(() => stopLiveRef.current(), 60_000);
          pauseTimer.current = window.setTimeout(() => speech.stop(), latest.current.settings.pauseMs);
        }
      },
      onFinal: (w) => onHeard(w),
      onError: (code) => {
        // The recogniser has ended without sending anything; a live conversation ends with it.
        // On the computer, "not supported" means Chrome no longer has English downloaded.
        const msg =
          code === "language-not-supported" && latest.current.settings.lang === "en" && latest.current.settings.onDeviceTag
            ? "English isn't downloaded for this computer any more. Download it again in the assistant's settings, or switch off hearing on this computer."
            : speechErrorMessage(code, languageOf(latest.current.settings.lang).name);
        clearTimers();
        window.clearTimeout(silenceTimer.current);
        silenceTimer.current = undefined;
        emptyRuns.current = 0;
        dispatch({ type: "cancel" });
        if (msg) setNotice(msg);
      },
    });
  }, [availability, dispatch, onDeviceTag, onHeard, settings.mode, settings.privacyNoted, speech, voice]);
  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  function stopLive() {
    clearTimers();
    window.clearTimeout(silenceTimer.current);
    silenceTimer.current = undefined;
    emptyRuns.current = 0;
    holding.current = false;
    speech.abort();
    dispatch({ type: "stop_live" });
  }
  const stopLiveRef = useRef(stopLive);
  useLayoutEffect(() => {
    stopLiveRef.current = stopLive;
  });

  /** Stops everything at once: listening, a turn in flight, speech, the countdown and the tail after a release. */
  const cancelAll = useCallback(() => {
    clearTimers();
    window.clearTimeout(silenceTimer.current);
    silenceTimer.current = undefined;
    emptyRuns.current = 0;
    holding.current = false;
    speech.abort();
    inFlight.current?.abort();
    inFlight.current = null;
    voice.cancel();
    dispatch({ type: "cancel" });
  }, [dispatch, speech, voice]);

  // Leaving (another step, or the editor starting afresh after a save) stops every timer and any turn in flight. A live conversation
  // carries on in the new editor; anything half-heard in push to talk is dropped.
  useEffect(() => {
    const s = latest.current.session;
    // A save while an answer was being worked out sets the answer aside, and says so (the conversation's own message, shown in the
    // status line).
    if (s.phase === "working") dispatch({ type: "failed", message: "The plan was saved while the assistant was working, so its answer was set aside. Say it again if you still want it." });
    // Only a save brings the editor straight back; coming back to the step later starts quiet.
    else if (s.live && Date.now() - leftAt < 5_000) startRef.current();
    else if (s.live) dispatch({ type: "stop_live" });
    else if (s.phase === "listening" || s.phase === "countdown") dispatch({ type: "cancel" });
    return () => {
      leftAt = Date.now();
      for (const t of [pauseTimer, countdownTimer, silenceTimer, tailTimer, restartTimer]) window.clearTimeout(t.current);
      inFlight.current?.abort("unmount");
      inFlight.current = null;
    };
    // Once per editor: on mount and unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push to talk: hold and let go to send, or tap to start and tap again to send. Hold Space on the sheet too.
  const micDown = () => {
    if (session.phase === "listening") {
      if (session.live) stopLive();
      else speech.stop();
      return;
    }
    pressedAt.current = Date.now();
    holding.current = true;
    startListening();
  };
  const micUp = () => {
    if (!holding.current) return;
    holding.current = false;
    // A hold (not a tap) ends on release, with a short tail so the last word isn't cut off. Esc in the tail drops it all.
    if (settings.mode === "push" && Date.now() - pressedAt.current > 350) tailTimer.current = window.setTimeout(() => speech.stop(), 400);
  };
  useEffect(() => {
    const onCanvas = () => (document.activeElement as HTMLElement | null)?.dataset?.planCanvas === "true";
    const down = (e: globalThis.KeyboardEvent) => {
      // While Space is held to talk, its repeats mustn't scroll the page away from the sheet.
      if (e.code === "Space" && e.repeat && holding.current) e.preventDefault();
      else if (e.code === "Space" && !e.repeat && onCanvas() && settings.mode === "push" && !latest.current.listening) {
        e.preventDefault();
        pressedAt.current = Date.now();
        holding.current = true;
        startRef.current();
      } else if (e.key === "Escape") {
        // Esc stops the assistant only when it's doing something; otherwise it's left to the sheet (clearing the selection).
        const { session: c, listening: l } = latest.current;
        if (l || c.live || c.phase === "working" || c.phase === "countdown" || voice.speaking) cancelAll();
      }
    };
    // Letting go of Space sends wherever the focus has moved meanwhile, so a hold never sticks on.
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space" && holding.current) {
        holding.current = false;
        tailTimer.current = window.setTimeout(() => speech.stop(), 400);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [cancelAll, settings.mode, speech, voice.speaking]);

  // Live talk resumes after a spoken reply ends; a pause or tap during the countdown keeps the words to edit.
  const onType = (v: string) => {
    if (session.phase === "countdown") window.clearTimeout(countdownTimer.current);
    setText(v);
    dispatch({ type: "edit", text: v });
  };
  /** Tapping the words during the countdown keeps them to edit, as the status line says. */
  const keepWords = () => {
    if (session.phase !== "countdown") return;
    window.clearTimeout(countdownTimer.current);
    dispatch({ type: "edit", text });
  };
  /** Turning to type ends live talk, so the words aren't overwritten by the next ones heard. */
  const toTyping = (words: string) => {
    if (session.live) stopLive();
    setText(words);
    window.setTimeout(() => input.current?.focus(), 0);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void run(text, session.phase === "heard" ? "voice" : "typed");
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 7_000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ---- The voice mode: a radio group, with arrows moving between the two (one tab stop) ----------------------------------------------
  const chooseMode = (m: "push" | "live") => {
    if (m === settings.mode) return;
    // Changing how you talk ends whatever was being heard, and a live conversation.
    if (listening || session.live) cancelAll();
    setSettings({ mode: m });
    dispatch({ type: "mode", mode: m });
  };
  const onModeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const group = e.currentTarget;
    chooseMode(settings.mode === "push" ? "live" : "push");
    window.setTimeout(() => group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(), 0);
  };

  // ---- The settings: a small panel above the bar; Esc, Done or a tap outside closes it, and the focus goes back to its button ---------
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsOpener = useRef<HTMLButtonElement | null>(null);
  const openSettings = (from: HTMLButtonElement) => {
    settingsOpener.current = from;
    setSettingsOpen(true);
    window.setTimeout(() => settingsRef.current?.querySelector<HTMLElement>("button, [href], input")?.focus(), 0);
  };
  const closeSettings = (refocus: boolean) => {
    setSettingsOpen(false);
    if (refocus) settingsOpener.current?.focus();
  };
  useEffect(() => {
    if (!settingsOpen) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!settingsRef.current?.contains(t) && !settingsOpener.current?.contains(t)) setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [settingsOpen]);

  // ---- The drawer and the cards take turns: a new card closes the drawer, and the drawer, while open, sits where the card was ------
  const [drawerAt, setDrawerAt] = useState(0);
  // Any turn newer than the drawer's opening closes it for good, so it doesn't come back once that card is done with.
  const newestAt = turns.length ? turns[turns.length - 1]!.at : 0;
  const showDrawer = drawer && drawerAt >= newestAt;

  // The bar's height, for the page's padding below the side panels on phones, so nothing ends up under it.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--assist-bar", `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--assist-bar");
    };
  }, []);

  // ---- What it shows -------------------------------------------------------------------------------------------------------------
  const phase = session.phase;
  const listening = phase === "listening";
  const core: VoiceCoreState = listening ? "listening" : phase === "working" || phase === "countdown" ? "working" : phase === "suggested" || phase === "asking" || phase === "heard" ? "waiting" : phase === "failed" ? "failed" : phase === "applied" ? "done" : "idle";
  const langName = languageOf(settings.lang).name;
  const status = listening
    ? settings.mode === "live"
      ? `Listening in ${langName}. Pause to send; say "stop listening" to end.`
      : `Listening in ${langName}. Let go, or tap again, to send.`
    : phase === "countdown"
      ? "Sending… Tap the words to keep them and edit."
      : phase === "working"
        ? "Working out the change…"
        : phase === "heard"
          ? "Check the words, then send. Numbers that could be read two ways are held for you."
          : // A notice (taken back, nothing waiting, live talk stopped) is the newest thing to say, so it comes before a card's line.
            notice
            ? notice
            : phase === "suggested"
              ? "Your turn: check the change, then apply it."
              : phase === "asking"
                ? "Your turn: answer the question."
                : phase === "handoff"
                  ? "Your turn: open it in its tool to check, or leave it."
                  : phase === "failed" && session.message
                    ? `Not done. ${session.message}`
                    : !availability.ok
                  ? availability.reason
                  : settings.mode === "live"
                    ? "Tap the microphone to talk hands-free, or type, such as “A3 landscape”."
                    : "Hold the microphone to talk, or type, such as “lot B4 from points 1 to 4”. Enter sends.";
  const describedChanges = useMemo(() => describeTurn(changeOps, ctx), [changeOps, ctx]);
  const handoff = active && active.outcome === "suggested" && !pending ? (active.ops.find((o) => tierOf(o) === "handoff") as DivideOp | MeasureOp | undefined) : undefined;
  const failCard = !pending && !handoff && !showDrawer && active?.outcome === "failed";
  // What the bar shows in its quiet row: something happening (listening, working, a result, a reason), or nothing, and then the voice
  // mode instead. A card already says what it's waiting for, or why it wasn't done, so then its line is for screen readers only.
  const statusShown = listening || phase === "countdown" || phase === "working" || phase === "heard" || Boolean(notice) || (phase === "failed" && Boolean(session.message) && !failCard) || !availability.ok;
  const micLabel = listening ? (session.live ? "Stop live talk" : "Stop and send") : settings.mode === "live" ? "Start live talk" : "Hold to talk";
  return (
    <div data-hide-for-keyboard className="pointer-events-none fixed inset-x-0 bottom-[var(--tab-bar)] z-30 flex max-h-[calc(100dvh-var(--tab-bar)-4.5rem)] flex-col items-center gap-2 px-3 pb-3 lg:absolute lg:bottom-0 lg:max-h-full lg:px-4 lg:pb-4">
      {/* Cards stack above the bar and scroll as one when the screen is short; they never reach the page's header. */}
      <div className="pointer-events-none flex min-h-0 w-full flex-col items-center gap-2 overflow-y-auto overscroll-contain">
      {privacy ? (
        <NoteCard
          tone="info"
          title="Before you talk"
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  setSettings({ privacyNoted: true });
                  setPrivacy(false);
                  window.setTimeout(() => startRef.current(), 0);
                }}
                className={buttonClasses("primary", "sm")}
              >
                <MicrophoneIcon size={16} weight="bold" aria-hidden />
                Start talking
              </button>
              <button type="button" onClick={() => (setPrivacy(false), input.current?.focus())} className={buttonClasses("ghost", "sm")}>
                Type instead
              </button>
            </>
          }
        >
          <p>
            {availability.ok && availability.company ? `${availability.company} turns your speech into text in this browser.` : "This browser turns your speech into text on this device."} Farbaek gets only the text, never the sound, and keeps your instructions with the project so you can find them again.
          </p>
          <p>Nothing changes the plan until you apply it, and every value is shown for you to check first.</p>
        </NoteCard>
      ) : null}

      {pending && !showDrawer ? (
        <ChangeCard
          words={pending.words}
          say={pending.say}
          ops={changeOps}
          described={describedChanges}
          ticked={changeOps.map((_, i) => ticked[i] !== false)}
          onTick={(i, on) => setTicked(Object.assign(changeOps.map((_, j) => ticked[j] !== false), { [i]: on }))}
          dropped={pending.dropped}
          approvedVersion={bridge.approved && !bridge.dirty}
          comparing={comparing}
          onCompare={setComparing}
          onApply={() => applyTurn(pending)}
          onEdit={() => {
            decide(pending, "discarded");
            updateTurn(pending.id, { open: false, outcome: "discarded", message: "Changed the words." });
            bridge.setPreview(null);
            decided(false);
            toTyping(pending.words);
          }}
          onDiscard={() => {
            decide(pending, "discarded");
            updateTurn(pending.id, { open: false, outcome: "discarded" });
            bridge.setPreview(null);
            decided(true);
          }}
          readOnly={bridge.readOnly}
        />
      ) : null}

      {!pending && handoff && !showDrawer ? (
        <HandoffCard
          words={active!.words}
          described={describeOp(handoff, ctx)}
          action={handoff.kind === "divide" ? "Open the divide panel" : bridge.dirty ? "Save, then open the table" : "Open the table"}
          why={handoff.kind === "divide" ? "The divide panel shows the dividing lines and every share's area before anything is kept. New corners stay on paper until they're pegged." : "Measurements go into the plan only through the Import step's table, where you check every value and confirm the units and grid."}
          onOpen={() => {
            updateTurn(active!.id, { open: false, outcome: "handed_off" });
            // The tool takes over: the conversation ends here.
            if (session.live) stopLive();
            decided(false);
            if (handoff.kind === "divide") bridge.openDivide(handoff);
            else bridge.openEntry(handoff);
          }}
          onDismiss={() => {
            updateTurn(active!.id, { open: false, outcome: "discarded" });
            decided(true);
          }}
        />
      ) : null}

      {!pending && !handoff && !showDrawer && active?.outcome === "asked" && active.question ? (
        <QuestionCard
          question={active.question}
          onChoose={(c) => void run(c, "typed", true)}
          onDismiss={() => {
            updateTurn(active.id, { open: false });
            decided(true);
          }}
        />
      ) : null}

      {!pending && !handoff && !showDrawer && (active?.outcome === "answered" || (active?.outcome === "done" && active.answers.length > 0)) ? (
        <AnswerCard
          words={active.words}
          answers={active.answers}
          onDone={() => {
            updateTurn(active.id, { open: false });
            decided(true);
          }}
        />
      ) : null}

      {failCard && active ? (
        <NoteCard
          tone={session.failures >= 3 ? "attention" : "info"}
          title={session.failures >= 3 ? "Try another way" : "Not done"}
          actions={
            <button
              type="button"
              onClick={() => {
                updateTurn(active.id, { open: false });
                decided(false);
                toTyping(active.words);
              }}
              className={buttonClasses("secondary", "sm")}
            >
              Change the words
            </button>
          }
        >
          <p className="text-ink">{active.message}</p>
          {active.dropped.length > 1 ? (
            <ul className="grid list-disc gap-1 pl-5">
              {active.dropped.slice(1, 6).map((d, i) => (
                <li key={i}>
                  {d.what}: {d.why}
                </li>
              ))}
            </ul>
          ) : null}
          {session.failures >= 3 ? <p>Typing the values in the Lots step or the Plan step&apos;s Sheet panel may be quicker for this one.</p> : null}
        </NoteCard>
      ) : null}

      {showDrawer ? (
        <TurnsDrawer
          turns={turns}
          earlier={earlier}
          readOnly={Boolean(bridge.readOnly)}
          onClose={() => setDrawer(false)}
          onUseAgain={(w) => {
            setDrawer(false);
            toTyping(w);
          }}
          onTakeBack={takeBack}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          costNote={bridge.aiCost}
          settings={settings}
          setSettings={(change) => {
            if (change.speak === false) voice.cancel();
            // Changing how it hears drops what was being heard, so the next listen uses the new choice.
            if ("onDeviceTag" in change && latest.current.listening) cancelAll();
            setSettings(change);
          }}
          lang={settings.lang}
          family={family}
          languageNote={(id) => {
            const l = LANGUAGES.find((x) => x.id === id)!;
            const ok = voiceAvailability(id, family, speech.supported === true, id === "en" ? settings.onDeviceTag : null);
            return !l.enabled ? "Later" : ok.ok ? (ok.where === "device" ? "Heard on this device" : `Heard by ${ok.company ?? "the browser"}`) : "Type only here";
          }}
          speakUnavailable={voice.unavailable(settings.lang)}
          panelRef={settingsRef}
          onClose={closeSettings}
        />
      ) : null}
      </div>

      <div ref={barRef} className="pointer-events-auto w-full max-w-2xl shrink-0 max-[18em]:!shrink-0 overflow-hidden rounded-[1.375rem] bg-surface/85 shadow-e2 ring-1 ring-line/80 backdrop-blur-xl">
        {/* The command line: the mark, the words, then talk or send. */}
        <div className="flex items-center gap-1 py-1 pl-2.5 pr-1 max-[18em]:!flex-nowrap">
          {/* At the largest text sizes the words need the room; the quiet row still says what's happening. */}
          <span className="contents max-[18em]:hidden">
            <VoiceCore state={core} level={level} size="sm" />
          </span>
          <div className="min-w-0 flex-1 max-[18em]:!basis-0">
            {listening ? (
              <p aria-live="off" className="min-h-11 break-words px-1.5 py-2.5 text-base text-ink">
                {session.interim || <span className="text-ink-3">Listening…</span>}
              </p>
            ) : (
              <label className="block">
                <span className="sr-only">Instruction for the plan</span>
                <textarea
                  ref={input}
                  rows={1}
                  value={text}
                  maxLength={2000}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={onKey}
                  onFocus={keepWords}
                  onPointerDown={keepWords}
                  placeholder={availability.ok ? (settings.mode === "live" ? "Tap the microphone, or type" : "Hold the microphone, or type") : "Type an instruction"}
                  className="block max-h-36 min-h-11 w-full resize-none bg-transparent px-1.5 py-2.5 text-base text-ink placeholder:text-ink-3 focus:outline-none [field-sizing:content]"
                />
              </label>
            )}
          </div>
          {/* Send shows once there's something to send; the microphone is the bar's one dark control. */}
          {text.trim() && !listening ? (
            <button type="button" aria-label="Send" disabled={phase === "working"} onClick={() => void run(text, phase === "heard" ? "voice" : "typed")} className="inline-flex tap size-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent max-[18em]:!size-[44px] max-[18em]:!shrink-0 transition-[transform,background-color] duration-150 hover:bg-accent-strong active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 motion-safe:animate-[usage-in_160ms_cubic-bezier(0.16,1,0.3,1)_both]">
              <PaperPlaneRightIcon size={16} weight="fill" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={availability.ok ? micLabel : `Talking is off: ${availability.reason}`}
            aria-disabled={!availability.ok || undefined}
            onPointerDown={(e) => {
              if (e.button !== 0 || !availability.ok) return;
              e.preventDefault();
              micDown();
            }}
            onPointerUp={micUp}
            onPointerCancel={micUp}
            onPointerLeave={() => holding.current && micUp()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !e.repeat && availability.ok) {
                e.preventDefault();
                if (listening) {
                  if (session.live) stopLive();
                  else speech.stop();
                } else startListening();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`inline-flex tap size-10 shrink-0 touch-none select-none items-center justify-center rounded-full max-[18em]:!size-[44px] max-[18em]:!shrink-0 transition-[transform,background-color] duration-150 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${listening ? "bg-accent text-on-accent shadow-e1" : availability.ok ? "bg-ink text-surface hover:bg-ink/90" : "bg-canvas-2 text-ink-3"}`}
          >
            {listening ? <StopIcon size={16} weight="fill" aria-hidden /> : availability.ok ? <MicrophoneIcon size={16} weight="fill" aria-hidden /> : <MicrophoneSlashIcon size={16} weight="bold" aria-hidden />}
          </button>
        </div>
        {/* The quiet row: what's happening, or the voice mode; then undo, settings and earlier instructions. */}
        <div className="flex min-h-11 items-center gap-2 border-t border-line/60 pb-1 pl-1.5 pr-1 max-[18em]:flex-wrap max-[18em]:justify-end">
          {statusShown ? (
            <p aria-hidden className="min-w-0 flex-1 px-1.5 py-1.5 text-xs leading-snug text-ink-2 max-[18em]:basis-full">
              {status}
            </p>
          ) : (
            <div role="radiogroup" aria-label="How you talk" onKeyDown={onModeKey} className="flex min-w-0 flex-1 items-center max-[18em]:basis-full">
              {MODES.map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={settings.mode === m}
                  tabIndex={settings.mode === m ? 0 : -1}
                  onClick={() => chooseMode(m)}
                  className={`relative min-h-11 px-2.5 text-xs font-medium max-[18em]:!px-[8px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent ${settings.mode === m ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
                >
                  {label}
                  {/* The chosen mode is marked by a short rule under its name, as well as its weight. */}
                  <span aria-hidden className={`absolute inset-x-2.5 bottom-2 h-0.5 rounded-full transition-opacity duration-150 ${settings.mode === m ? "bg-ink opacity-100" : "opacity-0"}`} />
                </button>
              ))}
            </div>
          )}
          {/* For screen readers, the status is always said here, whether or not the row shows it. */}
          <p role="status" className="sr-only">
            {status}
          </p>
          {lastUndoable && !bridge.readOnly ? (
            <button type="button" aria-label="Undo the assistant's last change" title="Undo the assistant's last change" onClick={() => takeBack(lastUndoable)} className="inline-flex tap size-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 max-[18em]:!size-[44px] max-[18em]:!shrink-0 hover:bg-canvas-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
              <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            aria-label="Assistant settings"
            title="Assistant settings"
            onClick={(e) => (settingsOpen ? closeSettings(false) : openSettings(e.currentTarget))}
            className="inline-flex tap size-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 max-[18em]:!size-[44px] max-[18em]:!shrink-0 hover:bg-canvas-2 hover:text-ink aria-expanded:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <SlidersHorizontalIcon size={16} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            aria-expanded={showDrawer}
            aria-label="Earlier instructions"
            title="Earlier instructions"
            onClick={() => {
              if (!showDrawer) setDrawerAt(Date.now());
              setDrawer(!showDrawer);
            }}
            className="inline-flex tap size-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 max-[18em]:!size-[44px] max-[18em]:!shrink-0 hover:bg-canvas-2 hover:text-ink aria-expanded:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ClockCounterClockwiseIcon size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
