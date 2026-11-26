/**
 * Newsrooms' own feeds, for a roundup of news (stage 280, ADR 0288). Framework-free.
 *
 * A search for "tech news" finds section front pages: Reuters' technology page, TechCrunch's home page. They rank well and say
 * nothing a story can be written from, and many refuse to be read by a program at all. The first live roundup (2026-11-26) was
 * given ten of them and one readable article.
 *
 * A newsroom publishes a feed for exactly this: its newest stories, each with its address, the time it was published, a few
 * lines of summary and often a picture, meant to be read by a program and shown with a link back. So for a roundup Farbaek
 * reads a few feeds that fit the subject, beside its searches, through the page reader (public addresses, robots.txt, limits).
 * The addresses below are fixed here: nothing a person, a model or a page writes is ever fetched as a feed.
 *
 * Each address was fetched and found to answer with items on 2026-11-26. One that stops answering costs nothing: its stories
 * are simply missing, and the searches and the other feeds still answer.
 */

export const FEED_TOPICS = ["tech", "ai", "security", "mobile", "startups", "science", "business", "world", "srilanka", "cricket", "sport", "gaming"] as const;
export type FeedTopic = (typeof FEED_TOPICS)[number];

export interface Feed {
  url: string;
  topics: readonly FeedTopic[];
}

const feed = (url: string, ...topics: FeedTopic[]): Feed => ({ url, topics });

