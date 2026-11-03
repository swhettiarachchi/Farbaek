/**
 * Sections a person can add to a page from Studio (ADR 0159), built from the
 * Farbaek Studio kit's classes, with stand-in photos in replaceable slots and
 * copy in [square brackets] to write over. Only these ids can be inserted:
 * Studio never inserts HTML it was handed. The Pro ones need Studio kit Pro.
 */
import { photoUrl } from "../media/photos";

const img = (id: string | number, w: number, h: number, slot: string, alt: string) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}" loading="lazy" data-farbaek-media="${slot}" data-farbaek-placeholder />`;

const card = (id: string | number, slot: string) => `        <article class="fs-card" data-fs-reveal>
          <div class="fs-frame" data-fs-tilt="4">${img(id, 1200, 900, slot, "[Describe the photo]")}</div>
          <h3 class="fs-h3">[A short title]</h3>
          <div class="fs-card__meta"><span>[A detail]</span><span>[A price or a note]</span></div>
        </article>`;

export const SNIPPETS = {
  split: {
    label: "Feature with photo",
    description: "A photo beside a headline, a sentence and three points.",
    pro: false,
    html: `<section class="fs-section">
      <div class="fs-container fs-split">
        <div class="fs-frame" data-fs-reveal="mask">${img("1603201667141-5a2d4c673378", 1100, 1375, "feature-photo", "[Describe the photo]")}</div>
        <div class="fs-split__text">
          <h2 class="fs-h2" data-fs-reveal>[What makes this different]</h2>
          <p class="fs-lead" data-fs-reveal>[Two plain sentences about it.]</p>
          <ul class="fs-list" data-fs-stagger>
            <li data-fs-reveal>[A concrete detail]</li>
            <li data-fs-reveal>[A concrete detail]</li>
            <li data-fs-reveal>[A concrete detail]</li>
          </ul>
        </div>
      </div>
    </section>`,
  },
  stats: {
    label: "Numbers",
    description: "Three figures that count up when they're seen.",
    pro: false,
    html: `<section class="fs-section fs-section--raised" aria-label="In numbers">
      <div class="fs-container">
        <div class="fs-stats" data-fs-stagger>
          <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>120</span><span class="fs-stat__label">[What the number counts]</span></div>
          <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>98%</span><span class="fs-stat__label">[What the number counts]</span></div>
          <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>12</span><span class="fs-stat__label">[What the number counts]</span></div>
        </div>
        <p class="fs-small">Sample figures. Replace them with yours.</p>
      </div>
    </section>`,
  },
  cards: {
    label: "Card gallery",
    description: "Three photo cards that tilt, with a title and details.",
    pro: false,
    html: `<section class="fs-section">
      <div class="fs-container">
        <div class="fs-head fs-head--split">
          <h2 class="fs-h2" data-fs-reveal>[A heading for the cards]</h2>
          <p class="fs-lead" data-fs-reveal>[One sentence that frames them.]</p>
        </div>
        <div class="fs-mosaic" data-fs-stagger>
${card(0, "card-1")}
${card(1, "card-2")}
${card(60, "card-3")}
        </div>
      </div>
    </section>`,
  },
  quote: {
    label: "Quote",
    description: "One large quote from a customer, marked as a sample.",
    pro: false,
    html: `<section class="fs-section fs-section--raised">
      <div class="fs-container">
        <figure class="fs-quote" data-fs-reveal>
          <blockquote>[What a real customer said, in their words.]</blockquote>
          <figcaption><span>[Name], [where they're from]</span><span class="fs-sample">Sample quote</span></figcaption>
        </figure>
      </div>
    </section>`,
  },
  faq: {
    label: "Questions",
    description: "Questions that open to their answers.",
    pro: false,
    html: `<section class="fs-section">
      <div class="fs-container fs-split fs-split--wide">
        <div class="fs-head"><h2 class="fs-h2" data-fs-reveal>Questions, answered</h2></div>
        <div class="fs-faq" data-fs-reveal>
          <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
          <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
          <details><summary>[A question people really ask]</summary><p>[A short, direct answer.]</p></details>
        </div>
      </div>
    </section>`,
  },
  cta: {
    label: "Call to action",
    description: "A bold closing band with one button.",
    pro: false,
    html: `<section class="fs-section">
      <div class="fs-container">
        <div class="fs-cta" data-fs-reveal="scale">
          <h2 class="fs-h2">[An invitation to take the next step]</h2>
          <p class="fs-lead">[Where, when and how.]</p>
          <div class="fs-actions"><a class="fs-btn" href="#top">[Your main action] <span class="fs-btn__icon" aria-hidden="true"></span></a></div>
        </div>
      </div>
    </section>`,
  },
  photos: {
    label: "Photo gallery",
    description: "Five photos in a varied grid that unmask as you scroll.",
    pro: false,
    html: `<section class="fs-section">
      <div class="fs-container">
        <div class="fs-mosaic" data-fs-stagger>
          <div class="fs-frame" data-fs-reveal="mask">${img(43, 1600, 1000, "gallery-1", "[Describe the photo]")}</div>
          <div class="fs-frame" data-fs-reveal="mask">${img(22, 900, 1100, "gallery-2", "[Describe the photo]")}</div>
          <div class="fs-frame" data-fs-reveal="mask">${img(78, 900, 1100, "gallery-3", "[Describe the photo]")}</div>
          <div class="fs-frame" data-fs-reveal="mask">${img(15, 900, 1100, "gallery-4", "[Describe the photo]")}</div>
          <div class="fs-frame" data-fs-reveal="mask">${img(13, 900, 1100, "gallery-5", "[Describe the photo]")}</div>
        </div>
      </div>
    </section>`,
  },
  chapters: {
    label: "Story chapters",
    description: "A sticky picture that changes as each chapter is read.",
    pro: true,
    html: `<section class="fs-section">
      <div class="fs-container fs-chapters">
        <div class="fs-chapters__stage">
          ${img(0, 1200, 1400, "chapter-1", "[Describe the photo]").replace("<img ", '<img data-fs-show="1" ')}
          ${img(60, 1200, 1400, "chapter-2", "[Describe the photo]").replace("<img ", '<img data-fs-show="2" ')}
          ${img(201, 1200, 1400, "chapter-3", "[Describe the photo]").replace("<img ", '<img data-fs-show="3" ')}
        </div>
        <div>
          <div class="fs-chapter" data-fs-step="1"><span class="fs-chapter__num">01</span><h3 class="fs-h3">[The first step]</h3><p class="fs-muted">[One sentence.]</p></div>
          <div class="fs-chapter" data-fs-step="2"><span class="fs-chapter__num">02</span><h3 class="fs-h3">[The second step]</h3><p class="fs-muted">[One sentence.]</p></div>
          <div class="fs-chapter" data-fs-step="3"><span class="fs-chapter__num">03</span><h3 class="fs-h3">[The third step]</h3><p class="fs-muted">[One sentence.]</p></div>
        </div>
      </div>
    </section>`,
  },
  carousel: {
    label: "Carousel",
    description: "Large slides that peek in at the edges, with pause.",
    pro: true,
    html: `<section class="fs-section">
      <div class="fs-carousel">
        <div class="fs-carousel__track">
          <figure class="fs-slide">${img(43, 1600, 1000, "slide-1", "[Describe the photo]")}<figcaption><strong>[A title]</strong><span class="fs-muted">[A line]</span></figcaption></figure>
          <figure class="fs-slide">${img(10, 1600, 1000, "slide-2", "[Describe the photo]")}<figcaption><strong>[A title]</strong><span class="fs-muted">[A line]</span></figcaption></figure>
          <figure class="fs-slide">${img(66, 1600, 1000, "slide-3", "[Describe the photo]")}<figcaption><strong>[A title]</strong><span class="fs-muted">[A line]</span></figcaption></figure>
        </div>
        <div class="fs-carousel__controls"><button type="button" data-fs-prev aria-label="Previous slide"></button><button type="button" data-fs-pause aria-label="Pause the slides"></button><button type="button" data-fs-next aria-label="Next slide"></button></div>
      </div>
    </section>`,
  },
  marquee: {
    label: "Marquee",
    description: "A slow, endless line of words or names.",
    pro: true,
    html: `<section class="fs-section" aria-label="[What these are]">
      <div class="fs-marquee"><div class="fs-marquee__track"><span>[A name]</span><span>[A name]</span><span>[A name]</span><span>[A name]</span><span>[A name]</span></div></div>
    </section>`,
  },
} as const satisfies Record<string, { label: string; description: string; pro: boolean; html: string }>;

export type SnippetId = keyof typeof SNIPPETS;
export const isSnippetId = (id: string): id is SnippetId => Object.hasOwn(SNIPPETS, id);
