import { GlobeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { CONTACT } from "@/config/contact";

export const metadata: Metadata = {
  title: "FarbaekBot",
  description: "FarbaekBot reads public web pages to answer a person's question in Farbaek Chat, and follows robots.txt.",
};

/**
 * Who FarbaekBot is (stage 205, ADR 0222): the page its user agent links to, for site owners who see it in their logs.
 */
export default function BotPage() {
  return (
    <div className="mx-auto grid max-w-2xl gap-5 px-4 py-16">
      <GlobeIcon size={32} className="text-ink-3" aria-hidden />
      <h1 className={FOCUSED_TITLE}>FarbaekBot</h1>
      <p className="text-base leading-relaxed text-ink-2">
        FarbaekBot opens a few public web pages when someone asks Farbaek AI a question in Farbaek Chat, so the answer can be based on what&apos;s published now and link to its sources. It reads only
        pages a search found for that question, at most two at a time from one site, and doesn&apos;t crawl, index or train AI models on what it reads. Page text is used for that one answer and not stored.
      </p>
      <h2 className="text-lg font-medium text-ink">How it identifies itself</h2>
      <p className="text-base leading-relaxed text-ink-2">
        Its user agent is <code className="font-mono text-sm">FarbaekBot/1.0 (+https://farbaek.com/bot)</code>. It requests pages from Farbaek&apos;s own server, not from people&apos;s devices.
      </p>
      <h2 className="text-lg font-medium text-ink">How to limit it</h2>
      <p className="text-base leading-relaxed text-ink-2">
        FarbaekBot follows robots.txt. To keep it out of your whole site, add a group for it: <code className="font-mono text-sm">User-agent: FarbaekBot</code> and <code className="font-mono text-sm">Disallow: /</code>.
        If a page asks not to be used with <code className="font-mono text-sm">noai</code>, <code className="font-mono text-sm">nosnippet</code> or <code className="font-mono text-sm">none</code> (in a robots meta tag or an
        X-Robots-Tag header), or reserves text and data mining with <code className="font-mono text-sm">tdm-reservation</code>, only its title is used.
      </p>
      <p className="text-base leading-relaxed text-ink-2">
        Questions about FarbaekBot: <a href={`mailto:${CONTACT.hello}`} className="font-medium text-accent underline-offset-4 hover:underline">{CONTACT.hello}</a>.
      </p>
    </div>
  );
}
