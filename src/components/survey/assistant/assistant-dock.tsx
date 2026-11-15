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
import { ClockCounterClockwiseIcon, MicrophoneIcon, MicrophoneSlashIcon, PaperPlaneRightIcon, SpeakerHighIcon, SpeakerSlashIcon, StopIcon, TranslateIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { answer as engineAnswer } from "@/core/survey/assistant/answer";
import type { Applied, Patch } from "@/core/survey/assistant/apply";
import { checkTurn } from "@/core/survey/assistant/check";
import { assistContext } from "@/core/survey/assistant/context";
import { describeOp, readBack } from "@/core/survey/assistant/describe";
import { LANGUAGES, browserFamily, languageOf, scriptOf, voiceAvailability, type AssistLanguage } from "@/core/survey/assistant/languages";
import { tierOf, type AssistOutput, type CheckedTurn, type PlanOp } from "@/core/survey/assistant/ops";
import { readCommand, type StepId } from "@/core/survey/assistant/reader";
import { ambiguousNumbers } from "@/core/survey/assistant/session";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import type { buildPlan } from "@/core/survey/view";
import { canonicalHash } from "@/core/trust/canonical-json";
import { decideAssistTurnAction } from "@/app/app/survey/assistant-actions";
import { buttonClasses } from "@/components/ui/button";
import { useAssistant, type Turn } from "./assistant-context";
import { AnswerCard, ChangeCard, HandoffCard, NoteCard, QuestionCard } from "./cards";
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
  approved: boolean;
  dirty: boolean;
  setPreview(ops: PlanOp[] | null): void;
  apply(ops: PlanOp[]): Applied;
  revert(patch: Patch): { ok: true } | { ok: false; changedSince: string[] };
  view(op: ViewOp): void;
  history(action: "undo" | "redo"): void;
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

export function AssistantDock({ bridge }: { bridge: EditorBridge }) {
  const a = useAssistant();
  if (!a) return null;
  return <Dock bridge={bridge} a={a} />;
}

function Dock({ bridge, a }: { bridge: EditorBridge; a: NonNullable<ReturnType<typeof useAssistant>> }) {
  const { settings, setSettings, session, dispatch, turns, addTurn, updateTurn } = a;
  const speech = useSpeech();
  const voice = useVoiceReply();
  const level = useMicLevel(session.phase === "listening");
  const family = useSyncExternalStore(noSubscribe, () => browserFamily(navigator.userAgent), () => "other" as const);
  const availability = voiceAvailability(settings.lang, family, speech.supported === true);
  const [text, setText] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [langMenu, setLangMenu] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [ticked, setTicked] = useState<boolean[]>([]);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const pauseTimer = useRef<number | undefined>(undefined);
  const countdownTimer = useRef<number | undefined>(undefined);
  const silenceTimer = useRef<number | undefined>(undefined);
  const pressedAt = useRef(0);
  const holding = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<() => void>(() => {});
  const runRef = useRef<(words: string, method: "voice" | "typed") => void>(() => {});

  const active = useMemo(() => [...turns].reverse().find((t) => t.open) ?? null, [turns]);
  const pending = active && active.outcome === "suggested" && active.ops.some((o) => tierOf(o) === "confirm" || tierOf(o) === "caution" || tierOf(o) === "now") ? active : null;
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

  const say = useCallback(
    (sentences: string[], lang: AssistLanguage, spoken: boolean, then?: () => void) => {
      if (settings.speak && spoken && sentences.length && !voice.unavailable(lang)) voice.speak(sentences, lang, then);
      else then?.();
    },
    [settings.speak, voice],
  );

  const resumeLive = useCallback(() => {
    if (settings.mode === "live" && session.live) startRef.current();
  }, [settings.mode, session.live]);

  /** What came of a checked turn: views at once; layers, labels and paper at once with Undo; values wait in a card; tools are handed over. */
  const finish = useCallback(
    (words: string, method: "voice" | "typed", engine: Turn["engine"], checked: CheckedTurn, serverId: string | null) => {
      const lang = method === "voice" ? settings.lang : scriptOf(words);
      const views = checked.ops.filter((o) => tierOf(o) === "view");
      for (const v of views) {
        if (v.kind === "view") bridge.view(v);
        else if (v.kind === "history") bridge.history(v.action);
      }
      const changes = checked.ops.filter((o) => ["now", "confirm", "caution"].includes(tierOf(o)));
      const needsLook = changes.some((o) => tierOf(o) !== "now");
      const answers = checked.ops.filter((o): o is Extract<PlanOp, { kind: "answer" }> => o.kind === "answer").map((o) => engineAnswer(o, { doc: bridge.doc, points: bridge.points, findings: bridge.plan.findings, scale: bridge.plan.sheet.scale, suggestedScale: bridge.plan.sheet.suggestedScale }));
      const handoffs = checked.ops.filter((o) => tierOf(o) === "handoff");
      const base: Turn = { id: newId(), at: Date.now(), words, inputMethod: method, lang, engine, say: checked.say, ops: checked.ops, dropped: checked.dropped, question: checked.question, answers, outcome: "failed", patch: null, serverId, message: "", open: false };
      const spoken = method === "voice" || settings.mode === "live";
      if (changes.length && (needsLook || bridge.readOnly)) {
        setTicked(changes.map(() => true));
        setComparing(false);
        addTurn({ ...base, outcome: "suggested", open: true });
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
        addTurn({ ...base, outcome: "done", patch: r.patch, message: changes.map((o) => describeOp(o, ctx).text).join(". "), open: false });
        dispatch({ type: "result", phase: "applied" });
        setNotice(`${changes.map((o) => describeOp(o, ctx).text).join(". ")}.`);
        say(["Done."], lang, spoken, resumeLive);
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
        addTurn({ ...base, outcome: "done", open: false });
        dispatch({ type: "result", phase: "applied" });
        resumeLive();
        return;
      }
      const why = checked.cannot ? CANNOT[checked.cannot] : checked.dropped.length ? `${checked.dropped[0]!.what}: ${checked.dropped[0]!.why}` : CANNOT.unclear;
      addTurn({ ...base, outcome: "failed", message: why, open: true });
      dispatch({ type: "failed", message: why });
      say([why], lang, spoken, resumeLive);
    },
    [addTurn, bridge, ctx, dispatch, resumeLive, say, settings.lang, settings.mode],
  );

  const control = useCallback(
    (c: NonNullable<ReturnType<typeof readCommand>> & { kind: "control" }, words: string, method: "voice" | "typed") => {
      const close = (id: string, outcome: Turn["outcome"]) => updateTurn(id, { open: false, outcome });
      if (c.control === "apply") {
        if (pending) applyTurn(pending);
        else setNotice("Nothing is waiting to be applied.");
      } else if (c.control === "discard") {
        if (active?.outcome === "suggested") decide(active, "discarded");
        if (active) close(active.id, active.outcome === "suggested" ? "discarded" : active.outcome);
        bridge.setPreview(null);
        dispatch({ type: "decided" });
      } else if (c.control === "stop") {
        stopLive();
      } else if (c.control === "save") bridge.save();
      else if (c.control === "goto" && c.step) bridge.goto(c.step);
      else if (c.control === "readback") {
        const lines = pending ? readBack(changeOps, ctx) : [];
        if (lines.length && !voice.unavailable(settings.lang)) voice.speak(lines, settings.lang);
        else setNotice(lines.length ? "This device can't read it back; the values are in the card." : "Nothing to read back.");
      }
      if (c.control !== "apply" && c.control !== "discard") dispatch({ type: "result", phase: "applied" });
      void words;
      void method;
    },
    // applyTurn and stopLive are declared below and read through the latest closure on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, pending, changeOps, ctx, settings.lang, voice],
  );

  /** Sends an instruction. */
  const run = useCallback(
    async (words: string, method: "voice" | "typed") => {
      const instruction = words.trim();
      if (!instruction) return;
      voice.cancel();
      bridge.setMarks([]);
      setNotice(null);
      if (active?.open && active.outcome !== "suggested") updateTurn(active.id, { open: false });
      dispatch({ type: "edit", text: instruction });
      dispatch({ type: "send" });
      const read = readCommand(instruction);
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
      if (bridge.aiOff) {
        const why = `${bridge.aiOff} Without AI the assistant still zooms, shows and hides layers, sets the paper and scale, moves labels, and answers the area, the checks and what's missing.`;
        addTurn({ id: newId(), at: Date.now(), words: instruction, inputMethod: method, lang: settings.lang, engine: "reader", say: "", ops: [], dropped: [], question: null, answers: [], outcome: "failed", patch: null, serverId: null, message: why, open: true });
        dispatch({ type: "failed", message: why });
        return;
      }
      inFlight.current?.abort();
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
        if (ac.signal.aborted) return;
        if (!body || !body.ok) {
          const why = body && !body.ok ? body.message : "The assistant didn't answer. Try again, or use the tools on the Lots and Plan steps.";
          addTurn({ id: newId(), at: Date.now(), words: instruction, inputMethod: method, lang: settings.lang, engine: "model", say: "", ops: [], dropped: [], question: null, answers: [], outcome: "failed", patch: null, serverId: null, message: why, open: true });
          dispatch({ type: "failed", message: why });
          return;
        }
        finish(instruction, method, "model", check(body.output), body.turnId);
      } catch {
        if (ac.signal.reason === "timeout") {
          const why = "The assistant took too long, so it was stopped and nothing was charged. Try again, or say it more simply.";
          addTurn({ id: newId(), at: Date.now(), words: instruction, inputMethod: method, lang: settings.lang, engine: "model", say: "", ops: [], dropped: [], question: null, answers: [], outcome: "failed", patch: null, serverId: null, message: why, open: true });
          dispatch({ type: "failed", message: why });
        } else dispatch({ type: "cancel" });
      } finally {
        window.clearTimeout(timeout);
        if (inFlight.current === ac) inFlight.current = null;
      }
    },
    [active, addTurn, bridge, control, dispatch, finish, pending, settings.lang, turns, updateTurn, voice],
  );
  useEffect(() => {
    runRef.current = (w, m) => void run(w, m);
  }, [run]);

  function applyTurn(t: Turn) {
    const ops = changeOps.filter((_, i) => ticked[i] !== false);
    const r = bridge.apply(ops);
    bridge.setPreview(null);
    if (!r.ok) {
      updateTurn(t.id, { open: false, outcome: "failed", message: r.error });
      setNotice(r.error);
      dispatch({ type: "decided" });
      return;
    }
    bridge.setMarks(r.touched);
    decide(t, "applied", ops);
    const skipped = r.skipped.length ? ` ${r.skipped.map((s) => `${s.what}: ${s.why}`).join(" ")}` : "";
    updateTurn(t.id, { open: false, outcome: "applied", patch: r.patch, message: `${ops.length === 1 ? "One change" : `${ops.length} changes`} applied.${skipped}` });
    setNotice(`${ops.length === 1 ? "One change" : `${ops.length} changes`} applied.${skipped}`);
    dispatch({ type: "decided" });
    say(["Applied."], t.lang, t.inputMethod === "voice" || settings.mode === "live", resumeLive);
  }

  function takeBack(t: Turn) {
    if (!t.patch) return;
    const r = bridge.revert(t.patch);
    if (r.ok) {
      if (t.outcome === "applied") decide(t, "reverted");
      updateTurn(t.id, { outcome: "reverted", message: "Taken back." });
      setNotice("Taken back.");
    } else setNotice(`It can't be taken back: ${r.changedSince.join(", ")} changed since. Undo by hand, or change it again.`);
  }

  // ---- Listening ----------------------------------------------------------------------------------------------------------------
  const clearTimers = () => {
    window.clearTimeout(pauseTimer.current);
    window.clearTimeout(countdownTimer.current);
  };

  const onHeard = useCallback(
    (words: string) => {
      clearTimers();
      const w = words.trim();
      if (!w) {
        dispatch({ type: "no_speech" });
        if (settings.mode === "live") window.setTimeout(() => startRef.current(), 150);
        return;
      }
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
    clearTimers();
    setText("");
    dispatch({ type: "listen", live: settings.mode === "live" });
    window.clearTimeout(silenceTimer.current);
    if (settings.mode === "live") silenceTimer.current = window.setTimeout(() => stopLive(), 60_000);
    speech.start({
      lang: availability.tag,
      continuous: true,
      onWords: (w) => {
        dispatch({ type: "interim", text: w });
        if (settings.mode === "live") {
          window.clearTimeout(pauseTimer.current);
          window.clearTimeout(silenceTimer.current);
          silenceTimer.current = window.setTimeout(() => stopLive(), 60_000);
          pauseTimer.current = window.setTimeout(() => speech.stop(), settings.pauseMs);
        }
      },
      onFinal: (w) => onHeard(w),
      onError: (code) => {
        const msg = speechErrorMessage(code, languageOf(settings.lang).name);
        dispatch({ type: "cancel" });
        if (msg) setNotice(msg);
      },
    });
    // stopLive is declared below; the latest one is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, dispatch, onHeard, settings.lang, settings.mode, settings.pauseMs, settings.privacyNoted, speech, voice]);
  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  function stopLive() {
    clearTimers();
    window.clearTimeout(silenceTimer.current);
    speech.abort();
    dispatch({ type: "stop_live" });
  }

  /** Stops everything at once: listening, a turn in flight, speech and the countdown. */
  const cancelAll = useCallback(() => {
    clearTimers();
    window.clearTimeout(silenceTimer.current);
    speech.abort();
    inFlight.current?.abort();
    voice.cancel();
    dispatch({ type: "cancel" });
  }, [dispatch, speech, voice]);

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
    // A hold (not a tap) ends on release, with a short tail so the last word isn't cut off.
    if (settings.mode === "push" && Date.now() - pressedAt.current > 350) window.setTimeout(() => speech.stop(), 400);
  };
  useEffect(() => {
    const onCanvas = () => (document.activeElement as HTMLElement | null)?.dataset?.planCanvas === "true";
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && onCanvas() && settings.mode === "push") {
        e.preventDefault();
        pressedAt.current = Date.now();
        holding.current = true;
        startRef.current();
      } else if (e.key === "Escape") cancelAll();
    };
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space" && holding.current && onCanvas()) {
        holding.current = false;
        window.setTimeout(() => speech.stop(), 400);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [cancelAll, settings.mode, speech]);

  // Live talk resumes after a spoken reply ends; a pause or tap during the countdown keeps the words to edit.
  const onType = (v: string) => {
    if (session.phase === "countdown") window.clearTimeout(countdownTimer.current);
    setText(v);
    dispatch({ type: "edit", text: v });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void run(text, session.phase === "heard" ? "voice" : "typed");
    }
  };

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
      ? "Sending… Type or tap to keep the words."
      : phase === "working"
        ? "Working out the change…"
        : phase === "heard"
          ? "Check the words, then send. Numbers that could be read two ways are held for you."
          : phase === "suggested"
            ? "Your turn: check the change, then apply it."
            : phase === "asking"
              ? "Your turn: answer the question."
              : notice
                ? notice
                : !availability.ok
                  ? availability.reason
                  : settings.mode === "live"
                    ? "Tap the microphone to talk hands-free, or type."
                    : "Hold the microphone to talk, or type. Enter sends.";
  const describedChanges = useMemo(() => changeOps.map((o) => describeOp(o, ctx)), [changeOps, ctx]);
  const handoff = active && active.outcome === "suggested" && !pending ? (active.ops.find((o) => tierOf(o) === "handoff") as DivideOp | MeasureOp | undefined) : undefined;
  const micLabel = listening ? (session.live ? "Stop live talk" : "Stop and send") : settings.mode === "live" ? "Start live talk" : "Hold to talk";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[var(--tab-bar)] z-30 flex flex-col items-center gap-2 px-3 pb-3 lg:absolute lg:bottom-0 lg:px-4 lg:pb-4">
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

      {pending ? (
        <ChangeCard
          words={pending.words}
          say={pending.say}
          ops={changeOps}
          described={describedChanges}
          ticked={changeOps.map((_, i) => ticked[i] !== false)}
          onTick={(i, on) => setTicked((t) => Object.assign([...t], { [i]: on }))}
          dropped={pending.dropped}
          approvedVersion={bridge.approved && !bridge.dirty}
          comparing={comparing}
          onCompare={setComparing}
          onApply={() => applyTurn(pending)}
          onEdit={() => {
            decide(pending, "discarded");
            updateTurn(pending.id, { open: false, outcome: "discarded", message: "Changed the words." });
            bridge.setPreview(null);
            setText(pending.words);
            dispatch({ type: "decided" });
            window.setTimeout(() => input.current?.focus(), 0);
          }}
          onDiscard={() => {
            decide(pending, "discarded");
            updateTurn(pending.id, { open: false, outcome: "discarded" });
            bridge.setPreview(null);
            dispatch({ type: "decided" });
          }}
          readOnly={bridge.readOnly}
        />
      ) : null}

      {!pending && handoff ? (
        <HandoffCard
          words={active!.words}
          described={describeOp(handoff, ctx)}
          action={handoff.kind === "divide" ? "Open the divide panel" : bridge.dirty ? "Save, then open the table" : "Open the table"}
          why={handoff.kind === "divide" ? "The divide panel shows the dividing lines and every share's area before anything is kept. New corners stay on paper until they're pegged." : "Measurements go into the plan only through the Import step's table, where you check every value and confirm the units and grid."}
          onOpen={() => {
            updateTurn(active!.id, { open: false, outcome: "handed_off" });
            if (handoff.kind === "divide") bridge.openDivide(handoff);
            else bridge.openEntry(handoff);
            dispatch({ type: "decided" });
          }}
          onDismiss={() => {
            updateTurn(active!.id, { open: false, outcome: "discarded" });
            dispatch({ type: "decided" });
          }}
        />
      ) : null}

      {!pending && !handoff && active?.outcome === "asked" && active.question ? (
        <QuestionCard
          question={active.question}
          onChoose={(c) => {
            updateTurn(active.id, { open: false });
            void run(`${active.words}. ${c}`, "typed");
          }}
          onDismiss={() => {
            updateTurn(active.id, { open: false });
            dispatch({ type: "decided" });
          }}
        />
      ) : null}

      {!pending && !handoff && active?.outcome === "answered" ? (
        <AnswerCard
          words={active.words}
          answers={active.answers}
          onDone={() => {
            updateTurn(active.id, { open: false });
            dispatch({ type: "decided" });
          }}
        />
      ) : null}

      {!pending && !handoff && active?.outcome === "failed" ? (
        <NoteCard
          tone={session.failures >= 3 ? "attention" : "info"}
          title={session.failures >= 3 ? "Try another way" : "Not done"}
          actions={
            <button
              type="button"
              onClick={() => {
                updateTurn(active.id, { open: false });
                setText(active.words);
                dispatch({ type: "decided" });
                window.setTimeout(() => input.current?.focus(), 0);
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

      {drawer ? (
        <TurnsDrawer
          turns={turns}
          readOnly={Boolean(bridge.readOnly)}
          onClose={() => setDrawer(false)}
          onUseAgain={(w) => {
            setText(w);
            setDrawer(false);
            window.setTimeout(() => input.current?.focus(), 0);
          }}
          onTakeBack={takeBack}
        />
      ) : null}

      {langMenu ? (
        <div role="menu" aria-label="Language" className="pointer-events-auto w-full max-w-3xl rounded-md bg-surface p-2 shadow-e2 ring-1 ring-line">
          {LANGUAGES.map((l) => {
            const ok = voiceAvailability(l.id, family, speech.supported === true);
            return (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={settings.lang === l.id}
                disabled={!l.enabled}
                onClick={() => {
                  setSettings({ lang: l.id });
                  setLangMenu(false);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm px-3 text-left text-sm text-ink hover:bg-canvas-2 disabled:cursor-not-allowed disabled:text-ink-3"
              >
                <span>
                  {l.native}
                  {l.native !== l.name ? <span className="text-ink-3"> ({l.name})</span> : null}
                </span>
                <span className="text-xs text-ink-3">{!l.enabled ? "Later" : ok.ok ? (ok.where === "device" ? "Heard on this device" : `Heard by ${ok.company ?? "the browser"}`) : "Type only here"}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="pointer-events-auto w-full max-w-3xl rounded-[1.75rem] bg-surface/90 shadow-e2 ring-1 ring-line backdrop-blur-md">
        <div className="flex items-end gap-2 p-2">
          <span className="flex h-12 items-center pl-1">
            <VoiceCore state={core} level={level} />
          </span>
          <div className="min-w-0 flex-1 self-center">
            {listening ? (
              <p aria-live="off" className="min-h-11 break-words px-1 py-2.5 text-base text-ink">
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
                  placeholder="Say or type: “lot B4 from points 1 to 4”"
                  className="block max-h-36 min-h-11 w-full resize-none bg-transparent px-1 py-2.5 text-base text-ink placeholder:text-ink-3 focus:outline-none [field-sizing:content]"
                />
              </label>
            )}
          </div>
          <button type="button" aria-haspopup="menu" aria-expanded={langMenu} aria-label={`Language: ${langName}`} onClick={() => setLangMenu((v) => !v)} className={buttonClasses("ghost", "sm", "h-12 px-3")}>
            <TranslateIcon size={16} weight="bold" aria-hidden />
            <span className="text-sm">{languageOf(settings.lang).native === "English" ? "EN" : languageOf(settings.lang).native}</span>
          </button>
          <button
            type="button"
            aria-label={availability.ok ? micLabel : `Talking is off: ${availability.reason}`}
            aria-pressed={listening}
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
            className={`inline-flex size-12 shrink-0 touch-none select-none items-center justify-center rounded-full transition-[transform,background-color] duration-150 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${listening ? "bg-accent text-surface shadow-e1" : availability.ok ? "bg-ink text-surface" : "bg-canvas-2 text-ink-3 ring-1 ring-line"}`}
          >
            {listening ? <StopIcon size={20} weight="fill" aria-hidden /> : availability.ok ? <MicrophoneIcon size={20} weight="fill" aria-hidden /> : <MicrophoneSlashIcon size={20} weight="bold" aria-hidden />}
          </button>
          <button type="button" aria-label="Send" disabled={!text.trim() || phase === "working"} onClick={() => void run(text, phase === "heard" ? "voice" : "typed")} className={buttonClasses("secondary", "sm", "size-12 shrink-0 !px-0")}>
            <PaperPlaneRightIcon size={20} weight="fill" aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1.5">
          <div role="radiogroup" aria-label="How you talk" className="inline-flex rounded-full bg-canvas-2 p-0.5 ring-1 ring-line">
            {(
              [
                ["push", "Push to talk"],
                ["live", "Live talk"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={settings.mode === m}
                onClick={() => {
                  if (listening) cancelAll();
                  setSettings({ mode: m });
                }}
                className={`min-h-9 rounded-full px-3 text-xs font-medium transition-colors duration-150 ${settings.mode === m ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p role="status" className="min-w-0 flex-1 px-1 text-xs text-ink-3">
            {status}
          </p>
          {lastUndoable && !bridge.readOnly ? (
            <button type="button" onClick={() => takeBack(lastUndoable)} className={buttonClasses("ghost", "sm", "min-h-9 text-xs")}>
              Undo
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={settings.speak}
            aria-label={settings.speak ? "Spoken replies on" : "Spoken replies off"}
            title={voice.unavailable(settings.lang) ?? undefined}
            onClick={() => {
              if (settings.speak) voice.cancel();
              setSettings({ speak: !settings.speak });
            }}
            className={buttonClasses("ghost", "sm", "size-11 !px-0")}
          >
            {settings.speak ? <SpeakerHighIcon size={16} weight="bold" aria-hidden /> : <SpeakerSlashIcon size={16} weight="bold" aria-hidden />}
          </button>
          <button type="button" aria-expanded={drawer} aria-label="Earlier instructions" onClick={() => setDrawer((v) => !v)} className={buttonClasses("ghost", "sm", "size-11 !px-0")}>
            <ClockCounterClockwiseIcon size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
