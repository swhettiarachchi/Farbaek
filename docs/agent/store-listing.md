# Farbaek Agent in the Microsoft Store: the listing

What to paste into Partner Center for Farbaek Agent's Store listing (ADR 0098). Every sentence here is true of the app today; keep it that way when the app changes. No claims of "first", "guaranteed", "complete protection", certifications or compliance.

## Product

- **Name:** Farbaek Agent
- **Category:** Developer tools
- **Website:** https://www.farbaek.com
- **Support contact:** support@farbaek.com
- **Privacy policy:** https://www.farbaek.com/privacy
- **Pricing:** Free. The agent uses the AI usage of the Farbaek workspace it's paired with; there are no in-app purchases.
- **Markets:** all.
- **System requirements:** Windows 10 or 11, 64-bit; an internet connection; a Farbaek account.

## Short description

The desktop helper for Farbaek: works on your approved tasks on this computer and sends the change back for you to review.

## Description

Farbaek Agent connects this computer to your Farbaek workspace. Pair it once with a code from the Agents page, and it works on the tasks you've approved, following each task's contract.

It keeps a copy of the project for each task, prepares the change, and sends it to Farbaek as a proposal you review, apply and verify there. Nothing reaches your project until you choose to apply it.

You choose how much it can do:
- Review Only: reads the files and prepares a patch. No command runs and nothing on disk changes.
- Controlled Development: edits its own copy of the project, with a checkpoint before each change. Every command waits for your approval.

When you hand a task to this computer from Farbaek, it lists the exact check commands first, runs them only when you choose to, and sends the results back to the task.

It also sends folders between your paired computers with Nearby: on the same network, or over the internet, encrypted end to end, with every piece checked when it arrives.

The agent's token is kept in Windows' own protected storage. Each AI step goes through Farbaek to Claude, or, if you set one up, to a model running on this computer (Ollama, LM Studio or llama.cpp), so the files never leave it for the model call. For steps through Farbaek, Farbaek doesn't keep the conversation, and records only the model and token counts against your workspace's AI usage.

## Features (up to 20, one line each)

- Works on tasks you've approved, from their contract
- Sends its change back as a proposal you review in Farbaek
- Review Only and Controlled Development modes
- Asks before running anything beyond reading
- A checkpoint before every change
- Nearby: send folders between your paired computers
- Encrypted end to end, every piece checked on arrival
- Pairs with your workspace using a one-time code
- Runs a task's checks here when you hand it over from Farbaek
- Can use a model running on this computer

## Search terms (up to 7)

Farbaek, coding agent, AI developer tools, code review, software tasks, file transfer, desktop agent

## Age rating questionnaire

The IARC answers as submitted on 2026-10-31 (rating 3+ in every region, with "Users Interact"):

- **App type:** All other app types (not a game, not social or communication).
- **Rating-relevant content in the package:** No.
- **Users exchange content:** Yes. Nearby sends folders to a device someone has paired, which can be another person's (ADR 0038: both people confirm the code).
  - Shared content is the main content: No. Public sharing of nudity or graphic violence: No (nothing is public; transfers go only to paired devices).
  - Block users or content: Yes (forget a paired device; nothing arrives unless the person accepts it). Report: No. Chat moderation: No (there's no chat).
  - Limited to invited people: Yes (only paired devices).
- **Online content:** Yes (AI-written changes and notes). Violence, sexual material, offensive language, drugs: No.
- **Age-restricted products:** No.
- **Location shared, digital purchases, cash rewards or NFTs, browser or search engine, news or education:** No.
- **Ratings board or physical media:** No.

## Screenshots

At least one, 1366×768 or larger, of the app's own windows with sample data only (no real customer names or files):
1. The task list after pairing.
2. A run with its steps and the approval request.
3. Nearby, with a paired computer.

Take them from a scratch data folder, as in docs/agent/README.md, "Checking it".

## Submission notes for certification

- The agent is an Electron app packaged as MSIX with `runFullTrust`. It runs developer commands (such as git, pnpm and node) inside a copy of the person's project, only after the person approves anything beyond reading.
- `privateNetworkClientServer` is for Nearby, which finds and connects to the person's other computers on the local network.
- To try it, a Farbaek account and a pairing code from https://www.farbaek.com/app/agents are needed. The certification team can sign up at https://www.farbaek.com/sign-in.
