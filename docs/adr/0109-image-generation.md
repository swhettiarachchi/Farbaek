# ADR 0109: Image generation with Gemini

- Status: accepted (2026-10-29). The owner chose "do what you recommend most".
- Builds on ADR 0108 (images in projects), ADR 0014 (Gemini), ADR 0019 and ADR 0020 (AI usage).

## Context

Image generation was listed as Next on the homepage. `current-state.md` said it needed the owner's choice of provider and pricing.

The owner can't add paid services. Farbaek already calls Google's Gemini API with the owner's key (ADR 0014), and Google sells image generation on the same key.

Google's pricing page (updated 2026-10-28) lists `gemini-3.1-flash-lite-image` as the cheapest image model: $0.0336 for a 1K image, $0.25 per million input tokens. It's also the model Google names to replace the deprecated `gemini-2.5-flash-image`.

## Decision

**The model.** `gemini-3.1-flash-lite-image` by default. `GEMINI_IMAGE_MODEL` may name another one. The feature needs `GEMINI_API_KEY`; without it, the form is visibly unavailable and says why.

**Metering, like every AI call:**
- `image_generation` is a usage operation (the ledger's check is updated in migration v69);
- the model is on the rate card at $0.25 input and $30 per million image output tokens, so a 1K image (1,120 tokens) is 337 units with its prompt;
- room is reserved before the call and settled to what Google reports, never below the documented price of one image;
- it's refunded when Google declines, fails or sends something that isn't an image, or when the image can't be saved;
- the plan's allowance and the platform's daily limit apply as they do to any AI call.

**The margin holds.** Usage is priced at list cost against each plan's allowance, so a plan still keeps 57% (ADR 0103). On Free, an image is about 7% of the month's AI usage.

**The call:**
- `generateContent` with `responseModalities: ["IMAGE"]` and the aspect ratio;
- if that's refused for the model (a 404, or a 400 naming the response settings), the Interactions API once, the form Google's image guide shows;
- either answer is read the same way, and a safety block is a refusal that isn't counted;
- the key goes in a header, never in the URL.

**The image:**
- the bytes are checked to be a real PNG, JPEG, WebP or GIF;
- the extension follows what Google sent;
- a taken name gets a number;
- it's saved through the same path as an upload (ADR 0108), so the preview, publishing and export treat it the same.

**Disclosure:**
- the form says each image counts toward AI usage and carries Google's SynthID watermark;
- the Privacy Policy's Google entry names image generation, image descriptions and generated images.

## Consequences

- **The first live use is the check that matters.** Google's documentation now centres on the Interactions API, and its image response shape isn't fully documented. The client accepts both forms, and a failure is refunded and explained, never charged.
- **The agent can't generate images on its own yet.** People do it from the Files page. Letting the agent do it needs its own tool and policy.
