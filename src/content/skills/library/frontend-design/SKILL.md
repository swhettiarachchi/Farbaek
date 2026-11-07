---
name: frontend-design
description: Makes the build design a distinct look from its own subject (a token plan checked against generic AI defaults before coding, deliberate type, one bold element, plain interface copy), for any site or app that should look like nobody else's.
---
Farbaek edition of "Frontend Design" by Anthropic (Apache-2.0), https://github.com/anthropics/skills/tree/main/skills/frontend-design. Shortened to fit a build, without what the Farbaek standard already covers. The full licence is in LICENSE.txt beside this file.

Work as the design lead of a studio known for identities nobody mistakes for another's. The client rejected templated proposals and pays for a point of view: opinionated palette, type and layout for this brief, with aesthetic risk where justified.

## Principles
- If the brief doesn't name the subject, propose one (subject, audience, primary job) in your plan.
- Distinctive choices come from the subject's industry, materials and vernacular: a toy for girls aged 8 to 11 looks nothing like a dashboard for financial analysts.
- The hero opens with the most characteristic thing in the subject's world, in the form that suits it (headline, image, animation, live demo). Use the default (a big number, small label, stats, gradient accent) only if it's best.
- Type carries the personality: one family or two clearly distinct ones, not your usual faces, on a clear scale after The Elements of Typographic Style with intentional weights, widths and spacing. In a headline the type treatment is part of the design.
- Lines under 80 characters; serif body a little longer, with a little more line-height.
- Avoid the commonest tells: one word in a headline accented (italic, bold or colour), all-caps labels, unneeded labels above content.
- Structure is information. Borders, numbers, dividers and labels encode content; numbered markers (01, 02, 03) only for a real sequence.
- Unprompted motion is rare, only to draw attention: one orchestrated load or reveal beats scattered effects; fade-ups on every section and hovers on every card read as AI-made. Motion answering an action (open, expand, confirm) is welcome when it shows what changed.

## Know the defaults
AI-made design clusters around:
1. warm cream (near #F4F1EA), a high-contrast serif display and a terracotta accent (near #D97757, Anthropic's own Claude accent, a tell on anyone else's brief);
2. near-black with one acid-green or vermilion accent;
3. a broadsheet: hairline rules, zero radius, dense columns;
4. the SaaS-card kit: identical rounded cards, one radius everywhere, the same soft shadow (rgba(0,0,0,.1)) under each, gradient washes as decoration;
5. template chrome on any subject: tracked caps eyebrows, meta joined by middle dots, "word, spaced em dash, fragment" labels, #0B0B0B or #111 for black, monospace data labels, an arrow appended to links and buttons.
Each suits some brief but is a default, not a choice. Follow any direction the brief pins exactly, even one of these; don't spend a free axis on a default.

## Process
- Plan a compact token system: colour (4 to 6 named hex values), type (faces, roles), layout (one-line concepts and ASCII wireframes, with alignment: left, centred or justified) and what makes this page unique.
- Review it against the brief before coding: revise any part you'd make for any similar page (test it on a similar prompt) and say what changed and why.
- Watch CSS specificity: .section and .cta rules cancel out easily, often in section spacing.
- Spend boldness in one place: one memorable element, the rest quiet, no decoration the brief doesn't need. Critique as you build; like Chanel, remove one accessory before leaving the house.

## Writing
- Name things as users know them, not as the system is built (notifications, not webhook config). Say what it does, don't sell it; specific beats clever.
- Active voice. A button says what happens ("Save changes", not "Submit"), and an action keeps its name through the flow ("Publish", then "Published").
- Errors and empty screens give direction, not mood: what went wrong and how to fix it, in the interface's voice, never apologetic or vague. An empty screen invites action.
- Plain verbs, sentence case, tone matched to the audience, each element one job.
