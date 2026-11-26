"use client";

/**
 * One conversation in Farbaek Chat (stage 199, ADR 0213): the header, the thread and the composer, and the streaming turn behind
 * them. A question shows at once with a placeholder answer; the answer streams in, a frame at a time; Stop (or Esc) ends it and
 * keeps what was written. Editing a question or asking again makes a branch the arrows switch between. The thread stays at the
 * newest message while the person is there, and leaves them be when they've scrolled up to read.
 */
import { ArchiveIcon, ArrowDownIcon, CodeIcon, DotsThreeIcon, FileTextIcon, FolderSimpleIcon, ImageSquareIcon, LightbulbIcon, ListIcon, MagnifyingGlassIcon, NotePencilIcon, PenNibIcon, PencilSimpleIcon, PushPinIcon, PushPinSlashIcon, ShareNetworkIcon, TrashIcon, UploadSimpleIcon } from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { CHAT_LIMITS, HOME_QUESTION_KEY, titleFrom, type HandOff, type ChatFile, type ChatMessage, type TurnEvent, type TurnRequest } from "@/core/chat/protocol";
import { offeredChoices, speakable } from "@/core/chat/markdown";
import { handOffPlan, suggestHandOffs } from "@/core/chat/handoff";
import { ScheduleOffer } from "@/components/chat/schedule-offer";
import { HeroVisual } from "@/components/three/hero-visual";
import { useSpeaker } from "./use-speaker";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { branchAction, earlierMessagesAction, rateAnswerAction, switchBranchAction } from "@/app/app/chat/actions";
import { useChat } from "./chat-shell";
import { Composer, type ComposerHandle, type SendInput } from "./composer";
import { ImageViewer } from "./dialogs";
import { AnswerMessage, fileUrl, UserMessage } from "./message";
import type { LiveSearch } from "./web-sources";
import { IconButton, Menu, useToast } from "./primitives";
import { useChatPrefs, useReducedMotion } from "./prefs";
import { readTurnStream } from "./stream";

export interface ConversationInfo {
  id: string;
  title: string;
  pinned: boolean;
  shared: boolean;
}

const TEMP_QUESTION = "pending-question";
const TEMP_ANSWER = "pending-answer";

function placeholder(id: string, role: "user" | "assistant", over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, parentId: null, role, kind: "text", content: "", status: role === "user" ? "complete" : "streaming", modelName: null, error: null, rating: null, thinkingMs: null, meta: {}, createdAt: new Date().toISOString(), siblings: [id], files: [], ...over };
}

const SUGGESTIONS = [
  { icon: CodeIcon, tone: "var(--color-accent)", title: "Write code", detail: "Write, explain or fix code in any language.", prompt: "Help me write code that " },
  { icon: MagnifyingGlassIcon, tone: "var(--color-spark-aqua)", title: "Research anything", detail: "A clear explanation with the points that matter.", prompt: "Explain the key points of " },
  { icon: ImageSquareIcon, tone: "var(--color-spark-rose)", title: "Create an image", detail: "Describe it, and Farbaek draws it.", prompt: "", mode: "image" as const },
  { icon: FileTextIcon, tone: "var(--color-spark-leaf)", title: "Analyze documents", detail: "Attach a PDF or text file to summarise or question it.", prompt: "Summarise this document and list its main points.", attach: true },
  { icon: LightbulbIcon, tone: "var(--color-spark-ember)", title: "Brainstorm ideas", detail: "Fresh angles in a minute, ready to build on.", prompt: "Give me ten ideas for " },
  { icon: PenNibIcon, tone: "var(--color-accent)", title: "Write and improve", detail: "Draft, shorten or polish any text.", prompt: "Improve this text so it reads clearly and warmly:\n\n" },
];

