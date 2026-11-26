"use client";

/**
 * The images the AI made (stage 199): a grid that keeps each picture's shape, newest first. A picture opens full size, downloads,
 * or goes back to the chat it was made in.
 */
import { ChatCircleIcon, DownloadSimpleIcon, ImageSquareIcon, ListIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import type { GalleryImage } from "@/server/chat/store";
import { buttonClasses } from "@/components/ui/button";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { useChat } from "./chat-shell";
import { ImageViewer } from "./dialogs";
import { IconButton } from "./primitives";

export function ImageGallery({ images, demo }: { images: GalleryImage[]; demo: boolean }) {
  const chat = useChat();
  const [open, setOpen] = useState<GalleryImage | null>(null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3 lg:hidden">
        <IconButton label="Open your chats" icon={ListIcon} size={20} onClick={chat.openDrawer} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-2 sm:px-6 lg:pt-10">
          <h1 className={FOCUSED_TITLE}>Images</h1>
          <p className="mt-2 max-w-xl text-body leading-relaxed text-ink-2">Pictures the AI made in your chats in this workspace. Each one stays with its chat; deleting the chat deletes them.</p>
          {images.length === 0 ? (
            <div className="mt-10 flex flex-col items-start gap-4 rounded-lg border border-dashed border-line-2 p-5 sm:p-8">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-raised text-ink-2">
                <ImageSquareIcon size={24} weight="bold" aria-hidden />
              </span>
              <div>
                <p className="text-base font-medium text-ink">{demo ? "The demo workspace has no images" : "No images yet"}</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-2">
                  {demo ? "In a workspace of your own, switch on Create an image below the message box and describe what you want." : "Switch on Create an image below the message box, describe what you want, and it shows here."}
                </p>
              </div>
              <Link href="/app/chat" className={buttonClasses("primary", "sm")}>
                <ImageSquareIcon size={16} weight="bold" aria-hidden /> Create an image
              </Link>
            </div>
          ) : (
            <ul className="mt-8 columns-2 gap-3 sm:columns-3 lg:columns-4">
              {images.map((img) => {
                const src = `/app/chat/api/file/${img.id}`;
                return (
                  <li key={img.id} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-md border border-line bg-surface-sunken">
                    <button type="button" onClick={() => setOpen(img)} className="block w-full" aria-label={img.prompt ? `Open: ${img.prompt.slice(0, 80)}` : "Open the image"}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a private image from Farbaek's own route */}
                      <img src={src} alt={img.prompt ?? "Image made by Farbaek"} width={img.width ?? undefined} height={img.height ?? undefined} loading="lazy" className="block h-auto w-full" />
                    </button>
                    <div className="flex items-center gap-1 border-t border-line bg-surface px-2 py-1.5">
                      <p className="min-w-0 flex-1 truncate px-1 text-xs text-ink-3" title={img.prompt ?? undefined}>
                        {img.prompt ?? img.name}
                      </p>
                      {img.conversationId ? (
                        <Link href={`/app/chat/${img.conversationId}`} aria-label="Open its chat" title="Open its chat" className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink">
                          <ChatCircleIcon size={16} weight="bold" aria-hidden />
                        </Link>
                      ) : null}
                      <a href={`${src}?download`} download={img.name} aria-label="Download" title="Download" className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink">
                        <DownloadSimpleIcon size={16} weight="bold" aria-hidden />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <ImageViewer image={open ? { src: `/app/chat/api/file/${open.id}`, name: open.name, prompt: open.prompt, width: open.width, height: open.height } : null} onClose={() => setOpen(null)} />
    </div>
  );
}
