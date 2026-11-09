/**
 * The four page titles (ADR 0184). Every h1 is one of them, so a page's first line is the same size as every
 * other page of its kind. Weight 500 and tight tracking, as the White Signal headlines are (ADR 0008).
 */

/** An app page: PageHeader, a task, a plan, a file, a session, a support request. */
export const PAGE_TITLE = "text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]";

/** The app's one big question, "What do you want to build?". */
export const DISPLAY_TITLE = "text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl";

/** A public page that makes a statement: security, verify, the ProofPack format, the policies, account deleted. */
export const PUBLIC_TITLE = "text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[3.5rem]";

/** A public page that does one job: sign in, an invitation, offline. */
export const FOCUSED_TITLE = "text-balance text-[2rem] font-medium leading-[1.08] tracking-[-0.035em]";
