import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { SPACES } from "@/components/site/spaces";

/** The doors on Home that aren't the build box (ADR 0214): Chat, Survey Studio and approvals, each with what it's for. */
const DOORS = [
  { space: "chat", label: "Chat", about: "Ask, write and code with AI, with your own files." },
  { space: "survey", label: "Survey Studio", about: "Survey plans from field data, drawn to scale." },
  { space: "proof", label: "Approvals", about: "Changes waiting for your yes or no, each with its proof." },
] as const;

export function SpaceDoors() {
  return (
    <nav aria-label="Spaces">
      <ul className="grid gap-3 sm:grid-cols-3">
        {DOORS.map((door) => {
          const space = SPACES.find((s) => s.id === door.space)!;
          const DoorIcon = space.icon;
          return (
            <li key={door.space}>
              <Link
                href={space.app}
                className="group flex h-full items-center gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-e2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line transition-colors duration-200 group-hover:text-accent">
                  <DoorIcon size={20} aria-hidden />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body font-medium text-ink">{door.label}</span>
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
