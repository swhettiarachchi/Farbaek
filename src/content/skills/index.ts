/**
 * Farbaek's built-in skills (ADR 0030), written in the SKILL.md format
 * (name, description, instructions) so they read like any Claude Skill.
 * People choose them on the plan card: the premium core (motion, 3D and
 * brand identity, ADR 0156) is ticked for anything people will see, and the
 * ones that fit a prompt are suggested. The Studio standard always applies;
 * these go deeper.
 */
import { starterForPrompt } from "@/core/agent/prompt-start";
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
    /\b(animat\w*|motion|interactive|smooth|scroll\w*|transition\w*|dynamic|futuristic|wow|impress\w*|premium|modern|landing page)\b/i,
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
description: A memorable 3D moment on every site, from Farbaek Scenes and CSS 3D to a custom three.js form, fast and safe on phones.
---
- Every site gets one 3D signature. Start with Farbaek Scenes (see the Studio standard) and pick the scene from the brand's world: aurora for night, calm and wonder; glass for craft, clarity and luxury; particles for data, AI and science; horizon for travel, mobility and the future; orb for premium services, finance and space; gallery to show the work itself. Match it to the brand with data-palette or the page's --accent and --accent-2.
- Compose it: the scene sits behind or beside the message, never on top of text. Behind the hero copy, add a gradient scrim so the headline keeps WCAG AA contrast; beside it, give the box a fixed aspect ratio and a frame in the site's radius system.
- Add depth around it with lighter tools: perspective cards that tilt toward a fine pointer (rotateX and rotateY up to 8 degrees, eased back on leave), layered parallax driven by scroll-driven animations, and overlapping sections with soft shadows tinted to the background.
- When the brief needs a specific form (a product, a logo, a building), write a custom three.js scene: import https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js lazily as an ES module, keep geometry procedural and art-directed (no model files: the preview can't fetch them), start it only on screen, pause it off screen and in a hidden tab, cap the pixel ratio at 2 (1.5 on touch screens) and dispose of it cleanly.
- Always render a still first (a poster image or a gradient in the same composition) and keep it for prefers-reduced-motion, missing WebGL and weak devices (fewer than 4 cores, navigator.deviceMemory under 4, or saveData). Four-core laptops and phones should get the scene. Farbaek Scenes does all of this for you.
- Never more than one WebGL scene in view at a time. A second 3D moment further down the page uses CSS 3D or a library video loop instead.`,
  ),
  skill(
    "Flagship site craft",
    /\b(landing page|home ?page|marketing (?:site|page)|launch page|product launch|startup)\b/i,
    `---
name: flagship-site-craft
description: The composition, rhythm and proof of the best commercial websites (the level of shopify.com or stripe.com), carried out in this brand's own look.
---
- Hero as a film still: full-bleed real media (a library video loop, a real photo of the person's world, or a Farbaek Scenes moment) under a soft scrim; a large headline of two lines (64 to 96 px on desktop, 40 to 48 px on phones, light to medium weight, tight tracking), left-aligned; one or two short sentences; one solid pill button and at most one quiet outlined one. The navigation sits over the hero, transparent, and turns solid once the page scrolls.
- A rotating word in the headline is welcome when it shows the range of what the product does (a phrase like "Be the next ___" cycling three to six endings with a vertical slide), held still under reduced motion.
- Two-tone headlines open a section: the first sentence in full ink, the rest in the muted tone, for example "Sell everywhere. Online, in person and on social." Use it two or three times a page, not everywhere.
- Rhythm by colour blocks: sections change background (deep ink, a dark tinted with the brand colour, a light surface), and each new block starts with large rounded top corners (32 to 48 px) that overlap the one before, so the page reads as stacked panels. One or two tints, never a rainbow.
- Story cards: one wide card per idea, with a living visual inside (a prompt that types, items that assemble, a scene that changes as you scroll), a two-line headline and one sentence. Hold the card with position: sticky while its visual steps through two or three states, and show the final state as a still under reduced motion.
- Show the real product and real people: UI previews built from working components, a slow marquee of real work or customers (each labelled), customer stories as a photo, a name and one specific result in bold, and a short quote card overlapping a photo with the person's name and role. Invented ones are labelled as samples.
- Numbers that land: one or two huge, light numerals (96 to 160 px) with a small label and an icon above, a sentence with a thin accent rule beside it, and the source in small print. No number without a source or a "sample" label.
- Feature trios done right: three cards, each with its own visual (a UI moment, a photo, an animated diagram), a short bold title and one sentence with underlined inline links. Never three identical icon cards.
- A small floating video teaser (muted, in a bottom corner, with a play label and a close button) can carry the brand story without taking over the hero.
- Close with a real sequence of three steps to get started (numbered only because the order matters), one last call to action, and a dense, well-organised footer.
- Spacing and type: 120 to 200 px between sections on desktop, 72 to 96 px on phones; body text muted at 16 to 18 px; links in body copy underlined. On phones everything stacks, marquees keep moving slowly, and sticky stories become plain sequences.`,
  ),
  skill(
    "Product storytelling",
    /\b(product launch|launch(?:ing)?|pre-?order|device|gadget|hardware|headphones|earbuds|speaker|wearable|camera|single product|product page)\b/i,
    `---
name: product-storytelling
description: One product told like a flagship launch (the craft of apple.com): giant clean product imagery, short confident lines, scroll-driven chapters and claims with their sources.
---
- One idea per screen: full-width panels, each about a screen tall, alternating a deep dark and a soft light neutral; the product's name large and centred, one short line under it, and two pill buttons (a solid "Learn more" and an outlined "Buy" or "Pre-order"), then the product huge below, cut out on a clean background or in a Farbaek Scenes gallery or glass moment.
- A sticky local bar on the product page: the product name on the left, three to five section links, and a small solid "Buy" pill on the right. It appears once the hero scrolls away.
- The hero: the product floating in space, a giant two-line claim at the bottom left (56 to 96 px, semibold, tight tracking) with a footnote marker, and a floating chip at the bottom right with the price and a Buy button.
- Chapters driven by scroll: a sticky stage where the product turns, opens or changes colour while short captions step through beside it; a closer-look viewer where people rotate the product or switch its colours (Farbaek Scenes or CSS 3D, with a still under reduced motion); colour variants fanned behind the product.
- Specs people can scan: big numbers in a grid with one plain line each, then a comparison of the models side by side. Every claim with a number gets a footnote marker, and the footnotes sit together at the end of the page.
- Media rows: a centred carousel where the active slide is large and its neighbours peek in at the edges, with arrows, a pause button and dots.
- Words: short declarative lines and the odd playful one ("Hello."), sentence case, precise numbers, no superlatives without a source. Body text 17 to 21 px in a muted ink; headlines carry the weight.`,
  ),
  skill(
    "Luxury and editorial",
    /\b(luxur\w*|high[- ]end|exclusive|elegan\w*|boutique|jewel\w*|fashion|couture|hotel|resort|villa|spa|real estate|propert(?:y|ies)|interior\w*|architect\w*|fine dining|wine\w*|watch(?:es|maker)|perfume|fragrance|yacht\w*)\b/i,
    `---
name: luxury-and-editorial
description: The restraint, pace and detail of luxury and editorial brands, for hotels, fashion, jewellery, property and fine dining.
---
- Restraint is the luxury: generous white space (or deep darkness), few words per screen, one striking image or scene at a time, and slow, confident motion (600 to 900 ms, nothing bouncy).
- Typography leads: an elegant display face at large sizes with tight tracking (a high-contrast sans, or a refined serif only when the brand is heritage or editorial), small spaced labels used sparingly, and body text in a quiet humanist sans.
- Palette: a deep or pale neutral (ink, stone, ivory, smoke) with one precious accent drawn from the product, such as champagne or emerald. Don't reach for beige and brass by reflex.
- Media leads: a full-bleed video loop or a Farbaek Scenes glass or orb moment in the hero, then editorial image layouts (one large image with a short caption, an asymmetric pair, a slow horizontal gallery).
- Details that show care: hairline dividers, hover states that reveal (an image that unmasks, a line that draws), precise alignment, prices in tabular numerals, and an enquiry or booking flow that feels personal (a short form, a named contact, the reply time).
- Never fake exclusivity: no invented awards, press logos or waiting lists. Sample ones are labelled as samples.`,
  ),
  skill(
    "Video and media",
    /\b(videos?|film|cinematic|reel|footage|showreel|media|gallery|galleries|photos?|photography|visuals?|background video|hero video)\b/i,
    `---
name: video-and-media
description: Video heroes, galleries and imagery that look art-directed, load fast on phones, and sit in slots the person can replace.
---
- Every visual is a replaceable slot: data-farbaek-media="<slot name>" on each img, video and scene box, plus data-farbaek-placeholder while it's a stand-in. Name slots by their place: hero-video, team-photo, menu-gallery-1.
- Video heroes: <video autoplay muted loop playsinline preload="metadata" poster="..."> with a Farbaek library loop.mp4 and its still-16x9.webp as the poster, object-fit: cover, a gradient scrim under the text, and the poster instead of motion under reduced motion. One autoplaying video in view at a time.
- Galleries: a varied grid (one large, two small), a horizontal scroll-snap row on phones, or the gallery scene from Farbaek Scenes with the images inside its box. Every image has alt text and a reserved aspect ratio.
- Art direction: one treatment for every image on the site (a radius, a frame, a duotone made with gradient overlays, never a CSS filter), cropped to the composition with object-fit and object-position.
- Performance: only the first screen's poster or still loads eagerly (fetchpriority="high"); everything else uses loading="lazy" or preload="none", and the first screen's media stays under 2 MB.
- In the finish summary, list each placeholder slot with what the person should put there, for example "hero-video: a 10 to 20 second clip of your kitchen at service".`,
  ),
  skill(
    "Brand identity",
    /\b(brand\w*|identity|logo|luxury|premium|boutique|studio|agency|fashion|beauty|restaurant|caf[eé]|hotel|rental|business|company|bakery|salon|services?|consult\w*|clinic|firm|practice|landing page)\b/i,
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
description: A store that works like the best fashion and department-store sites (the craft of nordstrom.com and princesspolly.com) in this brand's own look, with every number and badge true.
---
- Header that sells quietly: a thin promo bar rotating two or three true messages (a free-delivery threshold, easy returns, pay later only if it's offered); the wordmark; a wide search with suggestions; account, wishlist and a bag with its count; one row of plain category links with Sale in the alert colour. A mega menu on desktop, a full-screen drill-down on phones.
- Home page as an edit: a full-bleed editorial hero (real photos or a library loop) that rotates two to five stories, with a slide count, arrows and a pause button, each with one solid button and one underlined text link; category pills that switch the product row beneath (New in, Best sellers, Dresses, Sale) with "Shop all"; editorial split modules (photo, short headline, one sentence, a button and a text link); gift or edit guides; a handwritten or stamped touch on a photo where the brand allows.
- Product cards: a tall 3:4 photo on a soft neutral, a second view on hover, a wishlist heart, small badges only when true (New, Selling fast, Low stock, Petite), the brand or name, the price (a sale price in the alert colour beside the struck-through original and the percentage), colour dots or photo chips with a count, and stars with the review count only when the reviews are real.
- Listing pages: breadcrumbs, the title and the result count, a sticky filter row (Filter, Sort, Size, Colour, Price) whose choices show as removable chips and really filter the page's data, a grid of two on phones and three or four on desktop (edge to edge with hairlines, or gapped, one system per site), "Showing 24 of 96" with Load more, and skeletons shaped like the cards while anything loads.
- Product page: a gallery (a thumbnail rail or a two-up grid, with a short video when there is one); name, price and any offer; the colour name above its swatches; sizes as a grid of buttons with sold-out sizes struck through; a size guide and a fit note; a primary button whose label says what's missing ("Select a size") until it's ready, then "Add to bag", with "Add to wishlist" beside it; delivery, returns and care as accordions; "You might also like" and recently viewed. On phones the buy button sticks to the bottom.
- The bag: a drawer that slides in on add, with photos, quantities, removal, a free-delivery progress line ("$12 away from free delivery"), the subtotal and checkout. It works in the browser (localStorage). If no payment is connected, checkout says so plainly ("Checkout isn't connected yet").
- One designed sign-up moment at most: an offer drawn as a brand object (a pass, a ticket, a stamped card), shown after the visitor has looked around, easy to close, never asking twice.
- Honest urgency only: never invent reviews, ratings, "people viewing now", stock counts or countdowns. Sample ones are labelled as samples, and a real-time count needs real data behind it.`,
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
  skill(
    "Mobile app screens",
    /\b(mobile app|phone app|ios|android|iphone|app screens?|onboarding|react native|expo|pwa|bottom tab)\b/i,
    `---
name: mobile-app-screens
description: App-native phone screens that feel made for a hand, not a website squeezed into a phone.
---
- Design for a real phone: respect the status bar, the notch and the home indicator (env(safe-area-inset-*)), keep the main action within thumb reach in the lower half, and make every target at least 44 by 44 px.
- Pick one platform feel and keep it: iOS-like (large titles, a tab bar, sheets) or Android-like (a top app bar, bottom navigation, firmer cards). Don't mix the two on one screen.
- Navigation people can predict: a bottom tab bar for three to five main sections, a back stack for drilling into detail, sheets for short side tasks, and one obvious primary action per screen.
- Keep the first screen calm: one focal point, a headline of one to three short lines, one clear next step. No rows of chips, stats or tags above the fold.
- Lock a small design system before the second screen (palette with one accent, type scale, spacing, corner radii, icon style) and use it on every screen after, so the flow feels like one app.
- Build flows, not single screens: when the brief implies a journey (onboarding, sign-in, browse to detail, cart to checkout), make each step its own screen with real transitions, and vary the composition from screen to screen without changing the system.
- Text stays readable: body at least 16 px, labels at least 13 px, and a scrim or a soft fade under any text that sits on an image.
- Use imagery and texture with intent: an image-led welcome, a photo header that fades into the page, or a light grain on one hero area makes an app feel crafted. Keep it consistent across screens and never at the cost of legibility.
- Avoid the mobile AI tells: purple-blue gradients, glass cards everywhere, fake chart dashboards, rows of tiny pills, and one screen repeated with only the icon changed.
- In a website, show the app in a clean phone frame with even margins. In an app project, build real screens with working navigation, and when there's no backend yet keep the data in the browser and say so.`,
  ),
];

export function getBuiltInSkill(id: string): BuiltInSkill | null {
  return FARBAEK_SKILLS.find((s) => s.id === id) ?? null;
}

/** The premium core (ADR 0156): on by default for every build people will see. */
export const CORE_SKILL_IDS = ["motion-and-interaction", "3d-and-depth", "brand-identity"] as const;
/** Added to the core for a website: the craft of the best commercial sites. */
export const SITE_SKILL_ID = "flagship-site-craft";

/**
 * The skills ticked on the plan card: the premium core for anything people
 * will see (not an API with no pages), the flagship craft for a website, and
 * up to two more that fit the plan. People can still untick any of them.
 */
export function defaultSkills(text: string): BuiltInSkill[] {
  const starter = starterForPrompt(text);
  const ids = starter === "rest-api" ? [] : [...CORE_SKILL_IDS, ...(starter === "static-website" ? [SITE_SKILL_ID] : [])];
  const core = ids.map((id) => getBuiltInSkill(id)!);
  const extra = suggestSkills(text, FARBAEK_SKILLS.length).filter((s) => !core.includes(s));
  return [...core, ...extra.slice(0, 2)];
}

/** The skills that fit a prompt, most relevant first, at most three. */
export function suggestSkills(prompt: string, max = 3): BuiltInSkill[] {
  return FARBAEK_SKILLS.map((s) => ({ s, hits: (prompt.match(new RegExp(s.keywords.source, "gi")) ?? []).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.s);
}
