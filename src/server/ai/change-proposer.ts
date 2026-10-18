/**
 * The boundary between Farbaek and a model provider for change proposals.
 * Use cases depend on this interface only; tests use a labelled fake.
 */
import type { ProposalOutput } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import type { DraftFailure, ProviderUsage } from "./contract-drafter";

/** What the model is told. All of it is user-supplied data. */
export interface ProposalBrief {
  contract: IntentContract;
  taskTitle: string;
  projectName: string;
  /** Every current path in the project, so new files land in the right place. */
  paths: string[];
  /** The files the person chose as context. Only these can be edited. */
  files: { path: string; content: string }[];
  notes: string;
}

export type ProposalOutcome = { ok: true; output: ProposalOutput; usage: ProviderUsage } | { ok: false; failure: DraftFailure; usage: ProviderUsage | null };

export interface ChangeProposer {
  readonly model: string;
  /** The most a proposal can write, thinking included: usage is reserved for it before the call. */
  readonly maxOutputTokens: number;
  propose(brief: ProposalBrief, signal?: AbortSignal): Promise<ProposalOutcome>;
}
