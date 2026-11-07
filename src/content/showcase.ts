/**
 * The homepage showroom (ADR 0031): eight concepts that show the range of
 * what people can ask Farbaek to build. They are concept mockups drawn in
 * code for this page, not live products, and the page says so. Each has its
 * own design read, the way a build's DESIGN.md does, and a prompt the
 * visitor can hand to the build box.
 *
 * Palettes here are the concepts' own colours. They're used only inside the
 * mockup frames; Farbaek's own interface keeps its tokens (ADR 0008).
 */

export type ConceptLayout = "specimen" | "gallery" | "cinema" | "product" | "workspace" | "pocket" | "mascot" | "fullstack";

export type SwatchRole = "surface" | "ink" | "accent" | "support" | "muted";

export interface ShowcaseConcept {
  id: ConceptLayout;
  /** The category it stands for in the showroom's index. */
  category: string;
  name: string;
  kind: "Website" | "Web app" | "Mobile app" | "Online store and app" | "Web app and mobile app";
  /** One sentence: what it is and why it's memorable. */
  line: string;
  /** What a visitor hands to the build box with "Start a build like this". */
  prompt: string;
  /** Built-in skill labels (src/content/skills) a build like this would use. */
  skills: readonly string[];
  palette: readonly { name: string; hex: string; role: SwatchRole }[];
  type: string;
  signature: string;
  /** What the mockup shows, for people who can't see it. */
  alt: string;
}

export const SHOWCASE: readonly ShowcaseConcept[] = [
  {
    id: "specimen",
    category: "Type foundry",
    name: "Typeset Foundry",
    kind: "Website",
    line: "A type foundry's site where the letters are the interface.",
    prompt: "A website for my type foundry with a live type tester, a glyph grid and font licences people can buy",
    skills: ["Brand identity", "Motion and interaction"],
    palette: [
      { name: "Proof paper", hex: "#f2f2ef", role: "surface" },
      { name: "Press ink", hex: "#141414", role: "ink" },
      { name: "Signal red", hex: "#e5322d", role: "accent" },
      { name: "Graphite", hex: "#6f6f6b", role: "muted" },
    ],
    type: "Geist at its heaviest, set huge and tight, with Geist Mono for specimens.",
    signature: "Glyphs that shift weight like a breath, and a tester that sets your own words.",
    alt: "A type foundry website: a huge specimen of the word Kestrel in three weights, a weight slider, a glyph grid, and a floating type tester card.",
  },
  {
    id: "gallery",
    category: "Luxury retail",
    name: "Maison Ore",
    kind: "Online store and app",
    line: "Leather goods shown like gallery pieces, in a store that never hurries you.",
    prompt: "An online store for my leather goods brand that feels like a gallery, with one product per screen and a calm checkout",
    skills: ["Shop and product pages", "Brand identity", "Motion and interaction"],
    palette: [
      { name: "Gallery silver", hex: "#e6e7e9", role: "surface" },
      { name: "Graphite", hex: "#16171a", role: "ink" },
      { name: "Frost", hex: "#9db7cc", role: "accent" },
      { name: "Steel", hex: "#6e737c", role: "muted" },
    ],
    type: "Wide-tracked capitals for the name, quiet sentence case for everything else.",
    signature: "One product per screen, lit like a sculpture on a plinth.",
    alt: "A luxury leather goods store: an editorial page with a handbag lit on a plinth, and a phone showing the same bag's product page with an Add to bag button.",
  },
  {
    id: "cinema",
    category: "Film festival",
    name: "Afterglow",
    kind: "Website",
    line: "A film festival site that opens like a title sequence.",
    prompt: "A website for our summer film festival that opens like a title sequence, with the programme, the films and tickets",
    skills: ["Motion and interaction", "Brand identity"],
    palette: [
      { name: "Velvet", hex: "#2a0a18", role: "surface" },
      { name: "Marquee white", hex: "#f6eee4", role: "ink" },
      { name: "Bulb amber", hex: "#ffb547", role: "accent" },
      { name: "Curtain", hex: "#5c1a33", role: "support" },
    ],
    type: "Condensed capitals, like letters on a cinema marquee.",
    signature: "A film strip that runs across the page, frame by frame, under a row of marquee bulbs.",
    alt: "A film festival website in deep velvet red: the title Afterglow 27 in tall condensed capitals, a running film strip of five stills, and a Now showing card.",
  },
  {
    id: "product",
    category: "Product launch",
    name: "Halo One",
    kind: "Website",
    line: "Headphones you can turn, recolour and inspect before you buy.",
    prompt: "A product page for my headphones with a 3D view people can turn, colour options and the specs",
    skills: ["3D and depth", "Shop and product pages", "Motion and interaction"],
    palette: [
      { name: "Studio grey", hex: "#edeff2", role: "surface" },
      { name: "Carbon", hex: "#15171b", role: "ink" },
      { name: "Ultra orange", hex: "#ff6a13", role: "accent" },
      { name: "Mist", hex: "#c9ced6", role: "support" },
    ],
    type: "A precise grotesk with tabular figures for the specs.",
    signature: "A product that leans toward you, with finishes you can try on the spot.",
    alt: "A headphone product presentation: the headphones float inside an orbit ring with spec callouts, and four finish swatches change their colour.",
  },
  {
    id: "workspace",
    category: "Research",
    name: "Northlight",
    kind: "Web app",
    line: "A research workspace where the AI drafts, and every sentence shows its source.",
    prompt: "A web app where my team collects research and an AI drafts summaries, with every sentence linked to its source",
    skills: ["App and dashboard UI", "Software product site"],
    palette: [
      { name: "Paper", hex: "#fafaf9", role: "surface" },
      { name: "Ink", hex: "#18181b", role: "ink" },
      { name: "Aurora green", hex: "#0f9d76", role: "accent" },
      { name: "Slate", hex: "#64748b", role: "muted" },
    ],
    type: "Geist for the interface, Geist Mono for sources and keys.",
    signature: "Citations you can trace: hover a sentence and its source lights up.",
    alt: "A research web app, tilted in perspective: projects in a sidebar, a drafted summary with numbered citations, a sources panel, and a command bar floating in front.",
  },
  {
    id: "pocket",
    category: "Shared expenses",
    name: "Tally",
    kind: "Mobile app",
    line: "Shared money for housemates: who paid, who owes, settled in a tap.",
    prompt: "A mobile app for housemates to share bills, see who owes what and settle up in one tap",
    skills: ["Mobile app screens", "App and dashboard UI", "Motion and interaction"],
    palette: [
      { name: "Fern paper", hex: "#f3f6f2", role: "surface" },
      { name: "Forest", hex: "#0e3b2e", role: "ink" },
      { name: "Mint", hex: "#5fd39a", role: "accent" },
      { name: "Moss", hex: "#5b7268", role: "muted" },
    ],
    type: "Big, friendly numerals for balances; plain labels for everything else.",
    signature: "A balance ring that closes as the house settles up.",
    alt: "Two phone screens of a bill-sharing app: a house balance ring with housemates and a Settle up button, and a grocery bill split four ways.",
  },
  {
    id: "mascot",
    category: "Habits and wellbeing",
    name: "Kumo",
    kind: "Mobile app",
    line: "A habit app with a small cloud that puffs up as you keep your streak.",
    prompt: "A cute habit tracker app with a little cloud mascot that grows as I keep my streaks",
    skills: ["Mobile app screens", "Brand identity", "Motion and interaction"],
    palette: [
      { name: "Morning", hex: "#eef3ff", role: "surface" },
      { name: "Plum ink", hex: "#2a2340", role: "ink" },
      { name: "Peach", hex: "#ff8c69", role: "accent" },
      { name: "Butter", hex: "#ffe07a", role: "support" },
    ],
    type: "Soft rounded type at generous sizes.",
    signature: "Kumo, a cloud that bounces when you tick a habit off.",
    alt: "A habit tracker phone screen with a smiling cloud mascot, a 12 day streak and three habits, surrounded by small stickers.",
  },
  {
    id: "fullstack",
    category: "Clinic bookings",
    name: "Orbit Clinic",
    kind: "Web app and mobile app",
    line: "Patients book on their phone; the clinic runs the day from one shared schedule.",
    prompt: "A booking system for my physio clinic: patients book times on their phone, and staff see the day's schedule on a dashboard",
    skills: ["App and dashboard UI", "Mobile app screens"],
    palette: [
      { name: "Clinic white", hex: "#f7f9fb", role: "surface" },
      { name: "Navy", hex: "#0b2545", role: "ink" },
      { name: "Care teal", hex: "#0e9f8f", role: "accent" },
      { name: "Fog", hex: "#5d6b7c", role: "muted" },
    ],
    type: "A calm sans with tabular times.",
    signature: "One schedule shared by the booking app and the clinic's dashboard.",
    alt: "A clinic dashboard with a day calendar of appointments per therapist, and a phone in front where a patient picks a 10:30 slot.",
  },
];

