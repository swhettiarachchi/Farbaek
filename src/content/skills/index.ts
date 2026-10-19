/**
 * Farbaek's built-in skills (ADR 0030), written in the SKILL.md format
 * (name, description, instructions) so they read like any Claude Skill.
 * People choose them on the plan card; the ones that fit a prompt are
 * suggested. The Studio standard always applies; these go deeper.
 */
import { parseSkill, type Skill } from "@/core/agent/skills";

export interface BuiltInSkill extends Skill {
  /** Words in a prompt that suggest this skill. */
  keywords: RegExp;
  /** A short label for the plan card. */
  label: string;
}

const skill = (label: string, keywords: RegExp, markdown: string): BuiltInSkill => {
  const parsed = parseSkill(markdown, label.toLowerCase().replace(/\W+/g, "-"), "farbaek");
  if (!parsed) throw new Error(`Built-in skill "${label}" is empty`);
  return { ...parsed, label, keywords };
};

export const FARBAEK_SKILLS: readonly BuiltInSkill[] = [
  skill(
    "Motion and interaction",
    /\b(animat\w*|motion|interactive|smooth|scroll\w*|transition\w*|dynamic|futuristic|wow|impress\w*|premium|modern)\b/i,
    `---
name: motion-and-interaction
description: Purposeful, cinematic motion and tactile interaction that make a site feel alive and premium without slowing it down.
---
- Plan the motion like a film: one orchestrated entrance for the hero (headline, then supporting line, then action, 60 to 120 ms apart), then reveals that follow the reading order as sections scroll into view.
- Use IntersectionObserver or CSS scroll-driven animations (animation-timeline: view()) for reveals; never a scroll event listener. Animate only transform, opacity and clip-path.
- Give every control physical feedback: hover lifts or fills from the pointer's side, press scales to 0.98, focus rings are clear. Links get an underline that draws in.
- Signature moments, at most two a page: a headline that reveals by line or word, an image that unmasks with clip-path, a number that counts up when seen, a sticky section where content steps through while the visual stays put, or a gentle cursor-follow light on a dark hero.
- Durations 150 to 250 ms for feedback, 400 to 700 ms for entrances, eased with cubic-bezier(0.16, 1, 0.3, 1). Nothing loops forever unless it shows live state.
- Under prefers-reduced-motion: reduce, show everything at its final state immediately.`,
  ),
  skill(
    "3D and depth",
    /\b(3d|three\.?js|webgl|depth|immersive|futuristic|space|orbit\w*|hologra\w*|product view|spatial)\b/i,
    `---
name: 3d-and-depth
description: Real dimensional moments, from layered parallax and CSS 3D to a three.js scene, used where depth tells the story.
---
- Pick the lightest technique that delivers the moment: layered parallax (translate by scroll progress), CSS 3D (perspective plus rotateX or rotateY on cards that tilt toward the pointer), or a WebGL scene for one hero or product moment.
- For a three.js scene in a static site, import a pinned version as an ES module from https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js. Keep geometry simple and art-directed (a sculpted shape, a particle field, a product-like form with a matcap or physical material), light it deliberately, and make it react to the pointer or scroll subtly.
- Start the scene only when it's on screen and pause it when it isn't or the tab is hidden; cap the device pixel ratio at 2; dispose of it cleanly.
- Always render a still fallback first (a gradient or a poster frame in the same composition) and keep it for prefers-reduced-motion, missing WebGL and weak devices (fewer than 4 cores in navigator.hardwareConcurrency, navigator.deviceMemory under 4, or saveData). Four-core laptops and phones should get the scene.
- Depth must serve hierarchy: the 3D element sits behind or beside the message, never on top of text, and contrast stays readable over it.`,
  ),
  skill(
    "Brand identity",
    /\b(brand\w*|identity|logo|luxury|premium|boutique|studio|agency|fashion|beauty|restaurant|caf[eé]|hotel|rental|business|company|bakery|salon)\b/i,
    `---
name: brand-identity
description: Art direction that gives the product a recognisable identity: a named palette, a type voice, a signature motif and consistent details.
---
- Start from the product's world: its materials, places, tools and vocabulary. Pull the palette and motifs from there (a bakery's flour, crust and morning light; a fintech's ledger lines and precise numerals), not from generic tech colours.
- Define a small identity system in DESIGN.md: a wordmark (set in the display face, with one distinctive detail such as a ligature or a cut letter), 4 to 6 named colours with one accent, a type pairing with a clear scale, a motif (a shape, pattern, line or texture used in three to five places), and a voice for the copy.
- Avoid the default palettes: no purple-blue AI glow, and for warm consumer brands no beige, brass and espresso by reflex. Earn the palette from the brief.
- Apply the identity everywhere a person looks: favicon (an inline SVG mark), selection colour, focus ring colour, scrollbar accents where supported, 404 page, empty states, buttons and dividers.
- Keep it consistent: one accent, one radius system, one icon style, one illustration or photo treatment for the whole site.`,
  ),
  skill(
    "Shop and product pages",
    /\b(shop|store|e-?commerce|product|products|sell\w*|cart|checkout|catalog\w*|merch|order\w*)\b/i,
    `---
name: shop-and-product-pages
description: Product-led layouts that make things look desirable and make buying feel easy and trustworthy.
---
- Lead with the product: a large, art-directed product moment (a 3D or CSS-staged product, or a clearly marked photo placeholder), the price and one clear action above the fold.
- Product grid: varied card sizes for featured items, quick hover detail (a second view or key specs), and consistent price and badge treatment. Filters that work on the page's data.
- Product page: gallery, name, price, the two or three facts that decide a purchase, options as real controls (size, colour) that update the page, and an "Add to cart" that gives clear feedback.
- A cart that works in the browser (localStorage), with quantities, removal and a total. If there's no payment connected, the checkout button says so plainly ("Checkout isn't connected yet") instead of pretending.
- Trust details where they help: delivery, returns, care. Never invent reviews or ratings; sample ones are labelled as samples.`,
  ),
  skill(
    "Software product site",
    /\b(saas|software|app|platform|startup|tool|api|developer|dashboard|b2b|product launch)\b/i,
    `---
name: software-product-site
description: Marketing sites for software that show the real product, explain value fast and convert, without the usual SaaS template look.
---
- Show the product, not a fake screenshot: build a small working preview of its key moment from real components (a live-filtering list, an interactive chart, a step that animates through a real flow).
- Structure: a hero with one promise and one action; the problem in the reader's words; three to five capabilities each shown with a real visual or interaction (no three-equal-cards row); how it works as a sequence; pricing if known (as sample if invented); a closing action.
- One call-to-action label for each intent across the page (for example "Start free" everywhere, not "Get started" in one place and "Try it" in another).
- Copy is concrete: name the job the product does, the time it saves, the risk it removes. No elevate, seamless, unleash or next-gen.
- Technical audiences get precise details (code samples with syntax colouring, real numbers marked as sample if invented); business audiences get outcomes and proof.`,
  ),
  skill(
    "Portfolio and personal",
    /\b(portfolio|personal|resume|cv|photograph\w*|designer|artist|freelanc\w*|creative|showcase|my work)\b/i,
    `---
name: portfolio-and-personal
description: Personal sites and portfolios with a strong point of view, where the work is the hero and the person's voice comes through.
---
- The work leads. Large project tiles with real or placeholder imagery, varied sizes and an unusual but navigable layout (an index list that reveals a preview on hover, a horizontal gallery, an asymmetric grid).
- Each project: a title, the role, one line on the outcome, and a detail view with process and results. Never invent clients or metrics; sample entries are marked.
- Typography carries the personality: an expressive display face or an oversized name, set with care.
- A short, human about section in the person's own voice, and one obvious way to get in touch.
- Motion is part of the signature: image reveals, a hover preview that follows the pointer, smooth page-to-detail transitions (with reduced-motion fallbacks).`,
  ),
  skill(
    "App and dashboard UI",
    /\b(dashboard|admin|crm|web app|application|portal|tracker|booking (?:system|app)|inventory|accounts?|log ?in|internal tool|analytics)\b/i,
    `---
name: app-and-dashboard-ui
description: Product UI that is calm, fast and complete: clear navigation, dense-but-readable data, and every state designed.
---
- Navigation that scales: a sidebar or top bar with clear current-page state, and a layout that works from phone to wide desktop.
- Data first: tables and lists with sorting and filtering that really work, numbers in a tabular figure style, charts only where a chart explains better than a number.
- Every state is designed: loading skeletons shaped like the content, empty states that say how to start, inline errors that say how to fix them, success feedback that confirms what changed.
- Forms: labels above inputs, helpful hints, validation as the person types, and keyboard support throughout.
- Motion is functional: list items animate in and out, panels slide, values tween when they change. Subtle, fast and always disabled under reduced motion.
- If there's no backend yet, keep the data in the browser and say so in the UI, so every flow still works end to end.`,
  ),
];

export function getBuiltInSkill(id: string): BuiltInSkill | null {
  return FARBAEK_SKILLS.find((s) => s.id === id) ?? null;
}

/** The skills that fit a prompt, most relevant first, at most three. */
export function suggestSkills(prompt: string, max = 3): BuiltInSkill[] {
  return FARBAEK_SKILLS.map((s) => ({ s, hits: (prompt.match(new RegExp(s.keywords.source, "gi")) ?? []).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.s);
}
