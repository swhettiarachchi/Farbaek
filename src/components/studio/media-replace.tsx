"use client";

/**
 * Replacing an image or video in Studio (ADR 0156), from the Farbaek media
 * library, the project's own images, a photo uploaded here (ADR 0160), or an
 * https address; and switching a Farbaek Scenes box to another scene. It only
 * proposes the edit: the visual editor checks it, applies it to the draft and
 * shows it in review. An upload is saved to the project's files at once.
 */
import { CubeIcon, ImagesIcon, LinkSimpleIcon, SelectionIcon, SwapIcon, UploadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { COLOURWAYS, MEDIA_LIBRARY, SCENE_DESCRIPTIONS, SCENE_NAMES, mediaUrl, type LibraryItem } from "@/core/media/library";
import { PHOTO_SUBJECTS, photoFacts, photoUrl, subjectForText, type PhotoSubject } from "@/core/media/photos";
import { IMAGE_ACCEPT } from "@/core/workspace/images";

type Source = "photos" | "library" | "yours" | "link";

const SHAPES = { wide: { library: "still-16x9.webp", w: 1600, h: 900 }, tall: { library: "still-4x5.webp", w: 1080, h: 1350 } } as const;

const fieldClass = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The "Placeholder" mark: words, an icon and a dashed edge, never colour alone. */
export function PlaceholderChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-approval/60 px-2 py-0.5 text-xs text-ink-2">
      <SelectionIcon size={12} weight="bold" className="text-approval" aria-hidden /> Placeholder
    </span>
  );
}

