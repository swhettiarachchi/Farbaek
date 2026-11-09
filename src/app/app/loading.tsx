/**
 * Shown while a page in the app loads: the shape every page shares (a title, a
 * line of description and cards below), not a spinner and not one page's layout,
 * so nothing jumps into a different shape when the page arrives.
 */
export default function Loading() {
  const block = "rounded-sm bg-surface-sunken motion-safe:animate-pulse";
  return (
    <div className="grid gap-8" role="status">
      <div className="grid gap-3">
        <div className={`${block} h-9 w-56 max-w-full`} />
        <div className={`${block} h-4 w-[34rem] max-w-full`} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
          <div className={`${block} h-5 w-40 max-w-full`} />
          <div className={`${block} h-4 w-full`} />
          <div className={`${block} h-4 w-2/3`} />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
