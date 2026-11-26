import { ArrowRightIcon, ChatCircleTextIcon, ImageSquareIcon, VideoCameraIcon } from "@/components/icons";
import Link from "next/link";
import { space } from "@/components/site/spaces";

/**
 * The doors on Home beside the build box (ADR 0216): Farbaek AI's Chat and its two studios, each with what it's for. Each door
 * carries the icon its row has in the app's navigation (ADR 0289), drawn in the app's own hand; the public site keeps its own.
 */
const DOORS = [
  { space: "chat", icon: ChatCircleTextIcon, about: "Ask, write and code with Farbaek AI." },
  { space: "images", icon: ImageSquareIcon, about: "Make and edit pictures with studio finish." },
  { space: "video", icon: VideoCameraIcon, about: "Make short films with sound." },
] as const;

export function SpaceDoors() {
  return (
    <nav aria-label="Farbaek AI">
      <ul className="grid gap-3 sm:grid-cols-3">
        {DOORS.map((door) => {
          const s = space(door.space);
          const DoorIcon = door.icon;
          return (
            <li key={door.space}>
              <Link
                href={s.app}
                className="group flex h-full items-center gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-e2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line transition-colors duration-200 group-hover:text-accent">
                  <DoorIcon size={20} weight="bold" aria-hidden />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body font-medium text-ink">{s.name}</span>
                  <span className="text-sm leading-snug text-ink-2">{door.about}</span>
                </span>
                <ArrowRightIcon size={16} weight="bold" aria-hidden className="shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
