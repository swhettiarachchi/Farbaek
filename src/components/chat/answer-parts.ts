"use client";

/**
 * What an answer's own parts need from the answer around them (stage 206, ADR 0223): its numbered web sources, so a citation
 * in the text can be drawn as a link to the page it names; and a way to send one of its choices as the next message. Passed by
 * context, so each block of the answer still redraws only when its own text changes.
 */
import { createContext, useContext } from "react";
import type { WebSource } from "@/core/web/sources";

export interface AnswerParts {
  /** The answer's sources by number, when the web was checked for it; null when it wasn't. */
  sources: ReadonlyMap<number, WebSource> | null;
  /** Sends a choice as the person's next message. Absent when this answer can't be acted on (an older answer, a shared chat). */
  onChoose?: (text: string) => void;
  /** The answer was asked for as a roundup (stage 278): its headings that end with a source's number are drawn as stories. */
  stories?: boolean;
  /** Stories may show their pages' pictures (stage 278): only for the signed-in person, whose route gives them. Off in a shared chat. */
  pictures?: boolean;
}

export const AnswerPartsContext = createContext<AnswerParts>({ sources: null });

/**
 * The sources a story names under itself (stage 280). Inside that story's sentences a citation of only those sources draws
 * nothing: the story says where it is from once, on its last line, not after every sentence too.
 */
export const StorySourcesContext = createContext<readonly number[] | null>(null);

export const useAnswerParts = (): AnswerParts => useContext(AnswerPartsContext);
