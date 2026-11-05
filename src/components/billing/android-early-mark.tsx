import { earlyMarkScript } from "@/core/billing/store-client";

/**
 * Marks the page as Farbaek for Android before it paints, so the app never flashes a price (ADR 0171). The script
 * is a fixed string of our own. The signed-in app passes its nonce; the public pages' policy doesn't limit scripts.
 */
export function AndroidEarlyMark({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: earlyMarkScript() }} />;
}
