import "@/styles/chat-theme.css";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  GitBranchIcon,
  ImageIcon,
  LinkSimpleIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PenNibIcon,
  PushPinIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChatGlimpse } from "@/components/marketing/glimpses";
import { OtherSpaces } from "@/components/marketing/other-spaces";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { BEZEL } from "@/components/ui/surfaces";
import { LEAD, PUBLIC_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = {
  title: "Farbaek Chat",
  description:
    "Ask, write and code with AI in a private chat: answers as they're written, your PDFs and pictures in the question, every version kept, read-only links you control, and a model you choose or Farbaek picks.",
  alternates: { canonical: "/chat" },
};

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: PenNibIcon, title: "Answers as they're written", body: "Read along as the answer arrives, and stop it whenever you like. What was written so far is kept." },
  { icon: PaperclipIcon, title: "Your files in the question", body: "Pictures, PDFs and text files, up to six at a time. Each is checked by what's inside it, not by its name." },
  { icon: GitBranchIcon, title: "Every version kept", body: "Edit a question or ask for another answer. The earlier versions stay, one tap away." },
  { icon: SlidersHorizontalIcon, title: "Pick the model, or let Farbaek", body: "Auto picks a model for each question. Or choose one your plan includes, always shown by its name." },
  { icon: ImageIcon, title: "Pictures, made or changed", body: "Ask for a picture, or for a change to the last one, where picture making is available on your plan." },
  { icon: MicrophoneIcon, title: "Talk instead of typing", body: "Speak your question where your browser can hear it, and have any answer read aloud." },
  { icon: LinkSimpleIcon, title: "Read-only links", body: "Share a conversation with your workspace or with anyone, for 7 or 30 days, and turn the link off any time." },
  { icon: PushPinIcon, title: "Pin, search and archive", body: "Keep the chats you need at the top, and find any other by its name or by what was said." },
];

const PRIVATE = [
  "Only you can open your chats, while you're in the workspace. Other members can't, owners included.",
  "Leave a workspace and your chats in it are deleted.",
  "Answers are drawn by Farbaek, never run: no HTML from the model reaches your screen, and pictures it links to aren't loaded.",
  "Files are checked on Farbaek's servers before they're kept, and served back so they can't run in your browser.",
  "Your account export includes every chat.",
];

const OPEN = "/sign-in?next=/app/chat";

/**
 * Chat, the space for asking, writing and coding (ADR 0213, ADR 0214). Laid out like a conversation: a question as the
 * headline, the chat itself in light and dark, then what it does and how private it is.
 */
export default function ChatPage() {
  return (
    <>
      <section aria-labelledby="chat-title" className="relative overflow-hidden">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        <Container className="relative pb-12 pt-10 sm:pb-16 sm:pt-16 lg:pt-20">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center text-center">
            <h1 id="chat-title" className={PUBLIC_TITLE}>
              Ask, write and code, in a chat that&apos;s yours.
            </h1>
            <p className={`mt-5 max-w-[38rem] text-ink-2 sm:mt-6 ${LEAD}`}>
              Farbaek Chat answers as it writes, reads the files you add, and keeps every conversation private to you until you choose to share a read-only link.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2 sm:mt-9">
              <Link
                href={OPEN}
                className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-5 pr-1.5 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]"
              >
                Open Chat
                <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-0.5">
                  <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                </span>
              </Link>
              <Link href="#features" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised">
                What it can do
              </Link>
            </div>
          </Reveal>

          {/* The chat in both of its looks: dark behind, light in front. Sample conversation. */}
          <Reveal delay={0.12} className="relative mx-auto mt-14 max-w-[64rem] sm:mt-20">
            <div aria-hidden className="chat-root absolute -right-2 -top-10 hidden w-[78%] lg:block" data-chat-theme="dark">
              <div className="overflow-hidden rounded-lg bg-surface p-2 opacity-90 shadow-e3 ring-1 ring-line">
                <div className="h-[24rem] overflow-hidden rounded-md bg-surface ring-1 ring-line">
                  <ChatGlimpse />
                </div>
              </div>
            </div>
            <div className={`relative lg:mr-[18%] ${BEZEL} shadow-e3`}>
              <div className="h-[30rem] overflow-hidden rounded-md bg-surface ring-1 ring-line sm:h-[28rem]">
                <ChatGlimpse />
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-ink-3 lg:text-left">Sample conversation. Light by default, or dark if you prefer.</p>
          </Reveal>
        </Container>
      </section>

      <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
        <Container>
          <SectionHeading id="features-title" title="Made for real work, not a demo.">
            It lives in the same workspace as your projects, under the same plan and the same rules.
          </SectionHeading>
          <ul className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: FeatureIcon, title, body }) => (
              <li key={title} className="rounded-md border border-line bg-surface p-5 shadow-e1">
                <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
                  <FeatureIcon size={20} aria-hidden />
                </span>
                <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="private-title" className="pb-14 sm:pb-20 lg:pb-28">
        <Container>
          <div className={BEZEL}>
            <div className="grid gap-8 rounded-md bg-surface px-5 py-8 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
              <SectionHeading id="private-title" title="Private by default.">
                Your chats are yours. Sharing is something you do on purpose, one conversation at a time.
              </SectionHeading>
              <ul className="grid content-start gap-3">
                {PRIVATE.map((line) => (
                  <li key={line} className="flex gap-3 text-body leading-relaxed text-ink-2">
                    <CheckCircleIcon size={20} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-verified" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 max-w-[60ch] text-sm leading-relaxed text-ink-2">
            Chat uses your plan&apos;s AI usage, like every AI action in Farbaek, with a daily limit per person so one conversation can&apos;t use it all.{" "}
            <Link href="/pricing" className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
              See the plans <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </p>
        </Container>
      </section>

      <OtherSpaces current="chat" />
    </>
  );
}
