"use client";

/**
 * Farbaek AI's image and video studios (stage 201, ADR 0216): a full-screen workspace of their own, like Chat. The library on the
 * left (a drawer on phones), the stage in the middle where results land, and the dock below with the description and its
 * controls. Everything here does what it says: making calls the real models, Refine asks Farbaek AI, and a control that can't
 * work here says why.
 */
import {
  ArrowUpRightIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  HouseSimpleIcon,
  ImageSquareIcon,
  ListIcon,
  PaintBrushIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PenNibIcon,
  ShareNetworkIcon,
  StopIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClasses } from "@/components/ui/button";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { STUDIO_PROMPT_KEY } from "@/core/chat/protocol";
import { StatusGlyph } from "@/components/ui/status-badge";
import {
  IMAGE_DETAIL,
  IMAGE_FORMATS,
  IMAGE_SHAPES,
  IMAGE_STYLES,
  VIDEO_LENGTHS,
  VIDEO_RESOLUTIONS,
  VIDEO_SHAPES,
  VIDEO_STYLES,
  shapeOf,
  type ImageDetail,
  type ImageFormat,
  type ImageShape,
  type ImageStyle,
  type StudioItem,
  type VideoResolution,
  type VideoShape,
  type VideoStyle,
} from "@/core/studio/studio";
import { deleteStudioItem, refineStudioPrompt } from "@/app/app/studio/actions";
import { Dialog, IconButton, Menu, ToastProvider, useMenuClose, useToast } from "@/components/chat/primitives";
import { dayLabel, mediaUrl, runStudio, uploadPicture } from "./studio-client";

type Kind = "image" | "video";

interface Tile {
  state: "making" | "ready" | "failed";
  partial: string | null;
  item: StudioItem | null;
  error: string | null;
  aspect: string;
}

export interface StudioProps {
  kind: Kind;
  /** The library: pictures and uploads, or videos. */
  items: StudioItem[];
  /** For the video studio: the person's pictures, to start a video from. */
  pictures?: StudioItem[];
  /** Why making is off here, when it is. */
  disabledReason: string | null;
  /** A picture to start a video from, from ?still= on the address. */
  initialStill?: string | null;
  /** The library couldn't be read: it isn't shown as empty. */
  libraryUnread?: boolean;
}

const IMAGE_EXAMPLES: { text: string; style: ImageStyle; shape: ImageShape }[] = [
  { text: "A ceramic coffee cup on a sunlit oak table, morning light through a window", style: "product", shape: "4:5" },
  { text: "Portrait of an old fisherman mending a net on the harbour wall at golden hour", style: "portrait", shape: "4:5" },
  { text: "A quiet Scandinavian living room with a linen sofa and tall windows onto snow", style: "interior", shape: "3:2" },
  { text: "A bowl of ramen with steam rising, on a dark stone table", style: "food", shape: "1:1" },
  { text: "An illustrated map of a small coastal town with boats and a lighthouse", style: "illustration", shape: "3:2" },
  { text: "Wireless headphones floating above a white plinth, soft studio light", style: "render", shape: "1:1" },
];

const VIDEO_EXAMPLES: { text: string; style: VideoStyle; shape: VideoShape }[] = [
  { text: "A slow push-in on a lighthouse at dawn as waves roll against the rocks", style: "cinematic", shape: "16:9" },
  { text: "A barista pours latte art in a busy café, morning light", style: "documentary", shape: "9:16" },
  { text: "A glass perfume bottle turns slowly on a marble plinth", style: "product", shape: "9:16" },
  { text: "A paper boat sails down a rain-filled street past little houses", style: "animation", shape: "16:9" },
  { text: "A city skyline at night with trains crossing a bridge", style: "dither", shape: "16:9" },
  { text: "Two friends laugh over coffee by a rainy window", style: "conversation", shape: "16:9" },
];

const SPACES: { href: string; label: string; icon: Icon; kind: Kind | "chat" }[] = [
  { href: "/app/chat", label: "Chat", icon: ChatCircleTextIcon, kind: "chat" },
  { href: "/app/images", label: "Images", icon: ImageSquareIcon, kind: "image" },
  { href: "/app/video", label: "Video", icon: FilmSlateIcon, kind: "video" },
];

export function Studio(props: StudioProps) {
  return (
    <ToastProvider>
      <StudioInner {...props} />
    </ToastProvider>
  );
}

