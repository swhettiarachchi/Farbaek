/**
 * Template: a small blog, a home page listing posts and a post page set for
 * comfortable reading. Sample content; previews instantly.
 */
import type { StarterFile } from "../types";

const HEAD = (title: string, description: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="masthead">
      <a class="title" href="index.html">Field Notes</a>
      <nav aria-label="Main"><a href="index.html">Posts</a><a href="index.html#about">About</a></nav>
    </header>
`;

const FOOT = `    <footer class="foot">Field Notes is a sample blog.</footer>
  </body>
</html>
`;

const INDEX = `${HEAD("Field Notes: small lessons from building things", "Short essays about building small things well. Sample blog.")}
    <main class="wrap">
      <section class="intro">
        <h1>Small lessons from building things.</h1>
        <p>Short essays, one a month. Sample posts below.</p>
      </section>

      <ol class="posts">
        <li>
          <a href="post.html">
            <time datetime="2026-09-02">2 Sept 2026</time>
            <h2>Ship the boring version first</h2>
            <p>The plain version teaches you more in a week than the clever one does in a month.</p>
          </a>
        </li>
        <li>
          <a href="post.html">
            <time datetime="2026-08-05">5 Aug 2026</time>
            <h2>Write the error message first</h2>
            <p>If you can't explain what went wrong, you don't understand the feature yet.</p>
          </a>
        </li>
        <li>
          <a href="post.html">
            <time datetime="2026-07-01">1 Jul 2026</time>
            <h2>One page, one job</h2>
            <p>Every screen should answer one question for one person.</p>
          </a>
        </li>
      </ol>

      <section id="about" class="about">
        <h2>About</h2>
        <p>Field Notes is written by a sample author who builds small tools for small teams.</p>
      </section>
    </main>
${FOOT}`;

const POST = `${HEAD("Ship the boring version first · Field Notes", "The plain version teaches you more in a week than the clever one does in a month.")}
    <main class="wrap">
      <article class="post">
        <a class="back" href="index.html">All posts</a>
        <time datetime="2026-09-02">2 Sept 2026</time>
        <h1>Ship the boring version first</h1>
        <p class="standfirst">The plain version teaches you more in a week than the clever one does in a month.</p>
        <p>Every project has a version that would embarrass you a little: fewer screens, plainer words, a form instead of a flow. It's also the version real people can use this week.</p>
        <h2>What the boring version tells you</h2>
        <p>Within days you learn which parts people actually use, where they hesitate and what they ask for. None of that shows up in a plan.</p>
        <blockquote>The clever version answers questions nobody has asked yet.</blockquote>
        <p>So ship the plain thing, watch closely and make the next version a little less boring, in the places people care about.</p>
        <p class="sample">This is a sample post. Ask the agent to replace it with yours.</p>
      </article>
    </main>
${FOOT}`;

const STYLES = `:root {
  --bg: #ffffff;
  --ink: #16191d;
  --muted: #5d6570;
  --line: #e7e9ec;
  --accent: #0a7d8c;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 18px/1.7 var(--font); }
a { color: inherit; }

.masthead { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; max-width: 760px; margin: 0 auto; padding: 28px 20px; border-bottom: 1px solid var(--line); }
.title { font-weight: 800; font-size: 22px; letter-spacing: -0.03em; text-decoration: none; }
.masthead nav { display: flex; gap: 18px; font-size: 16px; }
.masthead nav a { text-decoration: none; color: var(--muted); }

.wrap { max-width: 760px; margin: 0 auto; padding: 0 20px 80px; }
.intro { padding: 56px 0 24px; }
.intro h1 { margin: 0; font-size: clamp(34px, 6vw, 52px); line-height: 1.05; letter-spacing: -0.04em; }
.intro p { color: var(--muted); }

.posts { margin: 0; padding: 0; list-style: none; }
.posts a { display: block; padding: 28px 0; border-top: 1px solid var(--line); text-decoration: none; }
.posts a:hover h2 { color: var(--accent); }
time { color: var(--muted); font-size: 15px; font-variant-numeric: tabular-nums; }
.posts h2 { margin: 4px 0 6px; font-size: 26px; line-height: 1.2; letter-spacing: -0.02em; transition: color 150ms ease; }
.posts p { margin: 0; color: var(--muted); }

.about { margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--line); }
.about h2 { font-size: 20px; margin: 0 0 8px; }

.post { padding-top: 40px; }
.back { display: inline-block; margin-bottom: 24px; color: var(--accent); font-size: 16px; text-decoration: none; }
.back::before { content: "← "; }
.post h1 { margin: 6px 0 12px; font-size: clamp(36px, 6vw, 54px); line-height: 1.05; letter-spacing: -0.04em; }
.standfirst { font-size: 22px; line-height: 1.45; color: var(--muted); }
.post h2 { margin: 40px 0 8px; font-size: 26px; letter-spacing: -0.02em; }
blockquote { margin: 32px 0; padding-left: 20px; border-left: 3px solid var(--accent); font-size: 24px; line-height: 1.35; }
.sample { margin-top: 40px; color: var(--muted); font-size: 15px; }

.foot { max-width: 760px; margin: 0 auto; padding: 24px 20px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); }

@media (prefers-reduced-motion: reduce) {
  .posts h2 { transition: none; }
}
`;

const README = `# Field Notes blog (template)

A small blog: a home page that lists posts and a post page set for comfortable reading.

The name, posts and author are sample content. Ask the agent to make it yours, for example: "Make this my cooking blog and add a post page for each of three recipes".
`;

export const BLOG_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "post.html", content: POST },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];
