/**
 * Farbaek's skill library (ADR 0179): open-licensed design skills anyone can add to a project, each with its
 * author, licence and source. The texts are Farbaek editions: each keeps its author's rules, shortened to fit a
 * build, and says so at the top. They live in the folders beside this file and are folded into
 * texts.generated.ts by scripts/skills/build-library.mjs.
 *
 * Only skills whose licence lets anyone share them belong here. One the owner asked for, mobile-app-ui-design,
 * has no licence, so it isn't here: its general principles went into the built-in Mobile app screens skill instead.
 */
import type { LibrarySkill, LibrarySkillMeta } from "@/core/agent/skill-library";
import { LIBRARY_TEXTS } from "./texts.generated";

const TASTE = "https://github.com/Leonxlnx/taste-skill";

const META: readonly LibrarySkillMeta[] = [
  {
    id: "design-taste-frontend",
    label: "Design taste",
    summary: "Layouts, type and motion that don't look templated, with firm rules against the usual AI-made look.",
    uses: ["websites", "apps"],
    author: "Leonxlnx",
    licence: "MIT",
    source: `${TASTE}/tree/main/skills/taste-skill`,
  },
  {
    id: "frontend-design",
    label: "Distinctive visual direction",
    summary: "A look made for this brief alone: a chosen palette, type with character and one signature idea, then a self-critique.",
    uses: ["websites", "apps"],
    author: "Anthropic",
    licence: "Apache-2.0",
    source: "https://github.com/anthropics/skills/tree/main/skills/frontend-design",
  },
  {
    id: "high-end-visual-design",
    label: "High-end agency look",
    summary: "The spacing, type, surfaces and card craft that make a site feel expensive.",
    uses: ["websites"],
    author: "Leonxlnx",
    licence: "MIT",
    source: `${TASTE}/tree/main/skills/soft-skill`,
  },
  {
    id: "gpt-taste",
    label: "Editorial layout and motion",
    summary: "Wide editorial type, varied layouts and scroll-driven motion for a site that tells a story.",
    uses: ["websites"],
    author: "Leonxlnx",
    licence: "MIT",
    source: `${TASTE}/tree/main/skills/gpt-tasteskill`,
  },
  {
    id: "ui-ux-pro-max",
    label: "UI and UX checks",
    summary: "Accessibility, touch, layout, type, colour, motion, forms and charts, checked in order of what matters most.",
    uses: ["websites", "apps", "phone-apps"],
    author: "Next Level Builder",
    licence: "MIT",
    source: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
  },
  {
    id: "premium-app-ui",
    label: "Premium app screens",
    summary: "Restrained, crafted app screens: one hero per screen, a small token system, physical motion and depth that stays light on phones.",
    uses: ["apps", "phone-apps"],
    author: "Farbaek",
    licence: "Farbaek",
    source: null,
  },
  {
    id: "imagegen-frontend-web",
    label: "Art direction for site pictures",
    summary: "Image-led layouts, one consistent visual style, and placeholders that describe exactly the photo to put there.",
    uses: ["websites", "pictures"],
    author: "Leonxlnx",
    licence: "MIT",
    source: `${TASTE}/tree/main/skills/imagegen-frontend-web`,
  },
  {
    id: "imagegen-frontend-mobile",
    label: "Art direction for app screens",
    summary: "App screens that feel like one product: image-led composition, texture with intent and a clean phone frame.",
    uses: ["phone-apps", "pictures"],
    author: "Leonxlnx",
    licence: "MIT",
    source: `${TASTE}/tree/main/skills/imagegen-frontend-mobile`,
  },
];

export const SKILL_LIBRARY: readonly LibrarySkill[] = META.map((m) => {
  const texts = LIBRARY_TEXTS[m.id];
  if (!texts) throw new Error(`The library skill "${m.id}" has no SKILL.md. Run node scripts/skills/build-library.mjs.`);
  return { ...m, markdown: texts.skill, licenceText: texts.licence };
});

export function getLibrarySkill(id: string): LibrarySkill | null {
  return SKILL_LIBRARY.find((s) => s.id === id) ?? null;
}