export function ConversationView({ conversation, initialMessages, initialHasEarlier, projectId = null }: { conversation: ConversationInfo | null; initialMessages: ChatMessage[]; initialHasEarlier: boolean; projectId?: string | null }) {
  const chat = useChat();
  const toast = useToast();
  const router = useRouter();
  const reduced = useReducedMotion();
  const voice = useSpeaker();
  const prefs = useChatPrefs();
  const [convId, setConvId] = useState<string | null>(conversation?.id ?? null);
  const [title, setTitle] = useState(conversation?.title ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [live, setLive] = useState<{ answerId: string; thinking: string | null; search?: LiveSearch | null } | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name: string; prompt: string | null; width: number | null; height: number | null } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const buffer = useRef("");
  const frame = useRef(0);
  const answerRef = useRef<string | null>(null);
  const prepend = useRef<number | null>(null);
  const loadingEarlier = useRef(false);
  const dragDepth = useRef(0);
  // Set when the person goes to a new chat mid-turn: the old turn then changes nothing on screen.
  const abandoned = useRef(false);

  // "New chat" from a conversation that started on this page: the page stays, so it starts afresh here.
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (pathname === "/app/chat" && convId !== null) {
      setConvId(null);
      setTitle("");
      setMessages([]);
      setHasEarlier(false);
      setLive(null);
    }
  }
  useEffect(() => {
    if (pathname !== "/app/chat" || !controller.current) return;
    abandoned.current = true;
    controller.current.abort();
  }, [pathname]);

  const info = convId ? chat.conversations.find((c) => c.id === convId) : undefined;
  const busy = live !== null;
  const empty = messages.length === 0 && !busy;

  useEffect(() => {
    chat.setActive(convId);
    return () => chat.setActive(null);
  }, [chat, convId]);

  // Stops the answer when the person leaves the conversation.
  useEffect(() => () => controller.current?.abort(), []);

  // A question asked on the homepage before signing in waits here once, ready to send: the person still presses send.
  useEffect(() => {
    if (conversation || !new URLSearchParams(window.location.search).has("ask")) return;
    let question: string | null = null;
    try {
      question = window.localStorage.getItem(HOME_QUESTION_KEY);
      window.localStorage.removeItem(HOME_QUESTION_KEY);
    } catch {
      // Storage refused: nothing waiting.
    }
    window.history.replaceState(null, "", projectId ? `/app/chat?project=${projectId}` : "/app/chat");
    if (question?.trim()) composer.current?.fill(question.slice(0, 8_000));
  }, [conversation, projectId]);

  // "/" goes to the message box from anywhere that isn't a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.closest("dialog[open]"))) return;
      e.preventDefault();
      composer.current?.focus();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && controller.current && !document.querySelector("dialog[open]")) controller.current.abort();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  // Keeps the newest message in view while the person is at the bottom; holds their place when earlier messages are added above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prepend.current !== null) {
      el.scrollTop += el.scrollHeight - prepend.current;
      prepend.current = null;
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, live]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    stick.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (el.scrollTop < 240 && hasEarlier && !loadingEarlier.current && convId && messages[0]?.parentId) void loadEarlier();
  };

  const loadEarlier = async () => {
    const first = messages[0];
    if (!convId || !first?.parentId) return;
    loadingEarlier.current = true;
    const r = await earlierMessagesAction(convId, first.parentId);
    loadingEarlier.current = false;
    if (!r.ok) {
      toast({ text: r.message, tone: "error" });
      return;
    }
    prepend.current = scroller.current?.scrollHeight ?? null;
    setMessages((ms) => [...r.value, ...ms]);
    setHasEarlier(r.value.length >= CHAT_LIMITS.page && r.value[0]?.parentId !== null);
  };

  const flush = useCallback(() => {
    frame.current = 0;
    const text = buffer.current;
    const id = answerRef.current;
    if (!text || !id) return;
    buffer.current = "";
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)));
  }, []);

  /** One turn: the optimistic messages show at once, then the stream fills the answer. Returns once the answer has ended. */
  const runTurn = useCallback(
    async (body: TurnRequest, keep: ChatMessage[], temps: ChatMessage[], restore: (() => void) | null) => {
      const before = messages;
      const ctrl = new AbortController();
      controller.current = ctrl;
      abandoned.current = false;
      stick.current = true;
      const first = messages.length === 0;
      const apply = () => {
        setMessages([...keep, ...temps]);
        setLive({ answerId: temps[temps.length - 1]!.id, thinking: null });
      };
      // The composer glides from the welcome screen to the bottom (a view transition), unless motion is unwelcome.
      const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
      if (first && vt && !reduced) vt.call(document, () => flushSync(apply));
      else apply();
      answerRef.current = temps[temps.length - 1]!.id;

      let res: Response;
      try {
        res = await fetch("/app/chat/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      } catch {
        if (controller.current === ctrl) controller.current = null;
        // Gone to a new chat meanwhile: nothing of this one is put back.
        if (abandoned.current) return;
        setLive(null);
        if (ctrl.signal.aborted && convId) {
          // Stopped while the server was getting ready: it may already have saved the question, so the branch is read again.
          const r = await branchAction(convId);
          if (r.ok) {
            setMessages(r.value);
            return;
          }
        }
        setMessages(before);
        restore?.();
        if (!ctrl.signal.aborted) toast({ text: "Farbaek couldn't be reached. Check the connection, then send it again.", tone: "error" });
        return;
      }
      if (!res.ok || !res.body) {
        const reply = (await res.json().catch(() => null)) as { message?: string } | null;
        if (controller.current === ctrl) controller.current = null;
        if (abandoned.current) return;
        setMessages(before);
        setLive(null);
        restore?.();
        toast({ text: reply?.message ?? "That couldn't be sent. Try again.", tone: "error" });
        return;
      }

      let ended = false;
      const convIdRef = { current: convId as string | null };
      const handle = (e: TurnEvent) => {
        if (e.type === "start") {
          const prevAnswerSiblings = body.action === "regenerate" ? (before.find((m) => m.parentId === body.messageId)?.siblings ?? []) : [];
          const prevQuestionSiblings = body.action === "edit" ? (before.find((m) => m.id === body.messageId)?.siblings ?? []) : [];
          const question = e.question ? { ...e.question, siblings: body.action === "edit" ? [...prevQuestionSiblings, e.question.id] : e.question.siblings } : null;
          const answer = { ...e.answer, siblings: body.action === "regenerate" ? [...prevAnswerSiblings, e.answer.id] : body.action === "continue" ? e.answer.siblings : [e.answer.id] };
          answerRef.current = answer.id;
          setMessages((ms) => {
            const out: ChatMessage[] = [];
            for (const m of ms) {
              if (m.id === TEMP_QUESTION) {
                if (question) out.push(question);
              } else if (m.id === TEMP_ANSWER || (body.action === "continue" && m.id === answer.id)) out.push({ ...answer, content: body.action === "continue" ? m.content : answer.content });
              else out.push(m);
            }
            return out;
          });
          setLive((l) => (l ? { ...l, answerId: answer.id } : l));
          if (e.created || !convId) {
            setConvId(e.conversationId);
            const firstText = question?.content ?? ("text" in body ? body.text : "");
            const name = titleFrom(firstText);
            setTitle(name);
            chat.upsert({ id: e.conversationId, title: name, updatedAt: new Date().toISOString(), projectId: projectId ?? null });
            window.history.replaceState(null, "", `/app/chat/${e.conversationId}`);
          } else {
            // A chat that wasn't in the sidebar's list (an older or archived one) is added with what the page knows of it, so it
            // keeps its name and the project it is filed under.
            const listed = chat.conversations.some((c) => c.id === e.conversationId);
            chat.upsert({ id: e.conversationId, updatedAt: new Date().toISOString(), ...(listed || !conversation ? {} : { title: conversation.title, pinned: conversation.pinned, shared: conversation.shared, projectId: projectId ?? null }) });
          }
          if (e.note) toast({ text: e.note, tone: "info" });
        } else if (e.type === "route") {
          // Another model took the question: its thinking starts afresh, and the answer names it.
          const id = answerRef.current;
          setLive((l) => (l ? { ...l, thinking: null } : l));
          setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, modelName: e.modelName } : m)));
          toast({ text: e.note, tone: "info" });
        } else if (e.type === "search") {
          // Checking the live web (stage 205): the status line follows it, and the saved facts go on the answer when it ends.
          setLive((l) => (l ? { ...l, search: { stage: e.stage, queries: e.queries ?? l.search?.queries, pages: e.pages, round: e.round } } : l));
          if (e.search) {
            const id = answerRef.current;
            const found = e.search;
            setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, meta: { ...m.meta, search: found } } : m)));
          }
        } else if (e.type === "thinking") {
          setLive((l) => (l ? { ...l, thinking: `${l.thinking ?? ""}${e.v}` } : l));
        } else if (e.type === "text") {
          buffer.current += e.v;
          if (!frame.current) frame.current = requestAnimationFrame(flush);
        } else if (e.type === "image") {
          const id = answerRef.current;
          setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, files: [...m.files, e.file] } : m)));
        } else if (e.type === "title") {
          setTitle(e.title);
          if (convIdRef.current) chat.upsert({ id: convIdRef.current, title: e.title });
        } else if (e.type === "done") {
          ended = true;
          cancelAnimationFrame(frame.current);
          flush();
          const id = answerRef.current;
          setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, status: e.status, error: e.error, thinkingMs: e.thinkingMs, modelName: e.modelName ?? m.modelName, meta: { ...m.meta, stop: e.stop ?? undefined } } : m)));
          setLive(null);
        }
      };
      try {
        await readTurnStream(res.body, (parsed) => {
          if (parsed.type === "start") convIdRef.current = parsed.conversationId;
          handle(parsed);
        });
      } catch {
        // Stopped, or the connection dropped: what arrived is kept, and the server saved it too.
      }
      // The stream stays open a moment after its answer ends (naming the chat); a newer turn's Stop is left alone.
      if (controller.current === ctrl) controller.current = null;
      if (!ended && !abandoned.current) {
        cancelAnimationFrame(frame.current);
        flush();
        const id = answerRef.current;
        const stopped = ctrl.signal.aborted;
        setMessages((ms) => ms.flatMap((m) => (m.id === TEMP_QUESTION ? [] : m.id === id ? [{ ...m, status: "stopped" as const, error: stopped ? null : "The connection dropped. What arrived is kept." }] : [m])));
        setLive(null);
        if (!stopped) toast({ text: "The connection dropped. What arrived is kept; continue it when you're back online.", tone: "error" });
      }
    },
    [chat, conversation, convId, flush, messages, projectId, reduced, toast],
  );

  const tail = messages[messages.length - 1];
  // The places worth offering under the newest answer (stage 206): read from what the person last asked.
  const lastQuestion = messages.findLast((m) => m.role === "user");
  const lastAsked = lastQuestion?.content ?? "";
  // A choice the person pressed under an answer is the model's words, not theirs: nothing is offered as a schedule for it
  // (ADR 0280), however it reads.
  const pressedChoice = useMemo(() => {
    const at = lastQuestion ? messages.indexOf(lastQuestion) : -1;
    const before = at > 0 ? messages.slice(0, at).findLast((m) => m.role === "assistant") : undefined;
    if (!before || !lastAsked) return false;
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    return offeredChoices(before.content).some((choice) => flat(choice) === flat(lastAsked));
  }, [messages, lastQuestion, lastAsked]);
  const offered = useMemo(() => suggestHandOffs(lastAsked), [lastAsked]);

  const send = (input: SendInput): boolean => {
    if (busy) return false;
    if (tail && tail.role === "user") {
      toast({ text: "The last question has no answer yet. Ask again with the arrow on it, or edit it.", tone: "error" });
      return false;
    }
    const parentId = tail?.id ?? null;
    const question = placeholder(TEMP_QUESTION, "user", { content: input.text, files: input.files, parentId });
    const answer = placeholder(TEMP_ANSWER, "assistant", { kind: input.mode, meta: input.mode === "image" ? { aspect: input.aspect, prompt: input.text } : {} });
    void runTurn(
      { action: "send", conversationId: convId, parentId: convId ? parentId : null, text: input.text, files: input.files.map((f) => f.id), model: input.model, effort: input.effort, language: { answer: prefs.answerLanguage, script: prefs.answerScript }, web: prefs.searchWeb, memory: prefs.useMemory, project: prefs.useProject, mode: input.mode, aspect: input.aspect, projectId: convId ? null : projectId },
      messages,
      [question, answer],
      () => composer.current?.fill(input.text, { mode: input.mode, files: input.files }),
    );
    return true;
  };

  // `checkWeb` answers again after searching the live web, whatever the question looks like (stage 206).
  const regenerate = (answer: ChatMessage, checkWeb = false) => {
    if (busy || !convId || !answer.parentId) return;
    const at = messages.findIndex((m) => m.id === answer.parentId);
    if (at < 0) return;
    const p = prefs;
    void runTurn(
      { action: "regenerate", conversationId: convId, messageId: answer.parentId, replacing: answer.id, model: p.model, effort: p.effort, language: { answer: p.answerLanguage, script: p.answerScript }, web: checkWeb ? true : p.searchWeb, memory: p.useMemory, project: p.useProject, ...(checkWeb ? { research: "search" as const } : {}), mode: answer.kind, aspect: ((answer.meta.aspect as SendInput["aspect"]) ?? "1:1") },
      messages.slice(0, at + 1),
      [placeholder(TEMP_ANSWER, "assistant", { kind: answer.kind, parentId: answer.parentId, meta: answer.kind === "image" ? { aspect: answer.meta.aspect, prompt: answer.meta.prompt } : {} })],
      null,
    );
  };

  const askAgain = (question: ChatMessage) => {
    if (busy || !convId) return;
    const at = messages.findIndex((m) => m.id === question.id);
    const p = prefs;
    void runTurn({ action: "regenerate", conversationId: convId, messageId: question.id, model: p.model, effort: p.effort, language: { answer: p.answerLanguage, script: p.answerScript }, web: p.searchWeb, memory: p.useMemory, project: p.useProject, mode: "text", aspect: "1:1" }, messages.slice(0, at + 1), [placeholder(TEMP_ANSWER, "assistant", { parentId: question.id })], null);
  };

  const edit = (question: ChatMessage, text: string) => {
    if (busy || !convId) return;
    const at = messages.findIndex((m) => m.id === question.id);
    if (at < 0) return;
    const p = prefs;
    const nextAnswer = messages[at + 1];
    const mode = nextAnswer?.kind === "image" ? "image" : "text";
    void runTurn(
      { action: "edit", conversationId: convId, messageId: question.id, text, files: question.files.map((f) => f.id), model: p.model, effort: p.effort, language: { answer: p.answerLanguage, script: p.answerScript }, web: p.searchWeb, memory: p.useMemory, project: p.useProject, mode, aspect: ((nextAnswer?.meta.aspect as SendInput["aspect"]) ?? "1:1") },
      messages.slice(0, at),
      [placeholder(TEMP_QUESTION, "user", { content: text, files: question.files, parentId: question.parentId }), placeholder(TEMP_ANSWER, "assistant", { kind: mode, meta: mode === "image" ? { aspect: nextAnswer?.meta.aspect, prompt: text } : {} })],
      null,
    );
  };

  const continueAnswer = (answer: ChatMessage) => {
    if (busy || !convId) return;
    const at = messages.findIndex((m) => m.id === answer.id);
    const p = prefs;
    setMessages((ms) => ms.map((m) => (m.id === answer.id ? { ...m, status: "streaming", error: null } : m)));
    void runTurn({ action: "continue", conversationId: convId, messageId: answer.id, model: p.model, effort: p.effort, language: { answer: p.answerLanguage, script: p.answerScript }, memory: p.useMemory, project: p.useProject }, messages.slice(0, at), [{ ...answer, status: "streaming", error: null }], null);
  };

  const switchTo = async (id: string) => {
    if (busy || !convId) return;
    const r = await switchBranchAction(convId, id);
    if (!r.ok) {
      toast({ text: r.message, tone: "error" });
      return;
    }
    stick.current = false;
    setMessages(r.value);
    setHasEarlier(r.value.length >= CHAT_LIMITS.page && r.value[0]?.parentId !== null);
  };

  const rate = async (answer: ChatMessage, rating: -1 | 1 | null) => {
    setMessages((ms) => ms.map((m) => (m.id === answer.id ? { ...m, rating } : m)));
    const r = await rateAnswerAction(answer.id, rating);
    if (!r.ok) {
      setMessages((ms) => ms.map((m) => (m.id === answer.id ? { ...m, rating: answer.rating } : m)));
      toast({ text: r.message, tone: "error" });
    } else if (rating === -1) toast({ text: "Thanks. Ask again with the arrow for another answer.", tone: "info" });
  };

  const speak = (answer: ChatMessage) => {
    if (speaking === answer.id) {
      voice.cancel();
      setSpeaking(null);
      return;
    }
    const why = voice.unavailable();
    if (why) {
      toast({ text: why, tone: "error" });
      return;
    }
    setSpeaking(answer.id);
    voice.speak(speakable(answer.content), () => setSpeaking(null));
  };

  const share = () => {
    if (!convId) return;
    chat.share({ id: convId, title: title || "This chat", shared: info?.shared ?? conversation?.shared ?? false });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) composer.current?.attach(files);
  };

  // An answer's chips (stage 202): the request this conversation ends on goes to that space's box, through this browser's
  // storage and never the address. Nothing is made or charged until the person presses the button there.
  const handOff = (to: HandOff) => {
    const plan = handOffPlan(to, messages);
    try {
      if (plan.text) window.localStorage.setItem(plan.key, plan.text);
    } catch {
      // Storage refused: the box there opens empty.
    }
    router.push(plan.href);
  };

  const composerEl = (placement: "center" | "bottom") => (
    <Composer
      ref={composer}
      placement={placement}
      disabledReason={chat.availability.off}
      imagesOff={chat.availability.imagesOff}
      imagePercent={chat.availability.imagePercent}
      usagePercent={chat.availability.percent}
      models={chat.availability.models}
      busy={busy}
      onSend={send}
      onStop={() => controller.current?.abort()}
    />
  );

  const headerTitle = title || info?.title || "";
  // The project this chat is filed under (stage 282, ADR 0290). The list knows when it was moved in this visit; the page knows
  // where it was filed when it opened, and a new chat started inside a project is filed there.
  const filedUnder = info ? info.projectId : projectId;
  const projectName = filedUnder ? (chat.projects.find((p) => p.id === filedUnder)?.name ?? null) : null;
  const pinned = info?.pinned ?? conversation?.pinned ?? false;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files") || chat.availability.off) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
        <span className="lg:hidden">
          <IconButton label="Open your chats" icon={ListIcon} size={20} onClick={chat.openDrawer} />
        </span>
        <div className="min-w-0 flex-1 px-1.5">
          {convId ? (
            <>
              <h1 className={`sr-only ${FOCUSED_TITLE}`}>{headerTitle || "Chat"}</h1>
              <p className="truncate text-sm font-medium text-ink sm:text-base" aria-hidden>
                {headerTitle || "New chat"}
              </p>
            </>
          ) : null}
          {/* Said where the chat is, so it is no surprise that an answer knows the project. */}
          {projectName ? (
            <p className="flex min-w-0 items-center gap-1 text-xs text-ink-3">
              <FolderSimpleIcon size={14} weight="bold" aria-hidden className="shrink-0" />
              <span className="truncate">{prefs.useProject && !chat.demo ? `Farbaek AI knows ${projectName} by its files and tasks` : `Filed under ${projectName}`}</span>
            </p>
          ) : null}
        </div>
        {convId && !chat.demo ? (
          <>
            <button type="button" onClick={share} className="tap hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2 hover:bg-surface-raised hover:text-ink sm:inline-flex">
              <ShareNetworkIcon size={16} weight="bold" aria-hidden /> Share
            </button>
            <Menu
              label="Chat actions"
              items={[
                { label: "Share", icon: ShareNetworkIcon, onSelect: share },
                { label: "Rename", icon: PencilSimpleIcon, onSelect: () => chat.rename({ id: convId, title: headerTitle }) },
                { label: pinned ? "Unpin" : "Pin to the top", icon: pinned ? PushPinSlashIcon : PushPinIcon, onSelect: () => chat.pin({ id: convId }, !pinned) },
                { label: "Archive", icon: ArchiveIcon, onSelect: () => chat.archive({ id: convId, title: headerTitle }, true) },
                { label: "Delete", icon: TrashIcon, danger: true, onSelect: () => chat.confirmDelete({ id: convId, title: headerTitle }) },
              ]}
              trigger={({ ref, open, toggle, id }) => (
                <button ref={ref} type="button" aria-label="Chat actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink">
                  <DotsThreeIcon size={20} weight="bold" aria-hidden />
                </button>
              )}
            />
          </>
        ) : null}
        <Link href="/app/chat" aria-label="New chat" title="New chat (Ctrl Shift O)" className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink lg:hidden">
          <NotePencilIcon size={20} weight="bold" aria-hidden />
        </Link>
      </header>

      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 lg:justify-center">
            <div className="flex flex-1 flex-col justify-center py-6 lg:flex-none">
              <EmptyState
                demo={chat.demo}
                onPick={(s) => {
                  composer.current?.fill(s.prompt, { mode: s.mode ?? "text" });
                  if (s.attach) document.querySelector<HTMLInputElement>('.chat-root input[type="file"]')?.click();
                }}
              />
            </div>
            <div className="sticky bottom-0 -mx-4 bg-canvas pt-2 max-[18em]:static [@media(max-height:30rem)]:static lg:static lg:mx-0 lg:mt-8 lg:bg-transparent lg:pt-0">{composerEl("bottom")}</div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-label="Conversation" aria-live="off">
            <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 pb-10 pt-4 sm:px-6">
              {hasEarlier ? (
                <button type="button" onClick={() => void loadEarlier()} className="mx-auto min-h-10 rounded-full px-4 text-sm text-ink-3 hover:bg-surface-raised hover:text-ink">
                  Show earlier messages
                </button>
              ) : null}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={m.id} className="grid gap-1">
                    <UserMessage message={m} busy={busy} onEdit={chat.demo ? undefined : (text) => edit(m, text)} onSwitch={chat.demo ? undefined : (id) => void switchTo(id)} />
                    {i === messages.length - 1 && !busy && !chat.demo ? (
                      <button type="button" onClick={() => askAgain(m)} className="tap ml-auto min-h-10 rounded-full px-3 text-sm font-medium text-accent hover:bg-surface-raised">
                        Answer this
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <AnswerMessage
                    key={m.id}
                    message={m}
                    thinking={live?.answerId === m.id ? live.thinking : null}
                    search={live?.answerId === m.id ? (live.search ?? null) : null}
                    busy={busy}
                    last={i === messages.length - 1}
                    readOnly={chat.demo}
                    speaking={speaking === m.id}
                    handOffs={i === messages.length - 1 ? offered : undefined}
                    // What was asked, when it was asked for at a time: offered as a schedule, under the newest answer (ADR 0280).
                    // Not for a question with files: a scheduled run reads no files, so it couldn't do the same again.
                    after={i === messages.length - 1 && !busy && lastQuestion && lastAsked && !pressedChoice && lastQuestion.files.length === 0 ? <ScheduleOffer key={m.id} question={lastAsked} askedAt={lastQuestion.createdAt} conversationId={convId} roundup={m.meta.search?.roundup === true} /> : undefined}
                    actions={{
                      onChoose: (text) => void send({ text, files: [], mode: "text", aspect: "1:1", model: prefs.model, effort: prefs.effort }),
                      onCheckWeb: () => regenerate(m, true),
                      onRegenerate: () => regenerate(m),
                      onContinue: () => continueAnswer(m),
                      onRate: (r) => void rate(m, r),
                      onSpeak: () => speak(m),
                      onShare: share,
                      onHandOff: handOff,
                      onSwitch: (id) => void switchTo(id),
                      onOpenImage: (f: ChatFile) => setViewer({ src: fileUrl(f.id), name: f.name, prompt: m.meta.prompt ?? null, width: f.width, height: f.height }),
                      onEditImage: (f: ChatFile) => composer.current?.fill("", { mode: "image", files: [f] }),
                    }}
                  />
                ),
              )}
            </div>
          </div>
          {!atBottom ? (
            <button
              type="button"
              onClick={() => {
                stick.current = true;
                setAtBottom(true);
                scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
              }}
              className="tap absolute bottom-[calc(var(--chat-composer,7rem)+0.75rem)] left-1/2 z-10 inline-flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e2 hover:text-ink motion-safe:animate-[chat-pop_160ms_ease-out_both]"
              aria-label="Go to the newest message"
            >
              <ArrowDownIcon size={16} weight="bold" aria-hidden />
            </button>
          ) : null}
          {composerEl("bottom")}
        </>
      )}

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent/60 bg-canvas/85 text-sm font-medium text-ink backdrop-blur-sm motion-safe:animate-[chat-fade_120ms_ease-out_both]">
          <UploadSimpleIcon size={32} weight="bold" className="text-accent" aria-hidden />
          Drop files to attach them
          <span className="text-xs font-normal text-ink-3">Pictures, PDFs and text files, up to 5 MB each.</span>
        </div>
      ) : null}
      <ImageViewer image={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function EmptyState({ onPick, demo }: { onPick: (s: (typeof SUGGESTIONS)[number]) => void; demo: boolean }) {
  return (
    <div className="text-center motion-safe:animate-[chat-rise_320ms_cubic-bezier(0.16,1,0.3,1)_both]">
      {/* The cat in his orbit, as on the homepage: drawn in 2D everywhere, in 3D on desktops that can afford it, still
          under reduced motion. He leans toward the pointer and hops when pressed. Sized by the screen's height, so the
          message box is never pushed off a short screen. */}
      <div className="mx-auto w-[clamp(7.5rem,22svh,12.5rem)]">
        <HeroVisual sizes="200px" />
      </div>
      <h1 className={`relative mt-1 ${FOCUSED_TITLE}`}>What can I help you with?</h1>
      <p className="mx-auto mt-2 max-w-md text-body leading-relaxed text-ink-2">Think freely. Create boldly. Get more done with Farbaek.</p>
      {demo ? <p className="mx-auto mt-3 max-w-md text-sm text-ink-3">This is the demo workspace: open the sample chat in the sidebar to see how answers look.</p> : null}
      <ul className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-2.5 text-left sm:mt-8 sm:grid-cols-3">
        {SUGGESTIONS.map((s, i) => (
          <li key={s.title} className={`${i >= 4 ? "max-sm:hidden " : ""}motion-safe:animate-[chat-rise_280ms_cubic-bezier(0.16,1,0.3,1)_both]`} style={{ animationDelay: `${60 + i * 40}ms` }}>
            <button
              type="button"
              onClick={() => onPick(s)}
              style={{ "--tone": s.tone } as CSSProperties}
              className="group flex h-full min-h-20 w-full flex-col gap-2 rounded-md border border-line bg-surface p-3.5 text-left shadow-e1 transition-[border-color,box-shadow,transform] duration-200 ease-standard hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--tone)_42%,var(--color-line))] hover:shadow-[0_14px_30px_-18px_color-mix(in_oklab,var(--tone)_60%,transparent)] active:scale-[0.98] sm:p-4"
            >
              <span aria-hidden className="flex size-8 items-center justify-center rounded-full transition-transform duration-200 ease-standard group-hover:scale-110" style={{ background: "color-mix(in oklab, var(--tone) 11%, var(--color-surface))", color: "var(--tone)" }}>
                <s.icon size={16} weight="fill" />
              </span>
              <span className="text-sm font-medium text-ink">{s.title}</span>
              <span className="hidden text-xs leading-snug text-ink-3 sm:block">{s.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
