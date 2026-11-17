// A local stand-in for SearXNG (stage 205, ADR 0222), for testing live web search on a computer without Docker. It answers
// SearXNG's JSON API with real public pages for any query: Wikipedia's own search (which redirects to the best article) and
// a few well-known sites, so the real page reader has real pages to read. Not for production.
//
//   node scripts/dev/fake-searxng.mjs            # listens on 127.0.0.1:8091
//   FAKE_SEARCH_FAIL=1 node scripts/dev/fake-searxng.mjs   # every engine "blocked", to see the honest failure
import http from "node:http";

const port = Number(process.env.FAKE_SEARCH_PORT ?? 8091);
const fail = process.env.FAKE_SEARCH_FAIL === "1";

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname !== "/search" || url.searchParams.get("format") !== "json") {
      res.writeHead(403);
      return res.end();
    }
    const q = url.searchParams.get("q") ?? "";
    const news = url.searchParams.get("categories") === "news";
    const body = fail
      ? { query: q, results: [], unresponsive_engines: [["bing", "CAPTCHA"], ["duckduckgo", "timeout"]] }
      : {
          query: q,
          results: news
            ? [{ url: "https://www.bbc.com/news", title: "BBC News", content: "Breaking news and the latest stories.", engine: "bing news", publishedDate: new Date().toISOString() }]
            : [
                { url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}&go=Go`, title: `${q} - Wikipedia`, content: `Wikipedia's article for ${q}.`, engine: "wikipedia" },
                { url: "https://www.python.org/downloads/", title: "Download Python", content: "The latest Python releases.", engine: "duckduckgo" },
                { url: "https://nodejs.org/en/blog", title: "Node.js Blog", content: "News from the Node.js project.", engine: "brave" },
              ],
          unresponsive_engines: [],
        };
    const json = JSON.stringify(body);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(json);
  })
  .listen(port, "127.0.0.1", () => console.log(`fake SearXNG on http://127.0.0.1:${port}${fail ? " (every engine blocked)" : ""}`));
