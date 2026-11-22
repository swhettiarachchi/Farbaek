/**
 * Cited sentences, the page each cites, and how the check should read them (stage 206, ADR 0223). Written for this test: the
 * pages are short made-up passages, labelled by hand. `read` is false when only a search snippet was available.
 */
import type { Support } from "../sources";

export interface CitationCase {
  claim: string;
  page: string;
  read: boolean;
  expect: Support;
  /** What the case is there to show. */
  why: string;
}

const MARKETS = "Asian shares slid on Friday. Japan's Nikkei 225 dropped 5.1% and South Korea's Kospi lost 5.2%, while Hong Kong's Hang Seng fell 1.9%. Investors are asking whether spending on AI will pay off.";
const GEMINI = "Google has released a Gemini app for Mac that can control the computer: it opens apps, clicks and types when the person allows it. The feature is rolling out from 18 November 2026.";
const COMPANY = "The firm employs 12500 people across 14 countries and reported revenue of $3.4 billion in 2025, according to its annual filing.";

export const CITATION_CASES: CitationCase[] = [
  { claim: "Japan's Nikkei 225 fell 5.1% on Friday.", page: MARKETS, read: true, expect: "matched", why: "names and figures on the page" },
  { claim: "South Korea's Kospi lost 5.2%.", page: MARKETS, read: true, expect: "matched", why: "a second figure from the same page" },
  { claim: "Japan's Nikkei 225 fell 7.3% on Friday.", page: MARKETS, read: true, expect: "partly", why: "the names are there, the number isn't: never matched" },
  { claim: "The Hang Seng fell 19% in Hong Kong.", page: MARKETS, read: true, expect: "partly", why: "1.9 on the page isn't 19" },
  { claim: "Germany's DAX rose 2.4% on Monday.", page: MARKETS, read: true, expect: "unmatched", why: "nothing in the sentence is on the page" },
  { claim: "Google Gemini දැන් Mac පරිගණකය පාලනය කරනවා.", page: GEMINI, read: true, expect: "matched", why: "a Sinhala sentence about an English page: the names carry over" },
  { claim: "මේ පහසුකම 2026 නොවැම්බර් 18 ඉඳන් ලැබෙනවා.", page: GEMINI, read: true, expect: "matched", why: "dates carry over too" },
  { claim: "Microsoft Copilot දැන් Linux පාලනය කරනවා.", page: GEMINI, read: true, expect: "unmatched", why: "a Sinhala sentence naming things the page doesn't" },
  { claim: "Gemini 2027 දී Windows වලටත් එනවා.", page: GEMINI, read: true, expect: "partly", why: "one name is there, the year and the other name aren't" },
  { claim: "මේක ගොඩක් වැදගත් වෙනසක්.", page: GEMINI, read: true, expect: "unchecked", why: "nothing to compare" },
  { claim: "That is a big change.", page: GEMINI, read: true, expect: "unchecked", why: "nothing to compare" },
  { claim: "The company has 12,500 employees.", page: COMPANY, read: true, expect: "matched", why: "a thousands separator doesn't matter" },
  { claim: "Revenue reached $3.4 billion in 2025.", page: COMPANY, read: true, expect: "matched", why: "a decimal and a year" },
  { claim: "Revenue reached $34 billion in 2025.", page: COMPANY, read: true, expect: "partly", why: "3.4 isn't 34" },
  { claim: "It operates in 41 countries.", page: COMPANY, read: true, expect: "unmatched", why: "the page says 14" },
  { claim: "The filing was published in 2023.", page: COMPANY, read: true, expect: "unmatched", why: "the wrong year" },
  { claim: "Kospi lost 5.2%.", page: "Asian markets slide as AI doubts grow", read: false, expect: "unchecked", why: "a snippet is too short to say something is missing" },
  { claim: "Asian markets slid as doubts about AI grew.", page: "Asian markets slide as AI doubts grow", read: false, expect: "matched", why: "a snippet can still match" },
  { claim: "Investors are questioning whether spending on artificial intelligence will deliver returns.", page: MARKETS, read: true, expect: "unchecked", why: "said in other words: absence of the same words says nothing" },
  { claim: "The Gemini app opens apps, clicks and types when the person allows it.", page: GEMINI, read: true, expect: "matched", why: "the same words, in number" },
];