export function MediaReplace({
  kind,
  current,
  placeholder,
  images,
  imagePaths,
  onReplace,
  onUpload,
  uploadDisabledReason = null,
  context = { description: "", page: "" },
}: {
  kind: "image" | "video";
  current: string | null;
  placeholder: boolean;
  /** Project images as data URLs, for thumbnails; missing when they're too large to preview. */
  images?: Record<string, string>;
  /** Every image in the project, by path. */
  imagePaths: readonly string[];
  onReplace: (edit: { src: string; poster?: string | null }) => void;
  /** Saves a photo to the project and puts it in this picture; resolves to an error message, or null when it worked. */
  onUpload?: (file: File) => Promise<string | null>;
  /** Why uploading isn't possible right now, such as a demo workspace. */
  uploadDisabledReason?: string | null;
  /** The site's own words around this picture (its description, the page's title), to open Real photos on the right subject. */
  context?: { description: string; page: string };
}) {
  const id = useId();
  const sources: { id: Source; label: string }[] = [
    ...(kind === "image" ? [{ id: "yours" as const, label: "Your images" }, { id: "photos" as const, label: "Real photos" }] : []),
    { id: "library", label: kind === "image" ? "3D art" : "Farbaek library" },
    { id: "link", label: "Link" },
  ];
  const [source, setSource] = useState<Source>(kind === "video" ? "library" : imagePaths.length > 0 ? "yours" : "photos");
  // Open on the photo being replaced: its subject and its shape, so a clothing photo is swapped for clothing.
  // A picture that isn't one of the library's opens on what the site's own words point to (its description,
  // then the page's title), so a bakery's fish bun opens on bread rather than laptops.
  const facts = photoFacts(current);
  const [shape, setShape] = useState<keyof typeof SHAPES>(facts?.tall ? "tall" : "wide");
  const [subject, setSubject] = useState<PhotoSubject>(facts?.subject ?? subjectForText(context.description) ?? subjectForText(context.page) ?? "workspace");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!onUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      setUploadError(await onUpload(file));
    } catch {
      setUploadError("The photo couldn't be uploaded. Check the connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  const pickLibrary = (item: LibraryItem) =>
    kind === "video" ? onReplace({ src: mediaUrl(item.id, "loop.mp4"), poster: mediaUrl(item.id, "still-16x9.webp") }) : onReplace({ src: mediaUrl(item.id, SHAPES[shape].library) });
  const shapePicker = (
    <div role="radiogroup" aria-label="Shape" className="inline-flex w-fit rounded-full border border-line bg-surface p-1">
      {(
        [
          ["wide", "Wide"],
          ["tall", "Tall"],
        ] as const
      ).map(([value, word]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={shape === value}
          onClick={() => setShape(value)}
          className={`min-h-11 rounded-full px-4 text-sm transition-colors duration-150 ${shape === value ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
        >
          {word}
        </button>
      ))}
    </div>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3 rounded-md border border-line bg-surface-raised/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-medium">
          <SwapIcon size={16} aria-hidden /> Replace {kind === "image" ? "image" : "video"}
        </h3>
        {placeholder ? <PlaceholderChip /> : null}
      </div>
      {current ? (
        <p className="truncate font-mono text-xs text-ink-3" title={current}>
          Now: {current}
        </p>
      ) : null}

      <div role="radiogroup" aria-label="Where it comes from" className="inline-flex w-full flex-wrap rounded-full border border-line bg-surface p-1">
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={source === s.id}
            onClick={() => setSource(s.id)}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-3 text-sm transition-colors duration-150 ${source === s.id ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {source === "photos" ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <label htmlFor={`${id}-subject`} className="text-xs text-ink-2">
                Subject
              </label>
              <select id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value as PhotoSubject)} className={fieldClass}>
                {(Object.entries(PHOTO_SUBJECTS) as [PhotoSubject, (typeof PHOTO_SUBJECTS)[PhotoSubject]][]).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.words.charAt(0).toUpperCase() + s.words.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {shapePicker}
          </div>
          <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label={`Real photos: ${PHOTO_SUBJECTS[subject].words}`}>
            {PHOTO_SUBJECTS[subject].ids.map((photo) => (
              <li key={photo}>
                <button
                  type="button"
                  onClick={() => onReplace({ src: photoUrl(photo, SHAPES[shape].w, SHAPES[shape].h) })}
                  className="grid w-full rounded-sm p-1 transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small thumbnail from the photo service, picked by hand */}
                  <img src={photoUrl(photo, 320, 200)} alt={`Photo ${photo}: ${PHOTO_SUBJECTS[subject].words}`} loading="lazy" width={160} height={100} className="aspect-[8/5] w-full rounded-sm object-cover ring-1 ring-line" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3">Real photographs from Unsplash, free to use, as a stand-in until you add your own. It stays marked in Studio until then.</p>
        </div>
      ) : null}

      {source === "library" ? (
        <div className="grid gap-2">
          {kind === "image" ? shapePicker : null}
          <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label="Farbaek library">
            {MEDIA_LIBRARY.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => pickLibrary(item)}
                  className="group grid w-full gap-1 rounded-sm p-1 text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* Same-origin thumbnails: the library is served by Farbaek itself. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size WebP the library already optimises */}
                  <img src={`/media/v1/${item.id}/still-16x9.webp`} alt="" loading="lazy" width={160} height={90} className="aspect-video w-full rounded-sm object-cover ring-1 ring-line" />
                  <span className="text-xs text-ink-2">
                    {item.scene}, {item.colourway}
                    <span className="sr-only">: {item.alt}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3">
            Made by Farbaek from its own 3D scenes, free to use on any site you build here.{" "}
            {kind === "video" ? "Each is a silent 10 second loop with a matching poster." : "Colours: " + Object.values(COLOURWAYS).map((c) => c.words).join("; ") + "."}
          </p>
        </div>
      ) : null}

      {source === "yours" && onUpload ? (
        <div className="grid gap-1.5">
          <label
            className={`relative flex min-h-11 items-center justify-center gap-2 rounded-full border border-dashed border-line-strong/70 bg-surface px-4 text-sm font-medium transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${uploadDisabledReason || uploading ? "cursor-not-allowed text-ink-3" : "cursor-pointer hover:border-accent/60"}`}
          >
            <UploadSimpleIcon size={16} aria-hidden /> {uploading ? "Uploading…" : "Upload a photo"}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={Boolean(uploadDisabledReason) || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Upload a photo for this picture"
            />
          </label>
          {uploadError ? (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-failed">
              <WarningCircleIcon size={14} weight="bold" className="mt-px shrink-0" aria-hidden /> {uploadError}
            </p>
          ) : (
            <p className="text-xs text-ink-3">
              {uploadDisabledReason ?? "PNG, JPEG, WebP, GIF or AVIF, up to 2 MB. It's added to the project's files now; the picture uses it once you save the draft."}
            </p>
          )}
        </div>
      ) : null}

      {source === "yours" ? (
        imagePaths.length ? (
          <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label="Your images">
            {imagePaths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onReplace({ src: path })}
                  className="grid w-full gap-1 rounded-sm p-1 text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {images?.[path] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the project's own image, inlined from its stored bytes */}
                      <img src={images[path]} alt="" width={160} height={90} className="aspect-video w-full rounded-sm object-cover ring-1 ring-line" />
                    </>
                  ) : (
                    <span className="flex aspect-video w-full items-center justify-center rounded-sm bg-surface ring-1 ring-line">
                      <ImagesIcon size={20} className="text-ink-3" aria-hidden />
                    </span>
                  )}
                  <span className="truncate font-mono text-xs text-ink-2">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">{onUpload ? "No images in the project yet. Upload one above." : "This project has no images yet."}</p>
        )
      ) : null}

      {source === "link" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-link`} className="text-sm font-medium">
            {kind === "image" ? "Image address" : "Video address"}
          </label>
          <input
            id={`${id}-link`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            className={`${fieldClass} font-mono`}
          />
          <p className="text-xs text-ink-3">{kind === "image" ? "An https address of an image." : "An https address of an mp4 or webm file, such as one you host yourself."}</p>
          <div>
            <button type="button" onClick={() => onReplace({ src: link })} disabled={!link.trim()} className={buttonClasses("secondary", "sm")}>
              <LinkSimpleIcon size={16} aria-hidden /> Use this address
            </button>
          </div>
        </div>
      ) : null}

      {kind === "image" && onUpload && source !== "yours" ? (
        <p className="text-xs text-ink-3">
          Have a photo of your own?{" "}
          <button type="button" onClick={() => setSource("yours")} className="min-h-11 font-medium text-accent underline underline-offset-2">
            Upload it
          </button>
        </p>
      ) : null}
    </section>
  );
}

export function ScenePicker({ current, onPick }: { current: string; onPick: (scene: string) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-2 rounded-md border border-line bg-surface-raised/50 p-3">
      <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-medium">
        <CubeIcon size={16} aria-hidden /> 3D scene
      </h3>
      <ul className="grid gap-1" role="radiogroup" aria-labelledby={`${id}-title`}>
        {SCENE_NAMES.map((s) => (
          <li key={s}>
            <button
              type="button"
              role="radio"
              aria-checked={current === s}
              onClick={() => onPick(s)}
              className={`grid min-h-11 w-full gap-0.5 rounded-sm px-3 py-2 text-left text-sm transition-colors duration-150 ${current === s ? "bg-accent/[0.08] text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface"}`}
            >
              <span className="font-medium capitalize">{s}</span>
              <span className="text-xs text-ink-3">{SCENE_DESCRIPTIONS[s]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">The scene takes its colours from the site. It shows a still under reduced motion and on low-power phones.</p>
    </section>
  );
}
