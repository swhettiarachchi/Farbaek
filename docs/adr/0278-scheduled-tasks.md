# ADR 0278: Scheduled tasks, work Farbaek does by itself at a time a person set

- **Status:** accepted (stage 271, the Farbaek program, 2026-11-25)
- **Builds on:** ADR 0213 (Chat and its turn), ADR 0020 (AI usage is metered), ADR 0035 (the scheduler's secret stays in the app container), ADR 0063 (jobs run by the server's own timers), ADR 0070 (the download of a person's data), ADR 0222 (web research when a question needs it), ADR 0224 (memory comes only from a person's own words).
- **Changes:** migration v106 (two tables, eight service-only functions, a trigger); a new page, `/app/scheduled`, in the navigation; an internal route and an every-minute timer; a notice by email and push; the download of a person's data. No new dependency, no new provider.

## Context

The owner's master brief puts automation first: tell Farbaek what to do and when, and it does it without the page being open. The audit of 2026-11-22 named this the largest gap: every piece of AI work in Farbaek began with a person pressing something and ended when their page closed. The reference study found a Scheduled page at the top level of both ChatGPT and Claude, a short dialog (what, when, how often), and a handful of starting points.

Farbaek already had the parts a run needs: the Chat turn (models, routing, web research, memory, metering), a scheduler secret, and timers on the server. It lacked a durable record of what is due, a way to claim it once, and a turn that runs without a browser.

## Decision

**A scheduled task is an instruction and a schedule. Each run is one Chat turn, made on the server as the person who scheduled it, and its answer is a conversation in Chat.**

### The schedule

- **Data, worked out by tested code** (`src/core/automation/schedule.ts`): once, every hour, every day, Monday to Friday, chosen days each week, or a day each month; ending never, after a date, or after a number of runs; in a time zone named as browsers name it, never a bare offset. A time that doesn't exist on a day (clocks going forward) runs just after the gap; a time that happens twice runs the first time. The 31st runs on a shorter month's last day. A date must be a day the calendar has. No model works out a time.
- **A one-time task is over when its time has passed,** not by a count of runs: a run started by hand beforehand leaves it standing, and a task that has run before can be given a new time.
- **The person's own words prefill it** (`words.ts`): "every weekday at 8:30", "tomorrow at 5pm", "Monday to Thursday at 9", and the same in Sinhala and in Sinhala typed with English letters. It is a reading shown in a sentence for the person to change, never saved without them pressing Schedule.
- **It reads a schedule only when the words say one thing.** An instruction is mostly about its subject, so a day, a date, a part of the day or a frequency counts only where it is said as a time to run ("Saturday's weather", "the weekly report", "the morning news" and "what happened on 5 March" are not). Words that name two schedules, or one the form can't hold ("every other week", "except Sunday", "until December", "at 9am and 5pm"), read as nothing, never as part of what was said.
- **When a task runs next is always the server's answer.** The browser sends the schedule; the server computes the time, and the database function stores it.

### Running

