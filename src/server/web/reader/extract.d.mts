export interface ExtractedPage {
  title: string;
  site: string;
  text: string;
  published: string | null;
  updated: string | null;
  lang: string | null;
  optOut: boolean;
}

export function cleanDate(value: unknown, now?: number): string | null;
export function pageDates(document: unknown, hinted?: string | null): { published: string | null; updated: string | null };
export function optsOut(document: unknown, headers?: { robotsTag?: string; tdm?: string }): boolean;
export function extractPage(html: string, url: string, options?: { robotsTag?: string; tdm?: string; hintedDate?: string | null; plain?: boolean }): ExtractedPage;
