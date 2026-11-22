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
}

export const AnswerPartsContext = createContext<AnswerParts>({ sources: null });

export const useAnswerParts = (): AnswerParts => useContext(AnswerPartsContext);