- **Durable, and run once:** due tasks are claimed in the database under a 15-minute lease (`for update skip locked`), and each due time has one run row (`unique (task_id, due_at)`), so two timers or two servers never run one due time twice. A server that stops mid-run leaves a lease that runs out, and the run is claimed again as the next try.
- **A run that doesn't finish:**
  - trouble that may pass (a provider down, an answer cut off, the ten-minute limit, an answer still being written in the task's conversation) is tried again 2 and then 10 minutes later;
  - trouble that won't (no AI usage left, the person can no longer use AI here) is recorded as skipped and never retried;
  - Farbaek's own doing (its limit for the day, or the server being down past a due time by more than six hours) is skipped, said, and not held against the task;
  - five due times in a row that didn't finish pause the task, with the reason on it.
- **An outcome that can't be recorded is asked again,** three times over a few seconds: an answer already written is not run a second time for one dropped call.
- **A change made while a run is under way is kept.** The run keeps its lease, so nothing is started beside it; when it ends it finds the task moved on, records itself and leaves the task as its owner left it. A try waiting to be made again is closed when the task is paused, changed or removed, and a run whose server stopped is closed too, so no run reads as running for ever.
- **Run now is apart from the schedule:** the schedule's own next time is kept and put back when the run ends, and the run isn't counted as one of the schedule's. Pressed while a try is waiting, it makes that try now. Pressed while a run is under way, it is refused and says so.
- **Each task keeps one conversation.** The turn starts it with the first question, as the first message of a new chat does: a conversation is never made ahead of its question. Later runs carry on from its last answer, so they can see the earlier ones. A conversation that is put away, gone or as long as one can be is replaced by a new one, as a person would start a new chat.
- **The tick:** `POST /api/internal/jobs/scheduled`, with the scheduler's secret, called every minute by `farbaek-scheduled.timer`. Until that timer is switched on, the 15-minute sandbox sweep starts due tasks too, after its own work, so a task runs up to 15 minutes late, and the page says "within 15 minutes". Three runs at once on a server, each given up on at 13 minutes, so people's own chats stay quick and the count never sticks.

### Whose it is, and what it costs

- **As the person, and only them:** the headless turn reads the conversation, memory and plan with filters on the workspace and the person. When it runs it checks, from the database, what the Chat page checks from a session: they are still in the workspace with a role that may use its AI, and Farbaek hasn't paused the workspace. A task and its runs are readable by their owner alone (row-level security); every write is a service-only function that checks the person again.
- **Someone who leaves a workspace takes their tasks there with them** (a trigger on the membership), as their conversations and memory already go.
- **Metered as Chat is:** each run reserves and settles AI usage as a message does, and the platform's AI pause stops runs being claimed (so nothing fails or is paused for it).
- **Plan limits bound what can be left running:** one active task on the free plan up to a hundred on the largest, and hourly schedules from Plus (`SCHEDULED_LIMITS`). Checked in the action, and again in the database function under a lock on the person's membership, so two saves or resumes sent together can't both pass.
- **The plan is followed when a task runs, too:** a trial that ended or a smaller plan pauses what it no longer allows, with the reason, before anything is spent. The person's oldest tasks keep running.
- **Told when it has run,** if the person left that on: by email and push, through the notifier's existing ways and their own preferences. Runs skipped in a row are told once, not every time; a task Farbaek paused is always told.
- **In the download of their data:** the person's tasks, as they wrote them, in the workspaces they still belong to.

### The page

The person's tasks, each with its schedule in a sentence, its next time, its latest runs with a link to the answer, and Run now, Pause or Resume, Change and Remove; a form whose schedule follows their words; six starting points. Every control works or says why it is off. The demo workspace shows three tasks named as samples.

## Consequences

- Farbaek can do work while nobody is looking, for the first time, with the same models, limits and metering as Chat.
- A retry sends the instruction again; the conversation keeps the earlier attempt that stopped.
- A day or a date said without its time, in the middle of a sentence, is not read ("remind me on 1 December to renew"): the person sets it in the form. Reading less is the price of never reading the subject as the schedule.
- **Known, and not fixed here:**
  - a turn cut off by a restart left its usage reservation unsettled: Chat's own behaviour, found by this stage's review. Fixed for every kind of call in stage 272 (ADR 0279);
  - a model's refusal to answer is tried again like any failed answer, twice more;
  - a schedule edited while its run is under way can make one run more than "ends after N runs" allows.
- **Not yet:**
  - triggers other than time (a webhook in, a file arriving, an email), and tasks that chain;
  - a run that builds, makes an image or a video, or works on a person's computer: a run is a Chat turn;
  - persistent agents with a goal, a budget and memory of their own;
  - one command center across builds, workflows and scheduled runs;
  - creating a task from inside a Chat conversation ("do this every morning");
  - changing a task's time zone, and a cost shown per task. Usage is on the Billing page, with every other use.

## Verified

See `docs/stages/stage-271.md` for the counts, the two reviews and what they found.
