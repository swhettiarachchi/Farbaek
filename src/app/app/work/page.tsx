import { CalendarCheckIcon, CheckCircleIcon, PauseCircleIcon, PlayCircleIcon, UserFocusIcon } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { BoardList } from "@/components/command/board-list";
import { PauseControl } from "@/components/incidents/pause-control";
import { PAGE_STACK } from "@/components/ui/surfaces";
import { boardSentence } from "@/core/command/board";
import { othersSentence } from "@/core/command/status";
import { loadWork, pauseReasons, type WorkContext } from "@/server/command/load-work";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "All work" };

/**
 * All work (stage 276, ADR 0283): everything Farbaek is doing for this person in one place, sorted by what it needs from them, with
 * the workspace's one pause. Each row opens the page that owns it; nothing is changed here but the pause. The reads and who may act
 * are `loadWork`'s, which the assistant's answer to "what needs me?" shares (stage 290); which list each thing goes in is worked out
 * by tested code (`core/command/board.ts`).
 */
export default async function AllWorkPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const work = await loadWork(ctx as WorkContext, new Date());
  const { board, unread, liveNow, canAct, tour, live } = work;
  const { pauseReason, resumeReason } = pauseReasons(work);
  const others = othersSentence(board.others, canAct);

  return (
    <div className={`${PAGE_STACK} max-w-4xl`}>
      <PageHeader title="All work" description="Everything Farbaek is doing for you, in one place: what needs you, what is in progress, what is scheduled and what just finished." />

      <p className="text-body leading-relaxed text-ink-2">
        {unread.any ? "Some of this couldn't be read just now, so the lists below are incomplete." : boardSentence(board)}{" "}
        <Link href="#pause" className="font-medium text-accent hover:underline">
          {ws.agentsPaused ? "Agents are paused" : "Pause everything"}
        </Link>
      </p>

      {tour ? <Notice>The demo workspace has no agent builds to show: these are its sample tasks and sample scheduled work.</Notice> : null}
      {unread.builds ? <Notice tone="warning">The agent&apos;s builds couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}
      {unread.workflows ? <Notice tone="warning">Workflows couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}
      {unread.tasks ? <Notice tone="warning">Your scheduled tasks and agents couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}

      <BoardList id="work-needs-you" icon={UserFocusIcon} title="Needs you" items={board.needsYou} empty="Nothing is waiting for you." note={others} />
      <BoardList id="work-in-progress" icon={PlayCircleIcon} title="In progress" items={board.working} empty="Nothing is running right now." />
      <BoardList id="work-scheduled" icon={CalendarCheckIcon} title="Scheduled" items={board.scheduled} empty={unread.tasks ? "Your scheduled work couldn't be read just now." : "Nothing is scheduled. Tell Farbaek what to do and when on the Scheduled page, or ask for it in Chat."} />
      <BoardList
        id="work-finished"
        icon={CheckCircleIcon}
        title="Just finished"
        items={board.finished}
        empty="Nothing has finished yet."
        note={unread.runs ? "The runs of your scheduled work couldn't be read just now, so they are missing here." : board.finished.length > 0 ? "The latest few. Build, History and Scheduled have the rest." : null}
      />

      <Card id="pause" className="scroll-mt-24">
        <CardTitle icon={PauseCircleIcon}>Pause everything</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          One pause for all of it: no new build, workflow step or scheduled run starts until an owner or admin resumes agents. A build under way is stopped at once, and a workflow with a step under way stops and has to be started again. A scheduled run already under way finishes.
        </p>
        <div className="mt-4">
          <PauseControl paused={ws.agentsPaused} pauseReason={pauseReason} resumeReason={resumeReason} />
        </div>
      </Card>

      <p className="text-sm leading-relaxed text-ink-3">
        Each kind of work has its own page:{" "}
        <Link href="/app/build" className="font-medium text-accent hover:underline">
          Build
        </Link>
        ,{" "}
        <Link href="/app/approvals" className="font-medium text-accent hover:underline">
          Approvals
        </Link>
        ,{" "}
        <Link href="/app/workflows" className="font-medium text-accent hover:underline">
          Workflows
        </Link>{" "}
        and{" "}
        <Link href="/app/scheduled" className="font-medium text-accent hover:underline">
          Scheduled
        </Link>
        .
      </p>
      <LiveRefresh active={live && liveNow} />
    </div>
  );
}