/** In the order they are taken for a topic: the first ones are read first. */
export const FEEDS: readonly Feed[] = [
  // Technology.
  feed("https://feeds.arstechnica.com/arstechnica/index", "tech", "science"),
  feed("https://www.theverge.com/rss/index.xml", "tech", "mobile"),
  feed("https://techcrunch.com/feed/", "tech", "startups"),
  feed("https://feeds.bbci.co.uk/news/technology/rss.xml", "tech"),
  feed("https://www.wired.com/feed/rss", "tech"),
  feed("https://www.engadget.com/rss.xml", "tech", "mobile"),
  feed("https://www.theguardian.com/technology/rss", "tech"),
  feed("https://www.theregister.com/headlines.atom", "tech", "security"),
  feed("https://www.zdnet.com/news/rss.xml", "tech"),
  feed("https://www.technologyreview.com/feed/", "ai", "tech"),
  // Artificial intelligence.
  feed("https://techcrunch.com/category/artificial-intelligence/feed/", "ai"),
  feed("https://blog.google/technology/ai/rss/", "ai"),
  // Security.
  feed("https://www.bleepingcomputer.com/feed/", "security"),
  feed("https://feeds.feedburner.com/TheHackersNews", "security"),
  feed("https://www.securityweek.com/feed/", "security"),
  feed("https://krebsonsecurity.com/feed/", "security"),
  // Phones and the companies that make them.
  feed("https://www.androidauthority.com/feed/", "mobile"),
  feed("https://9to5mac.com/feed/", "mobile"),
  feed("https://9to5google.com/feed/", "mobile"),
  feed("https://www.macrumors.com/macrumors.xml", "mobile"),
  // Startups and business.
  feed("https://techcrunch.com/category/startups/feed/", "startups"),
  feed("https://feeds.bbci.co.uk/news/business/rss.xml", "business"),
  feed("https://www.theguardian.com/business/rss", "business"),
  feed("https://www.cnbc.com/id/100003114/device/rss/rss.html", "business"),
  // Science.
  feed("https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "science"),
  feed("https://www.newscientist.com/feed/home/", "science"),
  feed("https://www.theguardian.com/science/rss", "science"),
  feed("https://www.nature.com/nature.rss", "science"),
  // The world.
  feed("https://feeds.bbci.co.uk/news/world/rss.xml", "world"),
  feed("https://www.theguardian.com/world/rss", "world"),
  feed("https://www.aljazeera.com/xml/rss/all.xml", "world"),
  // Sri Lanka.
  feed("https://www.adaderana.lk/rss.php", "srilanka"),
  feed("https://economynext.com/feed/", "srilanka", "business"),
  feed("https://www.newswire.lk/feed/", "srilanka"),
  // Sport.
  feed("https://www.espncricinfo.com/rss/content/story/feeds/0.xml", "cricket"),
  feed("https://feeds.bbci.co.uk/sport/cricket/rss.xml", "cricket"),
  feed("https://feeds.bbci.co.uk/sport/rss.xml", "sport"),
  feed("https://www.theguardian.com/sport/rss", "sport"),
  // Games.
  feed("https://www.pcgamer.com/rss/", "gaming"),
  feed("https://www.eurogamer.net/feed", "gaming"),
];

const word = (source: string) => new RegExp(`(?<![a-z])(?:${source})(?![a-z])`, "i");

/** The words that name a topic, in a plan's English subject and searches. A plan is written in English whatever the question's language. */
const TOPIC_WORDS: Record<FeedTopic, RegExp> = {
  ai: word("ai|a\\.i\\.|artificial intelligence|machine learning|llms?|language models?|ai agents?|agents|chatbots?|generative|openai|chatgpt|anthropic|claude|gemini|deepmind|copilot|grok"),
  // Never "security" alone: "social security" and "food security" are not about break-ins.
  security: word("cyber ?security|cybersecurity|infosec|hack(?:s|ed|ers?|ing)?|data breach(?:es)?|breach(?:es)?|malware|ransomware|vulnerabilit(?:y|ies)|phishing|zero[- ]day|exploits?|security (?:flaws?|patch(?:es)?|updates?|bugs?|research(?:ers?)?)"),
  mobile: word("smartphones?|phones?|android|ios|iphone|ipad|apple|samsung|pixel|mobile|wearables?|gadgets?"),
  startups: word("startups?|start-ups?|funding|venture|vc|founders?|unicorns?"),
  science: word("science|scientific|research|space|nasa|physics|biology|climate|astronomy|medicine"),
  // Not "companies" or "trade": "tech company news" is about technology.
  business: word("business|econom(?:y|ic|ics)|markets?|stocks?|finance|financial|earnings|inflation"),
  // Not "headlines", "breaking" or "global": every request for news may say them. The world is also what is left when nothing
  // else is named (feedTopics).
  world: word("world news|world affairs|world|politics|geopolitic(?:s|al)"),
  srilanka: word("sri lanka|sri lankan|lanka|colombo|kandy|galle|jaffna|lkr|sinhala|tamil"),
  cricket: word("cricket|ipl|t20|odi|test match|wickets?"),
  sport: word("sports?|football|soccer|tennis|rugby|olympics?|f1|formula 1|formula one|athletics"),
  // Not "games" alone: the Olympic Games are sport.
  gaming: word("gaming|video ?games?|pc games?|console games?|playstation|xbox|nintendo|steam|esports"),
  tech: word("tech|technology|technological|software|hardware|computing|computers?|internet|digital|developers?|programming|coding|chips?|semiconductors?|gadgets?|apps?"),
};

/** The topics a plan is about, most specific first. A plan about nothing in the list has none, and no feed is read for it. */
export function feedTopics(plan: { queries: readonly string[]; topic: string }): FeedTopic[] {
  const text = `${plan.topic} ${plan.queries.join(" ")}`.toLowerCase();
  const found = (Object.keys(TOPIC_WORDS) as FeedTopic[]).filter((t) => TOPIC_WORDS[t].test(text));
  // Cricket is a sport, and a question about it wants cricket's own feeds first.
  const named = found.includes("cricket") ? found.filter((t) => t !== "sport") : found;
  // The world's news is for a roundup of the world: beside a subject of its own ("tech news of the world"), the subject is it.
  return named.length > 1 ? named.filter((t) => t !== "world") : named;
}

/** The most feeds read for one roundup: enough for several newsrooms, few enough to stay inside the time research has. */
export const MAX_FEEDS = 6;

/**
 * The feeds to read for a plan: taken turn by turn from each topic it is about, so a roundup of technology that also names AI and
 * security reads some of each, never two feeds of one site, at most `max` in all. None when the plan is about nothing listed.
 */
export function feedsFor(plan: { queries: readonly string[]; topic: string }, max = MAX_FEEDS): Feed[] {
  const topics = feedTopics(plan);
  if (topics.length === 0) return [];
  const lanes = topics.map((t) => FEEDS.filter((f) => f.topics[0] === t || f.topics.includes(t)).sort((a, b) => Number(b.topics[0] === t) - Number(a.topics[0] === t)));
  const out: Feed[] = [];
  const sites = new Set<string>();
  for (let round = 0; out.length < max && lanes.some((lane) => lane.length > round); round++) {
    for (const lane of lanes) {
      const next = lane[round];
      if (!next || out.length >= max) continue;
      // One feed from a newsroom: "feeds.bbci.co.uk" and "www.theguardian.com" are known by what follows their first label.
      const labels = new URL(next.url).hostname.split(".");
      const site = labels.length > 2 ? labels.slice(1).join(".") : labels.join(".");
      if (sites.has(site) || out.includes(next)) continue;
      sites.add(site);
      out.push(next);
    }
  }
  return out;
}
