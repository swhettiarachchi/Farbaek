/**
 * Recently received (stage 188): the last 30 arrivals on this computer, kept across restarts, so a person can find a
 * folder again after the transfer has left the list. Written only by the main process, read back through zod, and
 * replaced whole (written beside it, then renamed) so a crash never leaves half a file. The window only ever sends an
 * entry's id; the folder path never comes from the page.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const MAX_RECEIVED = 30;

export const ReceivedEntrySchema = z.object({
  /** The transfer's id. */
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  from: z.string().max(200),
  at: z.string().max(40),
  folder: z.string().min(1).max(2048).refine((p) => path.isAbsolute(p), "not an absolute path"),
  files: z.number().int().min(0),
  bytes: z.number().int().min(0),
  /** "1 photo", "6 files": what arrived. */
  summary: z.string().max(120),
  /** The one file inside the folder that may open with a click, as a path relative to it; null otherwise. */
  single: z.string().min(1).max(300).nullable(),
});

export type ReceivedEntry = z.infer<typeof ReceivedEntrySchema>;

export class ReceivedLog {
  private entries: ReceivedEntry[] = [];
  private loading: Promise<void> | null = null;
  /** The file is there but couldn't be read just now (another program has it open): it's read again, and never overwritten. */
  private unreadable = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  /** Reads the file once. A missing or damaged file is an empty history, never an error. */
  async load(): Promise<ReceivedEntry[]> {
    this.loading ??= (async () => {
      try {
        const parsed = z.array(z.unknown()).safeParse(JSON.parse(await fs.readFile(this.file, "utf8")));
        if (!parsed.success) return;
        const kept: ReceivedEntry[] = [];
        for (const raw of parsed.data) {
          const entry = ReceivedEntrySchema.safeParse(raw);
          if (entry.success && !kept.some((e) => e.id === entry.data.id)) kept.push(entry.data);
          if (kept.length === MAX_RECEIVED) break;
        }
        this.entries = kept;
      } catch (error) {
        this.entries = [];
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && !(error instanceof SyntaxError)) {
          this.unreadable = true;
          this.loading = null;
        }
      }
    })();
    const loading = this.loading;
    this.unreadable = false;
    await loading;
    return this.entries;
  }

  private async writable(): Promise<void> {
    await this.load();
    if (this.unreadable) throw new Error("The list of received folders couldn't be read just now, so it wasn't changed.");
  }

  list(): ReceivedEntry[] {
    return this.entries;
  }

  get(id: string): ReceivedEntry | null {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /** Adds an arrival at the top; the same transfer again replaces its entry, and the oldest beyond 30 drop off. */
  async add(entry: ReceivedEntry): Promise<void> {
    await this.writable();
    const valid = ReceivedEntrySchema.parse(entry);
    this.entries = [valid, ...this.entries.filter((e) => e.id !== valid.id)].slice(0, MAX_RECEIVED);
    await this.save();
  }

  async remove(id: string): Promise<void> {
    await this.writable();
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length !== before) await this.save();
  }

  /** One write at a time, each replacing the file whole. */
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.entries);
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(`${this.file}.tmp`, snapshot, "utf8");
        await fs.rename(`${this.file}.tmp`, this.file);
      });
    return this.writing;
  }
}
