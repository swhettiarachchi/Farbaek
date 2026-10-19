import { buildStaticSrcdoc } from "@/core/workspace/static-preview";

/**
 * A live thumbnail of a template's home page: the real files, drawn at
 * desktop width and scaled down. The frame runs no scripts (`sandbox=""`)
 * and its CSP blocks network requests, so it's only a picture.
 */
export function TemplateThumb({ files, title }: { files: readonly { path: string; content: string }[]; title: string }) {
  const doc = buildStaticSrcdoc(Object.fromEntries(files.map((f) => [f.path, f.content])), "index.html");
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-sm border border-line bg-white" aria-hidden>
      {doc ? (
        <iframe
          title={`${title} preview`}
          srcDoc={doc}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          scrolling="no"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-25"
        />
      ) : null}
    </div>
  );
}
