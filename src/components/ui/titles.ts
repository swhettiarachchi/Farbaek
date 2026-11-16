/**
 * The page titles (ADR 0184), sized phone first (ADR 0211): each starts at the size a phone needs and steps up on larger screens,
 * so a title leaves room for what the page is for. Every h1 is one of them, so a page's first line is the same size as every
 * other page of its kind. Weight 500 and tight tracking, as the White Signal headlines are (ADR 0008).
 */

/** An app page: PageHeader, a task, a plan, a file, a session, a support request. 24px, 28px, 32px. */
export const PAGE_TITLE = "text-balance text-2xl font-medium leading-tight tracking-[-0.03em] sm:text-[1.75rem] lg:text-[2rem]";

/** The app's one big question, "What do you want to build?". 30px, 40px, 48px. */
export const DISPLAY_TITLE = "text-balance text-3xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-[2.5rem] lg:text-5xl";

/** A public page that makes a statement: security, verify, the ProofPack format, the policies, account deleted. 32px, 44px, 56px. */
export const PUBLIC_TITLE = "text-balance text-[2rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[2.75rem] lg:text-[3.5rem]";

/** A public page that does one job: sign in, an invitation, offline. 26px, 32px. */
export const FOCUSED_TITLE = "text-balance text-[1.625rem] font-medium leading-[1.1] tracking-[-0.035em] sm:text-[2rem]";

/** The home page's headline: 36px, 52px, 64px. Confident, never shouting (stage 201, measured against ChatGPT, Antigravity and Claude). */
export const HERO_TITLE = "text-balance text-4xl font-medium leading-[1.03] tracking-[-0.045em] sm:text-[3.25rem] lg:text-[4rem]";

/** A public page's section title, under its h1. 26px, 34px, 40px. */
export const SECTION_TITLE = "text-balance text-[1.625rem] font-medium leading-[1.1] tracking-[-0.032em] sm:text-[2.125rem] lg:text-[2.5rem]";

/** A part of a public document (the ProofPack format, security, verify): smaller than a section of a landing page. 22px, 28px. */
export const PART_TITLE = "text-balance text-[1.375rem] font-medium leading-tight tracking-[-0.03em] sm:text-[1.75rem]";

/** The sentence under a public title: the body size on a phone, a little larger from `sm`. */
export const LEAD = "text-body leading-relaxed sm:text-lg";