export function swatch(concept: ShowcaseConcept, role: SwatchRole): string {
  return concept.palette.find((p) => p.role === role)?.hex ?? concept.palette[0]!.hex;
}

/**
 * What Farbaek does around the design. Each line is something that exists
 * in this repository; a status that depends on configuration is worked out
 * on the server where the page is rendered.
 */
export type CapabilityStatus = "working" | "turning-on" | "not-yet";

export interface Capability {
  id: string;
  title: string;
  body: string;
  /** Fixed, or worked out from this server's configuration. */
  status: CapabilityStatus | "site-domain" | "app-previews" | "image-generation";
}

export const CAPABILITIES: readonly Capability[] = [
  { id: "plan", title: "A plan before anything is built", body: "Describe it in plain words. Farbaek drafts a plan you edit and approve.", status: "working" },
  {
    id: "design",
    title: "Design to a studio standard",
    body: "Every site builds on the Farbaek Studio kit: a design read, a 3D moment, choreographed motion, and photos and video you can replace in a click. Paid plans add Studio kit Pro.",
    status: "working",
  },
  { id: "skills", title: "Skills, including your own", body: "Twelve built-in design skills, a library of open-licensed ones to add in a click, and your own or any from GitHub, in the open SKILL.md format.", status: "working" },
  { id: "agent", title: "An agent you can steer", body: "It builds in the cloud under the plan you approved. Message it mid-run; every tool call is checked against the plan.", status: "working" },
  { id: "preview", title: "Previews of real code", body: "Static sites preview instantly. Apps with a server run in an isolated test space.", status: "app-previews" },
  { id: "checks", title: "Checks before it's done", body: "The agent reviews its own pages, security checks score the code, and the plan's checks run real commands.", status: "working" },
  { id: "proof", title: "Approval and proof", body: "Approvals bind to the exact change, and a ProofPack records what ran and what it doesn't prove.", status: "working" },
  { id: "publish", title: "Publish to your own address", body: "A static site goes live on its own address after a security check finds nothing critical.", status: "site-domain" },
  { id: "bring", title: "Bring your project, take your code", body: "Import a .zip of an app built elsewhere for a security report, and download your code at any time.", status: "working" },
  { id: "images", title: "Image generation", body: "Describe a picture and Farbaek makes it straight into your project, counted against your AI usage. Or add your own images.", status: "image-generation" },
];

export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  working: "Working",
  "turning-on": "Turning on",
  "not-yet": "Not yet",
};
