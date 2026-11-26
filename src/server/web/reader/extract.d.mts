export interface ExtractedPage {
  title: string;
  site: string;
  text: string;
  published: string | null;
  updated: string | null;
  lang: string | null;
  optOut: boolean;
  /** The picture the page names for previews of itself, as an https address; null when it names none or asks for none. */
  image?: string | null;
  /** The page asks for no picture preview of itself ("max-image-preview:none", "noimageindex"), or not to be used at all. */
  noPicture?: boolean;
}

export function cleanDate(value: unknown, now?: number): string | null;
export function pageDates(document: unknown, hinted?: string | null): { published: string | null; updated: string | null };
export function optsOut(document: unknown, headers?: { robotsTag?: string; tdm?: string }): boolean;
export function pagePicture(document: unknown, url: string, headers?: { robotsTag?: string }): string | null;
export function refusesPicture(document: unknown, headers?: { robotsTag?: string }): boolean;
export function extractPage(html: string, url: string, options?: { robotsTag?: string; tdm?: string; hintedDate?: string | null; plain?: boolean }): ExtractedPage;
