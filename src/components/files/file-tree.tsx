import { CaretRightIcon, FileIcon, FolderIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { TreeNode } from "@/core/workspace/files";

/** Link to one file in the files view. */
export function fileHref(projectId: string, path: string, line?: number): string {
  return `/app/projects/${projectId}/files?path=${encodeURIComponent(path)}${line ? `#L${line}` : ""}`;
}

/**
 * The project's file tree as native disclosure widgets: works without
 * JavaScript and with the keyboard. Folders on the way to the open file
 * start expanded, and so does everything in a small project.
 */
export function FileTree({ projectId, nodes, current, expandAll }: { projectId: string; nodes: TreeNode[]; current: string | null; expandAll: boolean }) {
  return (
    <ul className="grid gap-px text-sm" role="list">
      {nodes.map((node) => (
        <TreeItem key={node.path} projectId={projectId} node={node} current={current} expandAll={expandAll} />
      ))}
    </ul>
  );
}

function TreeItem({ projectId, node, current, expandAll }: { projectId: string; node: TreeNode; current: string | null; expandAll: boolean }) {
  if (node.children) {
    const open = expandAll || (current !== null && current.startsWith(`${node.path}/`));
    return (
      <li>
        <details open={open} className="group">
          <summary className="flex min-h-11 lg:min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ink-2 hover:bg-surface-raised hover:text-ink [&::-webkit-details-marker]:hidden">
            <CaretRightIcon size={12} weight="bold" className="shrink-0 text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            <FolderIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
            <span className="truncate">{node.name}</span>
          </summary>
          <div className="ml-3 border-l border-line pl-1.5">
            <FileTree projectId={projectId} nodes={node.children} current={current} expandAll={expandAll} />
          </div>
        </details>
      </li>
    );
  }
  const active = node.path === current;
  return (
    <li>
      <Link
        href={fileHref(projectId, node.path)}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 lg:min-h-9 items-center gap-1.5 rounded-sm px-2 pl-[26px] ${active ? "bg-accent/[0.08] font-medium text-accent" : "text-ink hover:bg-surface-raised"}`}
      >
        <FileIcon size={16} className={`shrink-0 ${active ? "text-accent" : "text-ink-3"}`} aria-hidden />
        <span className="truncate">{node.name}</span>
      </Link>
    </li>
  );
}