function StudioInner({ kind, items: initial, pictures = [], disabledReason, initialStill = null, libraryUnread = false }: StudioProps) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [drawer, setDrawer] = useState(false);
  const [viewer, setViewer] = useState<StudioItem | null>(null);
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);

  // The dock's state.
  const [text, setText] = useState("");
  // A request handed over from Chat (stage 202) waits in this browser and lands in the box once, ready to edit. Nothing is
  // made until the person presses the button.
  useEffect(() => {
    let kept: string | null = null;
    try {
      kept = window.localStorage.getItem(STUDIO_PROMPT_KEY);
      window.localStorage.removeItem(STUDIO_PROMPT_KEY);
    } catch {
      // Storage refused: the box starts empty.
    }
    const handed = kept?.trim().slice(0, 2_000);
    if (!handed) return;
    window.requestAnimationFrame(() => {
      setText(handed);
      prompt.current?.focus();
    });
  }, []);
  const [imageShape, setImageShape] = useState<ImageShape>("1:1");
  const [detail, setDetail] = useState<ImageDetail>("high");
  const [imageStyle, setImageStyle] = useState<ImageStyle>("photo");
  const [format, setFormat] = useState<ImageFormat>("webp");
  const [transparent, setTransparent] = useState(false);
  const [count, setCount] = useState(2);
  const [references, setReferences] = useState<StudioItem[]>([]);
  const [videoShape, setVideoShape] = useState<VideoShape>("16:9");
  const [length, setLength] = useState<(typeof VIDEO_LENGTHS)[number]>(8);
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [videoStyle, setVideoStyle] = useState<VideoStyle>("cinematic");
  const [still, setStill] = useState<StudioItem | null>(() => pictures.find((p) => p.id === initialStill) ?? null);
  const [refining, setRefining] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => controller.current?.abort(), []);

  const libraryPictures = kind === "image" ? items.filter((i) => i.status === "ready") : pictures.filter((i) => i.status === "ready");

  const focusPrompt = () => window.setTimeout(() => prompt.current?.focus(), 30);

  const make = async () => {
    if (running || disabledReason) return;
    const words = text.trim();
    if (words.length < 3) {
      toast({ text: kind === "image" ? "Describe the picture in a few words first." : "Describe the video in a few words first.", tone: "error" });
      focusPrompt();
      return;
    }
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRunning(true);
    setSeconds(null);
    const aspect = kind === "image" ? `${shapeOf(imageShape).width} / ${shapeOf(imageShape).height}` : videoShape === "16:9" ? "16 / 9" : "9 / 16";
    const n = kind === "image" ? count : 1;
    setTiles(Array.from({ length: n }, () => ({ state: "making", partial: null, item: null, error: null, aspect })));
    const body =
      kind === "image"
        ? { prompt: words, shape: imageShape, detail, style: imageStyle, format, transparent, count, references: references.map((r) => r.id) }
        : { prompt: words, shape: videoShape, seconds: length, resolution, style: videoStyle, still: still?.id ?? null };
    const setTile = (i: number, t: Partial<Tile>) => setTiles((all) => (all ? all.map((x, j) => (j === i ? { ...x, ...t } : x)) : all));
    const r = await runStudio(kind === "image" ? "/app/images/api/create" : "/app/video/api/create", body, (e) => {
      if (e.type === "partial") setTile(e.index, { partial: `data:${e.mime};base64,${e.data}` });
      else if (e.type === "item") {
        if (e.item.status === "ready") setTile(e.index, { state: "ready", item: e.item });
        setItems((list) => [e.item, ...list.filter((x) => x.id !== e.item.id)]);
      } else if (e.type === "failed") setTile(e.index, { state: "failed", error: e.error });
      else if (e.type === "progress") setSeconds(e.seconds);
      else if (e.type === "done" && e.error) toast({ text: e.error, tone: "error" });
    }, ctrl.signal);
    if (!r.ok) {
      setTiles(null);
      toast({ text: r.message, tone: "error" });
    } else if (!r.done && !ctrl.signal.aborted) {
      toast({ text: kind === "video" ? "The connection dropped. The video keeps rendering and will appear in your library." : "The connection dropped. The pictures keep being made and will appear in your library.", tone: "info" });
    }
    setTiles((all) => (all ? all.map((t) => (t.state === "making" && ctrl.signal.aborted ? { ...t, state: "failed", error: "Still being made: it will appear in your library." } : t)) : all));
    setRunning(false);
    controller.current = null;
  };

  const refine = async () => {
    if (refining || disabledReason) return;
    if (text.trim().length < 3) {
      toast({ text: "Write a few words first, then Farbaek AI can refine them.", tone: "error" });
      focusPrompt();
      return;
    }
    setRefining(true);
    const r = await refineStudioPrompt({ prompt: text, kind });
    setRefining(false);
    if (r.ok) {
      setText(r.value);
      toast({ text: "Refined by Farbaek AI. Read it, change anything, then make it.", tone: "info" });
      focusPrompt();
    } else toast({ text: r.message, tone: "error" });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of [...files].slice(0, 4)) {
      const r = await uploadPicture(file);
      if (r.ok) {
        setItems((list) => (kind === "image" ? [r.item, ...list] : list));
        if (kind === "image") setReferences((refs) => [...refs, r.item].slice(-4));
        else setStill(r.item);
      } else toast({ text: r.message, tone: "error" });
    }
    setUploading(false);
  };

  const remove = async (item: StudioItem) => {
    const r = await deleteStudioItem(item.id);
    if (!r.ok) return r.message;
    setItems((list) => list.filter((x) => x.id !== item.id));
    setReferences((refs) => refs.filter((x) => x.id !== item.id));
    if (still?.id === item.id) setStill(null);
    setTiles((all) => (all ? all.filter((t) => t.item?.id !== item.id) : all));
    setViewer(null);
    toast({ text: "Deleted.", tone: "info" });
    return null;
  };

  const reuse = (item: StudioItem) => {
    setText(item.prompt);
    const s = item.settings;
    if (kind === "image") {
      if (typeof s.shape === "string" && IMAGE_SHAPES.some((x) => x.id === s.shape)) setImageShape(s.shape as ImageShape);
      if (typeof s.detail === "string" && IMAGE_DETAIL.some((x) => x.id === s.detail)) setDetail(s.detail as ImageDetail);
      if (typeof s.style === "string" && IMAGE_STYLES.some((x) => x.id === s.style)) setImageStyle(s.style as ImageStyle);
    } else {
      if (s.shape === "16:9" || s.shape === "9:16") setVideoShape(s.shape);
      if (typeof s.resolution === "string" && VIDEO_RESOLUTIONS.some((x) => x.id === s.resolution)) setResolution(s.resolution as VideoResolution);
      if (typeof s.style === "string" && VIDEO_STYLES.some((x) => x.id === s.style)) setVideoStyle(s.style as VideoStyle);
    }
    setViewer(null);
    focusPrompt();
  };

  const library = (inDrawer: boolean) => (
    <Library
      kind={kind}
      items={items}
      unread={libraryUnread}
      onOpen={(item) => {
        setViewer(item);
        if (inDrawer) setDrawer(false);
      }}
      onClose={inDrawer ? () => setDrawer(false) : undefined}
    />
  );

  const title = kind === "image" ? "Image studio" : "Video studio";

  return (
    // On wide screens the studio is the same window on the same stage as Chat and the rest of the app (ADR 0230); the
    // light behind it travels while a picture or a film is being made.
    <div className="chat-root relative h-[100dvh] overflow-hidden bg-canvas text-ink">
      <a href="#studio-prompt" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to the description
      </a>
      <div className="relative flex h-full overflow-hidden bg-canvas">
      <aside aria-label="Your library" className="hidden h-full w-[18.5rem] shrink-0 border-r border-line bg-canvas-2 lg:flex">
        {library(false)}
      </aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        {library(true)}
      </Drawer>

      <main id="main" className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-4">
          <span className="lg:hidden">
            <IconButton label="Your library" icon={ListIcon} onClick={() => setDrawer(true)} />
          </span>
          <h1 className={`sr-only ${FOCUSED_TITLE}`}>{title}</h1>
          <p aria-hidden className="min-w-0 truncate text-title-4 font-medium tracking-[-0.02em]">{title}</p>
          <nav aria-label="Farbaek AI" className="ml-auto flex items-center gap-0.5 rounded-full bg-canvas-2 p-1 ring-1 ring-line">
            {SPACES.map((s) => {
              const on = s.kind === kind;
              const SpaceIcon = s.icon;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-200 pointer-coarse:h-11 ${on ? "bg-surface text-ink shadow-e1 ring-1 ring-line" : "text-ink-2 hover:text-ink"}`}
                >
                  <SpaceIcon size={16} weight={on ? "fill" : "bold"} aria-hidden className={on ? "text-accent" : ""} />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sr-only sm:hidden">{s.label}</span>
                </Link>
              );
            })}
          </nav>
          <Link href="/app" aria-label="Farbaek home" title="Farbaek home" className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink">
            <HouseSimpleIcon size={16} weight="bold" aria-hidden />
          </Link>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tiles ? (
            <Stage kind={kind} tiles={tiles} running={running} seconds={seconds} onOpen={setViewer} />
          ) : (
            <Welcome
              kind={kind}
              onExample={(i) => {
                if (kind === "image") {
                  const ex = IMAGE_EXAMPLES[i]!;
                  setText(ex.text);
                  setImageStyle(ex.style);
                  setImageShape(ex.shape);
                } else {
                  const ex = VIDEO_EXAMPLES[i]!;
                  setText(ex.text);
                  setVideoStyle(ex.style);
                  setVideoShape(ex.shape);
                }
                focusPrompt();
              }}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-canvas/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-canvas sm:px-6">
          <div className="mx-auto max-w-3xl">
            {disabledReason ? (
              <p className="mb-2 flex items-center gap-2 text-sm text-ink-2">
                <WarningCircleIcon size={16} weight="fill" aria-hidden className="shrink-0 text-caution" />
                {disabledReason}
              </p>
            ) : null}
            {kind === "image" && references.length ? (
              <ul aria-label="Pictures to work from" className="mb-2 flex flex-wrap gap-2">
                {references.map((r) => (
                  <li key={r.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek */}
                    <img src={mediaUrl(r.id)} alt={`Working from: ${r.prompt.slice(0, 60)}`} className="size-14 rounded-sm object-cover ring-1 ring-line" />
                    <button
                      type="button"
                      aria-label="Stop working from this picture"
                      onClick={() => setReferences((refs) => refs.filter((x) => x.id !== r.id))}
                      className="tap absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e2 ring-1 ring-line hover:text-ink"
                    >
                      <XIcon size={14} weight="bold" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {kind === "video" && still ? (
              <div className="mb-2 flex items-center gap-3 text-sm text-ink-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek */}
                <img src={mediaUrl(still.id)} alt="" className="size-12 rounded-sm object-cover ring-1 ring-line" />
                <span className="min-w-0 flex-1 truncate">Starting from your picture</span>
                <button type="button" onClick={() => setStill(null)} className="tap min-h-10 rounded-full px-3 font-medium text-ink-2 hover:bg-surface-raised hover:text-ink">
                  Remove
                </button>
              </div>
            ) : null}

            <div className="rounded-[1.5rem] border border-line bg-surface p-2 shadow-e2 focus-within:ring-2 focus-within:ring-accent/40">
              <label htmlFor="studio-prompt" className="sr-only">
                {kind === "image" ? "Describe the picture" : "Describe the video"}
              </label>
              <textarea
                id="studio-prompt"
                ref={prompt}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void make();
                  }
                }}
                rows={2}
                maxLength={kind === "image" ? 3_000 : 2_000}
                placeholder={kind === "image" ? (references.length ? "Describe the change, or what to make from these pictures" : "Describe the picture you want") : still ? "Describe how the picture should move" : "Describe the video you want"}
                className="block max-h-48 min-h-14 w-full resize-none bg-transparent px-3 py-2 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 lg:text-sm"
              />
              <div className="flex flex-wrap items-center gap-1">
                <Menu
                  label={kind === "image" ? "Pictures to work from" : "A picture to start from"}
                  align="start"
                  trigger={({ ref, open, toggle, id }) => (
                    <button
                      ref={ref}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={open}
                      aria-controls={open ? id : undefined}
                      onClick={toggle}
                      aria-label={kind === "image" ? "Add pictures to work from" : "Start from a picture"}
                      title={kind === "image" ? "Add pictures to work from" : "Start from a picture"}
                      className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink pointer-coarse:size-11"
                    >
                      <PaperclipIcon size={16} weight="bold" aria-hidden />
                    </button>
                  )}
                >
                  <PicturePicker
                    kind={kind}
                    pictures={libraryPictures}
                    uploading={uploading}
                    chosen={kind === "image" ? references.map((r) => r.id) : still ? [still.id] : []}
                    onPick={(p) => (kind === "image" ? setReferences((refs) => (refs.some((r) => r.id === p.id) ? refs.filter((r) => r.id !== p.id) : [...refs, p].slice(-4))) : setStill(p))}
                    onUpload={upload}
                  />
                </Menu>
                {/* On a phone the choices are one row that scrolls sideways, above attach, Refine and Make; from tablets up they sit in line. */}
                <div className="order-first flex min-w-0 basis-full items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:order-none sm:basis-auto sm:flex-wrap sm:overflow-visible">
                {kind === "image" ? (
                  <>
                    <Choice label="Shape" value={imageShape} options={IMAGE_SHAPES.map((s) => ({ id: s.id, label: s.label, about: s.id }))} onChange={(v) => setImageShape(v as ImageShape)} />
                    <Choice label="Style" value={imageStyle} options={IMAGE_STYLES.map((s) => ({ id: s.id, label: s.label }))} onChange={(v) => setImageStyle(v as ImageStyle)} />
                    <Choice label="Detail" value={detail} options={IMAGE_DETAIL.map((d) => ({ id: d.id, label: d.label, about: d.about }))} onChange={(v) => setDetail(v as ImageDetail)} />
                    <Choice label="How many" value={String(count)} options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: n === 1 ? "1 picture" : `${n} pictures` }))} onChange={(v) => setCount(Number(v))} />
                    <Choice
                      label="File"
                      value={`${format}${transparent ? "+t" : ""}`}
                      options={[...IMAGE_FORMATS.map((f) => ({ id: f, label: f.toUpperCase(), about: f === "webp" ? "Small, sharp, works everywhere" : f === "png" ? "Lossless" : "Best for photos to share" })), { id: "png+t", label: "PNG, transparent", about: "No background, for logos and cut-outs" }]}
                      onChange={(v) => {
                        setTransparent(v.endsWith("+t"));
                        setFormat(v.replace("+t", "") as ImageFormat);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Choice label="Shape" value={videoShape} options={VIDEO_SHAPES.map((s) => ({ id: s.id, label: s.label, about: s.id }))} onChange={(v) => setVideoShape(v as VideoShape)} />
                    <Choice label="Length" value={String(length)} options={VIDEO_LENGTHS.map((l) => ({ id: String(l), label: `${l} seconds` }))} onChange={(v) => setLength(Number(v) as (typeof VIDEO_LENGTHS)[number])} />
                    <Choice label="Quality" value={resolution} options={VIDEO_RESOLUTIONS.map((r) => ({ id: r.id, label: r.label, about: `${r.id}, ${r.about.toLowerCase()}` }))} onChange={(v) => setResolution(v as VideoResolution)} />
                    <Choice label="Style" value={videoStyle} options={VIDEO_STYLES.map((s) => ({ id: s.id, label: s.label }))} onChange={(v) => setVideoStyle(v as VideoStyle)} />
                  </>
                )}
                </div>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void refine()}
                    disabled={refining || Boolean(disabledReason)}
                    title="Farbaek AI rewrites your words as a professional brief, for you to read before making anything."
                    className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2 hover:bg-surface-raised hover:text-ink disabled:opacity-55 pointer-coarse:min-h-11"
                  >
                    <PenNibIcon size={16} weight="bold" aria-hidden />
                    {refining ? "Refining" : "Refine"}
                  </button>
                  {running ? (
                    <button
                      type="button"
                      onClick={() => controller.current?.abort()}
                      className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-raised px-4 text-sm font-medium text-ink ring-1 ring-line pointer-coarse:min-h-11"
                    >
                      <StopIcon size={16} weight="fill" aria-hidden />
                      Stop watching
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void make()}
                      disabled={Boolean(disabledReason)}
                      title={disabledReason ?? undefined}
                      className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-55 pointer-coarse:min-h-11"
                    >
                      {kind === "image" ? <PaintBrushIcon size={16} weight="bold" aria-hidden /> : <FilmSlateIcon size={16} weight="bold" aria-hidden />}
                      {kind === "image" ? "Make" : "Make video"}
                    </button>
                  )}
                </span>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-ink-3">
              Made by Farbaek AI and marked as AI-made. {kind === "video" ? "Videos take a minute or two, and keep rendering if you leave." : "Pictures use your plan's AI usage."}
            </p>
          </div>
        </div>
      </main>
      </div>

      <Viewer
        kind={kind}
        item={viewer}
        onClose={() => setViewer(null)}
        onRemove={remove}
        onReuse={reuse}
        onReference={(item) => {
          setReferences((refs) => [...refs.filter((r) => r.id !== item.id), item].slice(-4));
          setText("");
          setViewer(null);
          focusPrompt();
        }}
      />
    </div>
  );
}

/** One control in the dock: a pill naming the current choice, opening a menu of the others. */
function Choice({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string; about?: string }[]; onChange: (v: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0]!;
  return (
    <Menu
      label={label}
      align="start"
      trigger={({ ref, open, toggle, id }) => (
        <button
          ref={ref}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
          className="inline-flex min-h-10 max-w-[11rem] shrink-0 items-center gap-1 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-raised hover:text-ink pointer-coarse:min-h-11"
        >
          <span className="sr-only">{label}: </span>
          <span className="truncate font-medium text-ink">{current.label}</span>
        </button>
      )}
    >
      <ChoiceList label={label} options={options} value={value} onChange={onChange} />
    </Menu>
  );
}

function ChoiceList({ label, options, value, onChange }: { label: string; options: { id: string; label: string; about?: string }[]; value: string; onChange: (v: string) => void }) {
  const close = useMenuClose();
  return (
    <div className="grid gap-0.5">
      <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-ink-3">{label}</p>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={o.id === value}
          onClick={() => {
            onChange(o.id);
            close();
          }}
          className="flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left outline-none hover:bg-surface-raised focus-visible:bg-surface-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{o.label}</span>
            {o.about ? <span className="block text-xs leading-snug text-ink-3">{o.about}</span> : null}
          </span>
          {o.id === value ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}

function PicturePicker({ kind, pictures, uploading, chosen, onPick, onUpload }: { kind: Kind; pictures: StudioItem[]; uploading: boolean; chosen: string[]; onPick: (p: StudioItem) => void; onUpload: (f: FileList | null) => void }) {
  const close = useMenuClose();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="grid w-[min(20rem,80vw)] gap-2 p-1">
      <p className="px-2 pt-1 text-xs font-medium text-ink-3">{kind === "image" ? "Work from up to four pictures: to edit, or for subject and style." : "Start the video from one picture."}</p>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple={kind === "image"} className="sr-only" tabIndex={-1} onChange={(e) => (onUpload(e.target.files), (e.target.value = ""), close())} />
      <button
        type="button"
        onClick={() => file.current?.click()}
        disabled={uploading}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-line px-3 text-sm font-medium text-ink hover:bg-surface-raised disabled:opacity-55"
      >
        <PaperclipIcon size={16} weight="bold" aria-hidden />
        {uploading ? "Uploading" : "Upload a picture"}
      </button>
      {pictures.length ? (
        <ul className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto p-1">
          {pictures.slice(0, 48).map((p) => {
            const on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  aria-label={p.prompt.slice(0, 80) || "A picture"}
                  onClick={() => {
                    onPick(p);
                    if (kind === "video") close();
                  }}
                  className={`relative block aspect-square w-full overflow-hidden rounded-sm ring-offset-2 ring-offset-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek */}
                  <img src={mediaUrl(p.id)} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 pb-1 text-sm text-ink-2">Pictures you make or upload appear here.</p>
      )}
    </div>
  );
}

