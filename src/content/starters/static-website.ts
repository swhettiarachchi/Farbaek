/**
 * Starter: a static website. Plain HTML, CSS and JavaScript, no build step
 * and no dependencies, so it previews instantly. Text in brackets is meant
 * to be replaced.
 */
import type { StarterFile } from "./types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>[Your site name]</title>
    <meta name="description" content="[One sentence about what you do.]" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="#top">[Your site name]</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav id="site-nav" class="site-nav" aria-label="Main">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main id="top">
      <section class="hero">
        <h1>[A clear line about what you offer]</h1>
        <p class="lead">[Two short sentences for the people you want to reach: what you do, and why it matters to them.]</p>
        <a class="button" href="#contact">Get in touch</a>
      </section>

      <section id="work" class="section">
        <h2>Work</h2>
        <div class="grid">
          <article class="card">
            <h3>[Project or service]</h3>
            <p>[What it is and the result it delivered.]</p>
          </article>
          <article class="card">
            <h3>[Project or service]</h3>
            <p>[What it is and the result it delivered.]</p>
          </article>
        </div>
      </section>

      <section id="about" class="section about">
        <h2>About</h2>
        <p>[Who you are, where you work and how you like to work with people.]</p>
      </section>

      <section id="contact" class="section">
        <h2>Contact</h2>
        <p>Write to <a href="mailto:hello@example.com">hello@example.com</a>.</p>
      </section>
    </main>

    <footer class="site-footer">
      <p>&copy; <span id="year"></span> [Your site name]</p>
    </footer>

    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* One accent, light and dark modes, comfortable reading width. */
:root {
  color-scheme: light dark;
  --bg: #fbfbfc;
  --surface: #ffffff;
  --text: #15171c;
  --muted: #4d5360;
  --line: #e3e6eb;
  --accent: #1f5bd6;
  --on-accent: #ffffff;
  --radius: 16px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --surface: #171a20;
    --text: #eef0f3;
    --muted: #a6adb9;
    --line: #2a2f38;
    --accent: #7ea4ff;
    --on-accent: #0f1115;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 17px;
  line-height: 1.6;
}

a {
  color: var(--accent);
}

.site-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px clamp(16px, 5vw, 48px);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}

.brand {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.site-nav {
  display: flex;
  gap: 24px;
}

.site-nav a {
  color: var(--muted);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--text);
}

.menu-toggle {
  display: none;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

main {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 clamp(16px, 5vw, 48px);
}

.hero {
  padding: clamp(56px, 10vw, 112px) 0 48px;
}

.hero h1 {
  max-width: 18ch;
  margin: 0;
  font-size: clamp(2.2rem, 6vw, 3.6rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.lead {
  max-width: 55ch;
  margin: 20px 0 32px;
  color: var(--muted);
  font-size: 1.15rem;
}

.button {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  text-decoration: none;
}

.section {
  padding: 48px 0;
  border-top: 1px solid var(--line);
}

.section h2 {
  margin: 0 0 20px;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 16px;
}

.card {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.card h3 {
  margin: 0 0 8px;
}

.card p,
.about p {
  margin: 0;
  color: var(--muted);
}

.site-footer {
  padding: 32px clamp(16px, 5vw, 48px);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .menu-toggle {
    display: inline-flex;
    align-items: center;
  }

  .site-nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: 0;
    padding: 8px clamp(16px, 5vw, 48px) 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }

  .site-nav.is-open {
    display: flex;
  }

  .site-nav a {
    padding: 12px 0;
  }
}

@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}
`;

const SCRIPT = `// The year in the footer, and the menu on small screens.
document.getElementById("year").textContent = String(new Date().getFullYear());

const toggle = document.querySelector(".menu-toggle");
const nav = document.getElementById("site-nav");
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});
nav.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
});
`;

const README = `# [Your site name]

A static website: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Edit

Replace the text in [square brackets] in \`index.html\`. Colours and spacing are at the top of \`styles.css\`.

## Preview

In Farbaek, open the project and choose **Preview**. It opens right away, with no sandbox.

On your own computer, open \`index.html\` in a browser.
`;

export const STATIC_WEBSITE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];
