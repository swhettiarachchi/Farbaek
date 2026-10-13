import type { ReactNode } from "react";

export function SectionHeading({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-[44rem]">
      <h2 id={id} className="text-balance text-3xl font-medium leading-[1.12] tracking-[-0.02em] sm:text-[2.5rem]">
        {title}
      </h2>
      {children ? <p className="mt-4 text-lg leading-relaxed text-ink-2">{children}</p> : null}
    </div>
  );
}
