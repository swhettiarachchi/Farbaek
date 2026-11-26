import type { FeedItem } from "./read.mjs";

export const FEED_ITEMS: number;
export function decodeEntities(text: string): string;
export function parseFeed(xml: unknown, feedUrl: string, now?: number): FeedItem[];