function Welcome({ kind, onExample }: { kind: Kind; onExample: (i: number) => void }) {
  const examples = kind === "image" ? IMAGE_EXAMPLES : VIDEO_EXAMPLES;
  const styles = kind === "image" ? IMAGE_STYLES : VIDEO_STYLES;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center sm:py-14">
      <BrandLogo height={72} className="h-16 w-auto sm:h-[4.5rem]" />
      <h2 className="mt-5 text-balance text-2xl font-medium leading-tight tracking-[-0.035em] sm:text-[2rem]">{kind === "image" ? "What should we make?" : "What should happen on screen?"}</h2>
      <p className="mt-2 max-w-[34rem] text-body leading-relaxed text-ink-2">
        {kind === "image"
          ? "Describe a picture, pick a style and shape, and Farbaek AI makes it with studio light and finish. Work from your own pictures to edit them or keep a subject."
          : "Describe a scene, or start from one of your pictures. Farbaek AI films it with sound, in wide or vertical, up to ten seconds."}
      </p>
      <ul className="mt-7 grid w-full gap-2 text-left sm:grid-cols-2">
        {examples.map((ex, i) => (
          <li key={ex.text}>
            <button
              type="button"
              onClick={() => onExample(i)}
              className="group flex h-full w-full flex-col gap-1 rounded-md border border-line bg-surface p-4 text-left shadow-e1 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-e2"
            >
              <span className="text-xs font-medium text-ink-3">{styles.find((s) => s.id === ex.style)?.label}</span>
              <span className="text-sm leading-relaxed text-ink">{ex.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stage({ kind, tiles, running, seconds, onOpen }: { kind: Kind; tiles: Tile[]; running: boolean; seconds: number | null; onOpen: (i: StudioItem) => void }) {
  const cols = tiles.length === 1 ? "max-w-2xl grid-cols-1" : tiles.length === 2 ? "max-w-4xl sm:grid-cols-2" : "max-w-5xl sm:grid-cols-2";
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      <ul className={`mx-auto grid gap-4 ${cols}`} aria-live="polite" aria-busy={running || undefined}>
        {tiles.map((t, i) => (
          <li key={i} className="overflow-hidden rounded-md border border-line bg-surface shadow-e2">
            <div className="relative bg-canvas-2" style={{ aspectRatio: t.aspect }}>
              {t.state === "ready" && t.item ? (
                <button type="button" onClick={() => onOpen(t.item!)} className="block size-full" aria-label="Open this result">
                  {kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek
                    <img src={mediaUrl(t.item.id)} alt={t.item.prompt.slice(0, 120)} className="size-full object-cover motion-safe:animate-[chat-pop_240ms_cubic-bezier(0.16,1,0.3,1)_both]" />
                  ) : (
                    <video src={mediaUrl(t.item.id)} controls playsInline className="size-full bg-ink object-contain" />
                  )}
                </button>
              ) : t.state === "failed" ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <WarningCircleIcon size={20} weight="fill" aria-hidden className="text-failed" />
                  <p className="max-w-[28ch] text-sm leading-relaxed text-ink-2">{t.error ?? "This one wasn't made."}</p>
                </div>
              ) : (
                <>
                  {t.partial ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a first look, still being made
                    <img src={t.partial} alt="" className="size-full object-cover opacity-80" />
                  ) : (
                    <div aria-hidden className="studio-sheen absolute inset-0" />
                  )}
                  <p className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-surface/85 px-4 py-2.5 text-sm text-ink-2 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-surface">
                    <StatusGlyph status="working" size={16} className="shrink-0 motion-safe:animate-spin" />
                    {kind === "image" ? (t.partial ? "Adding detail" : "Making the picture") : seconds !== null ? `Rendering, ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Starting the render"}
                  </p>
                </>
              )}
            </div>
            {t.item ? <p className="truncate px-4 py-2.5 text-sm text-ink-2">{t.item.prompt}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Library({ kind, items, unread = false, onOpen, onClose }: { kind: Kind; items: StudioItem[]; unread?: boolean; onOpen: (i: StudioItem) => void; onClose?: () => void }) {
  const [filter, setFilter] = useState<"all" | "made" | "upload">("all");
  const shown = items.filter((i) => (filter === "all" ? true : filter === "made" ? i.kind !== "upload" : i.kind === "upload"));
  const groups: { label: string; items: StudioItem[] }[] = [];
  for (const item of shown) {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Link href="/app" className="flex min-h-11 items-center gap-2 rounded-full pr-2" aria-label="Farbaek home">
          <BrandLogo height={30} />
          <span className="text-body font-semibold tracking-[-0.02em]">Farbaek AI</span>
        </Link>
        {onClose ? (
          <span className="ml-auto">
            <IconButton label="Close the library" icon={XIcon} onClick={onClose} />
          </span>
        ) : null}
      </div>
      <div className="px-3 pb-2">
        <p className="px-1 text-sm font-medium text-ink">Your library</p>
        {kind === "image" ? (
          <div role="radiogroup" aria-label="Show" className="mt-2 grid grid-cols-3 rounded-full bg-surface p-0.5 ring-1 ring-line">
            {(["all", "made", "upload"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-full text-sm font-medium pointer-coarse:min-h-11 ${filter === f ? "bg-canvas-2 text-ink ring-1 ring-line" : "text-ink-2 hover:text-ink"}`}
              >
                {f === "all" ? "All" : f === "made" ? "Made" : "Uploads"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 ? (
          <p className="px-1 pt-4 text-sm leading-relaxed text-ink-2">
            {unread ? "Your library couldn't be read just now. Reload the page in a moment." : kind === "image" ? "Pictures you make and upload are kept here, private to you." : "Videos you make are kept here, private to you."}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="pt-3">
              <h2 className="px-1 pb-2 text-xs font-medium text-ink-3">{g.label}</h2>
              <ul className="grid grid-cols-3 gap-1.5">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <LibraryThumb item={item} onOpen={() => onOpen(item)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function LibraryThumb({ item, onOpen }: { item: StudioItem; onOpen: () => void }) {
  const name = item.prompt.slice(0, 80) || (item.kind === "video" ? "A video" : "A picture");
  if (item.status !== "ready") {
    return (
      <div title={item.status === "failed" ? (item.error ?? "Failed") : "Rendering"} className="flex aspect-square items-center justify-center rounded-sm bg-surface p-1 text-center ring-1 ring-line">
        {item.status === "failed" ? <WarningCircleIcon size={16} weight="fill" aria-label="Didn't render" className="text-failed" /> : <span role="img" aria-label="Rendering"><StatusGlyph status="working" size={16} className="motion-safe:animate-spin" /></span>}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label={`Open: ${name}`} className="relative block aspect-square w-full overflow-hidden rounded-sm bg-surface ring-1 ring-line transition-transform duration-200 hover:scale-[1.02]">
      {item.kind === "video" ? (
        <video src={`${mediaUrl(item.id)}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek
        <img src={mediaUrl(item.id)} alt="" loading="lazy" className="size-full object-cover" />
      )}
      {item.kind === "upload" ? <span className="absolute bottom-1 left-1 rounded-full bg-surface/90 px-1.5 text-xs font-medium text-ink-2">Upload</span> : null}
    </button>
  );
}

function Viewer({ kind, item, onClose, onRemove, onReuse, onReference }: { kind: Kind; item: StudioItem | null; onClose: () => void; onRemove: (i: StudioItem) => Promise<string | null>; onReuse: (i: StudioItem) => void; onReference: (i: StudioItem) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = useSyncExternalStore(noSubscribe, canShareFiles, () => false);
  const toast = useToast();
  const open = item !== null;
  const close = () => {
    setConfirm(false);
    setError(null);
    onClose();
  };
  const share = async () => {
    if (!item) return;
    try {
      const blob = await fetch(mediaUrl(item.id)).then((r) => r.blob());
      const file = new File([blob], `farbaek-ai-${item.id.slice(0, 8)}.${blob.type.split("/")[1] ?? "bin"}`, { type: blob.type });
      await navigator.share({ files: [file], text: "Made with Farbaek AI (AI-generated)." });
    } catch {
      // Closed the share sheet, or the browser refused: nothing to undo.
    }
  };
  const settings = item ? describe(item) : "";
  return (
    <Dialog open={open} onClose={close} title={item ? (item.kind === "upload" ? "Your upload" : kind === "image" ? "Picture" : "Video") : ""} description={settings} wide>
      {item ? (
        <div className="grid gap-4">
          <div className="overflow-hidden rounded-md bg-canvas-2 ring-1 ring-line">
            {item.kind === "video" ? (
              <video src={mediaUrl(item.id)} controls playsInline autoPlay muted className="max-h-[60dvh] w-full bg-ink object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- the person's own picture, served by Farbaek
              <img src={mediaUrl(item.id)} alt={item.prompt.slice(0, 160)} className="max-h-[60dvh] w-full object-contain" />
            )}
          </div>
          {item.kind !== "upload" ? <p className="text-sm leading-relaxed text-ink-2">{item.prompt}</p> : null}
          <p className="text-xs text-ink-3">{item.kind === "upload" ? "Uploaded by you." : "Made with Farbaek AI. AI-generated."}</p>
          <div className="flex flex-wrap gap-2">
            <a href={mediaUrl(item.id, true)} download className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-e1 hover:bg-primary-hover pointer-coarse:min-h-11">
              <DownloadSimpleIcon size={16} weight="bold" aria-hidden />
              Download
            </a>
            {canShare ? <Action icon={ShareNetworkIcon} label="Share" onClick={() => void share()} /> : null}
            {kind === "image" ? (
              <>
                <Action icon={PencilSimpleIcon} label="Edit or work from it" onClick={() => onReference(item)} />
                {item.kind !== "upload" ? <Action icon={PaintBrushIcon} label="Make it again" onClick={() => onReuse(item)} /> : null}
                <Link href={`/app/video?still=${item.id}`} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-surface-raised pointer-coarse:min-h-11">
                  <FilmSlateIcon size={16} weight="bold" aria-hidden />
                  Make a video from it
                  <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                </Link>
              </>
            ) : (
              <Action icon={FilmSlateIcon} label="Make it again" onClick={() => onReuse(item)} />
            )}
            {confirm ? (
              <button
                type="button"
                onClick={async () => {
                  const r = await onRemove(item);
                  if (r) setError(r);
                  else {
                    setConfirm(false);
                    toast({ text: "Deleted for good.", tone: "info" });
                  }
                }}
                className={buttonClasses("danger", "sm", "tap")}
              >
                <TrashIcon size={16} weight="bold" aria-hidden />
                Delete for good
              </button>
            ) : (
              <Action icon={TrashIcon} label="Delete" onClick={() => setConfirm(true)} />
            )}
          </div>
          {confirm ? <p className="text-sm text-ink-2">It can&apos;t be brought back. Press Delete for good to go ahead.</p> : null}
          {error ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <WarningCircleIcon size={16} weight="fill" className="text-failed" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function Action({ icon: ActionIcon, label, onClick }: { icon: Icon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-surface-raised pointer-coarse:min-h-11">
      <ActionIcon size={16} weight="bold" aria-hidden />
      {label}
    </button>
  );
}

const noSubscribe = () => () => {};

/** Whether this browser can share a file (phones, mostly): a Share button shows only where it works. */
function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** The settings it was made with, in a sentence. */
function describe(item: StudioItem): string {
  const s = item.settings;
  const when = new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (item.kind === "upload") return `Uploaded ${when}.`;
  if (item.kind === "video") {
    const style = VIDEO_STYLES.find((x) => x.id === s.style)?.label;
    const res = VIDEO_RESOLUTIONS.find((x) => x.id === s.resolution);
    return `${s.shape === "9:16" ? "Vertical" : "Wide"}, ${typeof s.seconds === "number" ? `${s.seconds} seconds` : "a short clip"}${res ? `, ${res.label.toLowerCase()} quality` : ""}${style && s.style !== "none" ? `, ${style.toLowerCase()} style` : ""}. Made ${when}.`;
  }
  const shape = IMAGE_SHAPES.find((x) => x.id === s.shape)?.label;
  const detail = IMAGE_DETAIL.find((x) => x.id === s.detail)?.label;
  const style = IMAGE_STYLES.find((x) => x.id === s.style)?.label;
  return `${shape ?? "Picture"}${detail ? `, ${detail.toLowerCase()} detail` : ""}${style && s.style !== "none" ? `, ${style.toLowerCase()} style` : ""}. Made ${when}.`;
}

/** The library as a drawer on phones and tablets. */
function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Your library"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-[100dvh] max-h-none w-[min(86vw,20rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-ink/35 lg:hidden open:motion-safe:animate-[chat-drawer-in_240ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="h-full border-r border-line bg-canvas-2 shadow-e3">{open ? children : null}</div>
    </dialog>
  );
}
