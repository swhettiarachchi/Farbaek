/**
 * What a survey file says about its job besides its points (stage 293): the job's name, the instrument and its serial number, the
 * scale factor recorded and the stations set up, each as the file's own header or records write it. AutoSurvey's start shows them
 * beside the points and names the project from them; nothing here is a fact the plan states. No date is read: an instrument whose
 * clock was never set writes its default (01-Jan-09), and a printout's date is the day it was printed.
 */
import type { ImportFormat } from "../import/detect";
import { pointName } from "../import/sdr";

export interface JobFacts {
  /** The project a printout names (Sokkia Link's "Project"), in full. */
  project: string | null;
  /** The job's own short name: the SDR job record's, or a printout's "Job ID". */
  job: string | null;
  /** The instrument as the file describes it ("SET650X V30-22"), and its serial number. */
  instrument: string | null;
  serial: string | null;
  /** The scale factor recorded with the job, as written ("1.00000000"). */
  scaleFactor: string | null;
  /** The point numbers of the stations set up, in the order the file gives them. */
  stations: string[];
}

export const NO_FACTS: JobFacts = { project: null, job: null, instrument: null, serial: null, scaleFactor: null, stations: [] };

/** Text as a header may hold it: printable, one line, at most 60 characters. */
function clean(text: string | undefined | null): string | null {
  const t = (text ?? "")
    .split("")
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return t === "" ? null : t;
}

const lines = (text: string) => text.split(/\r\n|\r|\n/);
const STX_ETX = new Set([2, 3]);
const withoutMarks = (line: string) => {
  let i = 0;
  while (i < line.length && STX_ETX.has(line.charCodeAt(i))) i++;
  return line.slice(i);
};

/**
 * An SDR job, in fixed columns as Sokkia writes them, read with the SDR reader's own rules: its layout from the 00 header (a point
 * number is 16 characters in SDR33 and 4 in SDR2x), a 5-digit checksum line skipped, and a point number as the reader names it
 * ("00000031" is 31). Each 02 record is a station. In SDR33 only, the layout checked against a real job: record 10 names the job,
 * 01 the instrument (after its ":" type mark: description, 16 characters, then serial, 6) and 06 the scale factor.
 */
function sdrFacts(text: string): JobFacts {
  const facts: JobFacts = { ...NO_FACTS, stations: [] };
  const records = lines(text)
    .slice(0, 20_000)
    .map((raw) => withoutMarks(raw).trimEnd())
    .filter((l) => l !== "" && l.charCodeAt(0) !== 3 && !/^\d{5}$/.test(l));
  const version = records[0]?.startsWith("00") ? records[0].slice(4, 20).trim() : "";
  const idWidth = /^SDR33/.test(version) ? 16 : /^SDR2\d/.test(version) ? 4 : null;
  if (idWidth === null) return facts;
  const sdr33 = idWidth === 16;
  for (const line of records) {
    const record = line.slice(0, 2);
    if (sdr33 && record === "10" && facts.job === null) facts.job = clean(line.slice(4, 20));
    else if (sdr33 && record === "01" && facts.instrument === null && line[4] === ":") {
      facts.instrument = clean(line.slice(5, 21));
      facts.serial = clean(line.slice(21, 27));
    } else if (sdr33 && record === "06" && facts.scaleFactor === null) {
      const sf = line.slice(4, 20).trim();
      facts.scaleFactor = /^\d+(?:\.\d+)?$/.test(sf) ? sf : null;
    } else if (record === "02") {
      const id = clean(pointName(line.slice(4, 4 + idWidth)));
      if (id && !facts.stations.includes(id) && facts.stations.length < 50) facts.stations.push(id);
    }
  }
  return facts;
}

/** Sokkia Link's printed point list: its "< Condition >" header, the JOB and INSTR records, and each STN line. */
function printoutFacts(text: string): JobFacts {
  const all = lines(text).slice(0, 20_000);
  const head = all.slice(0, 60).join("\n");
  const value = (pattern: RegExp) => clean(pattern.exec(head)?.[1]);
  const stations: string[] = [];
  for (const line of all) {
    const id = /^(\S+)\s+STN\s/.exec(line)?.[1];
    if (id && !stations.includes(id) && stations.length < 50) stations.push(id.slice(0, 16));
  }
  const sf = value(/S\.F\.\s*:\s*([\d.]+)/i);
  return {
    project: value(/^\s*Project\s*:\s*(.+?)\s*$/im),
    job: value(/Job ID\s*:\s*(\S+)/i),
    instrument: value(/EDM Desc\s*:\s*(.+?)(?:\s{2,}|$)/im),
    serial: value(/EDM Ser #\s*:\s*(\S+)/i),
    scaleFactor: sf && /^\d+(?:\.\d+)?$/.test(sf) ? sf : null,
    stations,
  };
}

/** The job facts a file of this format states; formats that state none give none. */
export function jobFacts(format: ImportFormat, text: string): JobFacts {
  if (format === "sdr") return sdrFacts(text);
  if (format === "sokkialist") return printoutFacts(text);
  return { ...NO_FACTS, stations: [] };
}

/** Several files of one survey, said once: the first file that gives each fact, and every station any file gives. */
export function jobFactsTogether(all: readonly JobFacts[]): JobFacts {
  const first = (key: "project" | "job" | "instrument" | "serial" | "scaleFactor") => all.map((f) => f[key]).find((v) => v !== null) ?? null;
  return { project: first("project"), job: first("job"), instrument: first("instrument"), serial: first("serial"), scaleFactor: first("scaleFactor"), stations: [...new Set(all.flatMap((f) => f.stations))] };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The names programs give every file they save, which say nothing about the job ("AutoSavePrj", "Drawing1", "Untitled"). */
const GENERIC = /^(?:auto[\s_-]?save.*|untitled.*|drawing\d*|noname|new(?: project)?|points?|export(?:ed)?|data|job|survey|backup.*)$/i;

/** Instrument files name a job best, a list of points next, a drawing last. */
const RANK: Partial<Record<ImportFormat, number>> = { sdr: 0, gsi: 0, jobxml: 0, landxml: 0, fieldbook: 0, sokkialist: 1, delimited: 1, geojson: 1, dxf: 2 };

/**
 * The project's name: the surveyor's own; else the project a printout names ("BIYAN-JANATHAMW5, 28 Nov 2026"); else the job's own file
 * ("Survey from bankuwatta job, 23 Nov 2026"), passing over names a program gives every file it saves; else the job an instrument file
 * names; else the day. Shown in the name box for the surveyor to keep or change.
 */
export function startName(title: string, files: readonly { name: string; format: ImportFormat; job: JobFacts }[], today: Date): string {
  const own = title.trim().replace(/\s+/g, " ");
  if (own) return own.slice(0, 120);
  const day = `${today.getUTCDate()} ${MONTHS[today.getUTCMonth()]} ${today.getUTCFullYear()}`;
  const project = files.find((f) => f.job.project)?.job.project;
  if (project) return `${project}, ${day}`.slice(0, 120);
  const stems = files
    .map((f, i) => ({ i, rank: RANK[f.format] ?? 1, stem: f.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((s) => s.stem)
    .filter((s) => s !== "" && !GENERIC.test(s));
  if (stems[0]) return `Survey from ${stems[0]}, ${day}`;
  const job = files.find((f) => f.job.job)?.job.job;
  return job ? `${job}, ${day}` : `Survey of ${day}`;
}
