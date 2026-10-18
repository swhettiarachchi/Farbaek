/** Shown while a page in the app loads: the shape of a page, not a spinner. */
export default function Loading() {
  const block = "rounded-sm bg-surface-sunken motion-safe:animate-pulse";
  return (
    <div className="grid gap-8" role="status">
      <div className="grid gap-3">
        <div className={`${block} h-9 w-56 max-w-full`} />
        <div className={`${block} h-4 w-[34rem] max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-3 rounded-md border border-line bg-surface p-5 shadow-e1">
            <div className={`${block} h-3 w-20`} />
            <div className={`${block} h-7 w-12`} />
            <div className={`${block} h-3 w-full`} />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
            <div className={`${block} h-5 w-40`} />
            {[0, 1, 2].map((j) => (
              <div key={j} className={`${block} h-10 w-full`} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
