/**
 * Points from a DXF drawing (stage 242, ADR 0250): the drawing surveying software writes when it exports a job's points to CAD (Sokkia
 * Link's drawing puts a block at each point, its number beside it and its height under it; Carlson and Civil 3D use blocks with
 * attributes). Read by its group codes, with no CAD library.
 *
 * - **Where a point is:** a POINT entity, or a block INSERT, at its X (easting), Y (northing) and Z, in the drawing's own coordinates.
 *   A POINT at the same place as a block is the same point drawn twice. A block drawn in another plane (an extrusion other than
 *   straight up) is never turned: refused when it would be a point, else left out.
 * - **Its number:** the block's attribute tagged as a number (PNT, POINT, PT, NUMBER, ID…), refused when two such attributes disagree;
 *   otherwise a text on one layer at the same offset from every point of its group, as exporting software places them. That offset is
 *   found from the drawing itself (the one most of the group has a text at), and each point takes the one text there. A point with no
 *   text at it, or with two, isn't read: never the nearest text, which in a tight cluster can be the next point's. Heights ("12.5") and
 *   texts that repeat (codes) are never taken for numbers.
 * - **Its code and height:** an attribute tagged CODE or DESC, whichever way it's numbered. Its height is the entity's Z; on a flat
 *   drawing (every Z 0) a height attribute, said so.
 * - **What isn't a point:** a group (the same block or entity on the same layer) is points only when it has two members or more and
 *   90% or more of them are numbered; a block that appears once (a title block, a north arrow), lines, circles and texts are counted
 *   and left out.
 * - **Whole files only:** a drawing that stops before its end mark is refused, never read in part.
 * - **Units:** an R12 drawing doesn't say its units; a newer one's $INSUNITS other than metres (6) or none (0) is refused. The grid is the
 *   one the surveyor confirms, as for any points file.
 */
import { codeProblem, finishPoints, guardFile, pointIdProblem } from "./common";
import { IMPORT_LIMITS, type ImportedPoint, type ImportIssue } from "./delimited";

export interface DxfPointsRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
}

const BOM = String.fromCharCode(0xfeff);
const stripBom = (s: string) => (s.startsWith(BOM) ? s.slice(1) : s);

/** Whether text is a DXF drawing: group code 0 then SECTION, as every DXF starts (after any comments, group 999). */
export function looksLikeDxf(text: string): boolean {
  const lines = stripBom(text.slice(0, 2000)).split(/\r\n|\r|\n/).map((l) => l.trim());
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] === "999") continue;
    return lines[i] === "0" && lines[i + 1] === "SECTION";
  }
  return false;
}

/** Why a binary DXF isn't read, for wherever it's met first. */
export const BINARY_DXF = "This is a binary DXF, which Farbaek doesn't read. Save the drawing as an ASCII DXF, or export the points as CSV.";

interface Pair {
  code: number;
  value: string;
  line: number;
}

interface Entity {
  type: string;
  line: number;
  layer: string;
  block: string;
  x: number | null;
  y: number | null;
  z: number | null;
  /** The second point (11, 21): a TEXT's alignment point. */
  ax: number | null;
  ay: number | null;
  /** A TEXT's justification (72, 73). */
  h72: number;
  v73: number;
  text: string;
  height: number | null;
  flat: boolean;
  attribs: { tag: string; value: string }[];
}

const NUMBER_TAGS = /^(?:PNT|PT|POINT|PNO|PT_?NO|POINT_?NO|POINT_?NUMBER|NUMBER|NUM|NO|ID|NAME|PN|PT_?ID|POINT_?ID)$/i;
const CODE_TAGS = /^(?:CODE|DESC|DESCRIPTION|DESCR|FEATURE)$/i;
const HEIGHT_TAGS = /^(?:ELEV|ELEVATION|HEIGHT|HT|RL|Z)$/i;
/** A height label: any decimal ("12.345", "10.0"), which a point number almost never is. */
const HEIGHT_TEXT = /^[+-]?\d+\.\d+$/;
/** Two entities this close are at the same place, m. */
const SAME_PLACE = 0.0005;

/** DXF text control codes: %%d (degree), %%p, %%c, %%%, and \U+XXXX escapes; underline and overline toggles dropped. */
const plain = (s: string) =>
  s
    .replace(/%%[uUoOkK]/g, "")
    .replace(/%%[dD]/g, "°")
    .replace(/%%[pP]/g, "±")
    .replace(/%%[cC]/g, "⌀")
    .replace(/%%%/g, "%")
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .trim();

/** The drawing's group codes up to its end mark (0, EOF), and whether it reached it. Null when a code isn't a number. */
function pairs(text: string): { pairs: Pair[]; ended: boolean } | null {
  const lines = stripBom(text).split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i]!.trim();
    if (!/^-?\d{1,4}$/.test(c)) return null;
    out.push({ code: Number(c), value: lines[i + 1]!, line: i + 1 });
    // Nothing after the end mark is read: a blank line or an end-of-file character there is no fault.
    if (c === "0" && lines[i + 1]!.trim() === "EOF") return { pairs: out, ended: true };
  }
  return { pairs: out, ended: false };
}

/** A hash of positions in square cells, for finding what lies near a place without looking at everything. */
class Cells<T> {
  private readonly map = new Map<string, T[]>();
  constructor(private readonly size: number) {}
  private key(x: number, y: number) {
    return `${Math.floor(x / this.size)}|${Math.floor(y / this.size)}`;
  }
  add(x: number, y: number, item: T) {
    const k = this.key(x, y);
    const list = this.map.get(k);
    if (list) list.push(item);
    else this.map.set(k, [item]);
  }
  /** Everything in the cell holding (x, y) and the eight around it. */
  around(x: number, y: number): T[] {
    const [gx, gy] = [Math.floor(x / this.size), Math.floor(y / this.size)];
    const out: T[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(this.map.get(`${gx + dx}|${gy + dy}`) ?? []));
    return out;
  }
}

interface Place {
  /** The entity it's read from: a block before a POINT at the same place. */
  e: Entity;
  /** POINT entities drawn at the same place as the block. */
  also: Entity[];
  x: number;
  y: number;
  z: number | null;
}

interface Label {
  x: number;
  y: number;
  text: string;
  layer: string;
  height: number;
}

export function parseDxfPoints(text: string): DxfPointsRead {
  if (text.startsWith("AutoCAD Binary DXF")) return { points: [], issues: [{ code: "NOT_TEXT", severity: "error", line: null, message: BINARY_DXF }] };
  const guard = guardFile(text, BINARY_DXF);
  if (guard) return { points: [], issues: [guard] };
  const fail = (message: string): DxfPointsRead => ({ points: [], issues: [{ code: "MISSING_MAPPING", severity: "error", line: null, message }] });
  const read = pairs(text);
  if (!read) return fail("The drawing's group codes couldn't be read: it isn't an ASCII DXF, or it's cut short.");
  if (!read.ended) return fail("The drawing stops before its end mark (0, EOF): it's cut short, and a part of a drawing isn't read. Save or export it again.");
  const all = read.pairs;

  // ---- Sections: the header's units, and the entities (blocks' own contents aren't points).
  let section = "";
  let units: number | null = null;
  let measurement: number | null = null;
  let entitiesOpen = false;
  let entitiesClosed = false;
  const entities: Entity[] = [];
  let cur: Entity | null = null;
  let owner: Entity | null = null;
  const start = (type: string, line: number): Entity => ({ type, line, layer: "", block: "", x: null, y: null, z: null, ax: null, ay: null, h72: 0, v73: 0, text: "", height: null, flat: true, attribs: [] });
  let attrib: { tag: string; value: string } | null = null;
  const close = () => {
    if (attrib && owner) owner.attribs.push(attrib);
    attrib = null;
    if (cur && cur.type !== "ATTRIB" && cur.type !== "SEQEND") entities.push(cur);
    cur = null;
  };
  for (let i = 0; i < all.length; i++) {
    const { code, value, line } = all[i]!;
    const v = value.trim();
    if (code === 0) {
      close();
      if (v === "SECTION") {
        section = all[i + 1]?.code === 2 ? all[i + 1]!.value.trim() : "";
        if (section === "ENTITIES") entitiesOpen = true;
        continue;
      }
      if (v === "ENDSEC" || v === "EOF") {
        if (section === "ENTITIES") entitiesClosed = true;
        section = "";
        owner = null;
        continue;
      }
      if (section !== "ENTITIES") continue;
      if (v === "ATTRIB" && owner) {
        attrib = { tag: "", value: "" };
        cur = start("ATTRIB", line);
        continue;
      }
      if (v === "SEQEND") {
        owner = null;
        cur = start("SEQEND", line);
        continue;
      }
      cur = start(v, line);
      owner = v === "INSERT" ? cur : null;
      continue;
    }
    if (section === "HEADER" && code === 9 && all[i + 1]?.code === 70) {
      if (v === "$INSUNITS") units = Number(all[i + 1]!.value.trim());
      if (v === "$MEASUREMENT") measurement = Number(all[i + 1]!.value.trim());
    }
    if (!cur) continue;
    if (cur.type === "ATTRIB" && attrib) {
      if (code === 2) attrib.tag = v;
      else if (code === 1) attrib.value = plain(value);
      continue;
    }
    const num = () => (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) ? Number(v) : NaN);
    if (code === 8) cur.layer = v;
    else if (code === 2) cur.block = v;
    else if (code === 1) cur.text = plain(value);
    else if (code === 10) cur.x = num();
    else if (code === 20) cur.y = num();
    else if (code === 30) cur.z = num();
    else if (code === 11) cur.ax = num();
    else if (code === 21) cur.ay = num();
    else if (code === 40) cur.height = num();
    else if (code === 72) cur.h72 = Number(v) || 0;
    else if (code === 73) cur.v73 = Number(v) || 0;
    else if (code === 210 || code === 220) cur.flat = cur.flat && Math.abs(num()) < 1e-9;
    else if (code === 230) cur.flat = cur.flat && Math.abs(num() - 1) < 1e-9;
  }
  close();
  if (entitiesOpen && !entitiesClosed) return fail("The drawing's entities stop before their section's end: it's cut short, and a part of a drawing isn't read. Save or export it again.");

  if (units !== null && units !== 0 && units !== 6) return fail(`The drawing says its units aren't metres ($INSUNITS ${units}). Farbaek reads metres only and converts nothing: export the points in metres, or as CSV.`);
  const finite = (x: number | null): x is number => x !== null && Number.isFinite(x);
  const issues: ImportIssue[] = [];
  if (measurement === 0 && !units) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: "The drawing's settings are imperial ($MEASUREMENT 0) but it doesn't say its units. Its coordinates are read as metres; the grid check catches a drawing in feet." });

  // ---- Where the points are. A block drawn in another plane is set aside; a POINT at a block's place is that block's point.
  const raw = entities.filter((e) => e.type === "POINT" || e.type === "INSERT");
  for (const c of raw)
    if (!finite(c.x) || !finite(c.y) || (c.z !== null && !Number.isFinite(c.z))) return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: c.line, message: `Line ${c.line}: a ${c.type} on layer ${c.layer || "0"} has a coordinate that isn't a number.` }] };
  if (raw.length > IMPORT_LIMITS.maxRows) return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The drawing has more than ${IMPORT_LIMITS.maxRows} points and blocks; the limit is ${IMPORT_LIMITS.maxRows}.` }] };
  const turned = raw.filter((c) => c.type === "INSERT" && !c.flat);
  const blocks = new Cells<Place>(0.01);
  const places: Place[] = [];
  for (const c of raw.filter((x) => x.type === "INSERT" && x.flat)) {
    const p: Place = { e: c, also: [], x: c.x!, y: c.y!, z: c.z };
    places.push(p);
    blocks.add(p.x, p.y, p);
  }
  for (const c of raw.filter((x) => x.type === "POINT")) {
    const at = blocks.around(c.x!, c.y!).find((p) => Math.hypot(p.x - c.x!, p.y - c.y!) <= SAME_PLACE && (p.z ?? 0) === (c.z ?? 0));
    if (at) at.also.push(c);
    else places.push({ e: c, also: [], x: c.x!, y: c.y!, z: c.z });
  }
  places.sort((a, b) => a.e.line - b.e.line);
  const twice = places.filter((p) => p.also.length > 0).length;

  // ---- Groups: the same block or entity on the same layer.
  const groupOf = (e: Entity) => `${e.type}|${e.block}|${e.layer}`;
  const groups = new Map<string, Place[]>();
  for (const p of places) {
    const g = groupOf(p.e);
    const list = groups.get(g);
    if (list) list.push(p);
    else groups.set(g, [p]);
  }

  // ---- Numbers by attribute: every number attribute a block carries must agree.
  type Numbered = { id: string; code: string | null; heightAttr: string | null };
  const numbered = new Map<Place, Numbered>();
  const disagree = new Map<Place, string[]>();
  const attr = (p: Place, tags: RegExp) => p.e.attribs.find((a) => tags.test(a.tag) && a.value.trim())?.value.trim() ?? null;
  for (const p of places) {
    const ids = [...new Set(p.e.attribs.filter((a) => NUMBER_TAGS.test(a.tag) && a.value.trim()).map((a) => a.value.trim()))];
    if (ids.length > 1) disagree.set(p, ids);
    else if (ids.length === 1) numbered.set(p, { id: ids[0]!, code: attr(p, CODE_TAGS), heightAttr: attr(p, HEIGHT_TAGS) });
  }

  // ---- Numbers by label, group by group: the offset most of the group has one text at, then one text per point at that offset.
  const labels: Label[] = entities
    // MTEXT only when it holds no formatting codes, which would end up in a point's number. MTEXT's 11 and 21 are its direction, not
    // a place, so it's placed by its insertion point; a TEXT by its alignment point when justified, except aligned or fit (72 of 3 or
    // 5), whose first point is where it starts.
    .filter((e) => (e.type === "TEXT" || (e.type === "MTEXT" && !/[\\{}]/.test(e.text))) && e.text !== "" && e.flat && finite(e.height) && e.height > 0)
    .map((e) => {
      const aligned = e.type === "TEXT" && (e.h72 !== 0 || e.v73 !== 0) && e.h72 !== 3 && e.h72 !== 5 && finite(e.ax) && finite(e.ay);
      return { x: aligned ? e.ax! : e.x!, y: aligned ? e.ay! : e.y!, text: e.text, layer: e.layer, height: e.height! };
    })
    .filter((t) => finite(t.x) && finite(t.y));
  const byLayer = new Map<string, Label[]>();
  for (const t of labels) {
    const list = byLayer.get(t.layer);
    if (list) list.push(t);
    else byLayer.set(t.layer, [t]);
  }
  const labelUse = new Map<Label, Place>();
  const doubled = new Set<Place>();
  for (const [, members] of groups) {
    const open = members.filter((p) => !numbered.has(p) && !disagree.has(p));
    if (members.length < 2 || open.length < 2) continue;
    type Try = { layer: string; got: Map<Place, Label>; two: Place[]; size: number };
    const tries: Try[] = [];
    for (const [layer, mine] of byLayer) {
      if (mine.length < 2) continue;
      const heights = mine.map((t) => t.height).sort((a, b) => a - b);
      const h = heights[Math.floor(heights.length / 2)]!;
      const reach = 3 * h;
      const tol = Math.max(h * 0.02, 0.002);
      const near = new Cells<Label>(reach);
      const exact = new Cells<Label>(tol * 2);
      for (const t of mine) {
        near.add(t.x, t.y, t);
        exact.add(t.x, t.y, t);
      }
      // Votes for offsets: each point's nearest few texts within reach.
      const votes = new Map<string, { n: number; dx: number; dy: number }>();
      for (const p of open) {
        const close = near
          .around(p.x, p.y)
          .map((t) => ({ t, d: Math.hypot(t.x - p.x, t.y - p.y) }))
          .filter((x) => x.d <= reach)
          .sort((a, b) => a.d - b.d)
          .slice(0, 8);
        for (const { t } of close) {
          const [dx, dy] = [t.x - p.x, t.y - p.y];
          const k = `${Math.round(dx / tol)}|${Math.round(dy / tol)}`;
          const v = votes.get(k);
          if (v) v.n++;
          else votes.set(k, { n: 1, dx, dy });
        }
      }
      const labelAt = (off: { dx: number; dy: number }): Try => {
        const got = new Map<Place, Label>();
        const two: Place[] = [];
        const used = new Map<Label, Place>();
        for (const p of open) {
          const [x, y] = [p.x + off.dx, p.y + off.dy];
          const at = exact.around(x, y).filter((t) => Math.hypot(t.x - x, t.y - y) <= tol * 1.5);
          if (at.length === 1) {
            const prior = used.get(at[0]!);
            if (prior) {
              got.delete(prior);
              two.push(prior, p);
              continue;
            }
            used.set(at[0]!, p);
            got.set(p, at[0]!);
          } else if (at.length > 1) two.push(p);
        }
        return { layer, got, two, size: open.length };
      };
      const offsets = [...votes.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 6)
        .map(labelAt)
        // Numbers are unique and aren't heights; codes and heights repeat or carry decimals ("CP", "0.000", "10.5").
        .filter((l) => {
          const v = [...l.got.values()].map((t) => t.text);
          return l.got.size >= Math.max(2, open.length * 0.5) && v.filter((x) => HEIGHT_TEXT.test(x)).length < v.length * 0.5 && new Set(v).size >= v.length * 0.9;
        })
        .sort((a, b) => b.got.size - a.got.size);
      if (offsets.length === 0) continue;
      const texts = (t: Try) => [...t.got.values()].map((x) => x.text).join("|");
      // Two different texts beside most points (a number and a code, say), at two places: which is the number can't be told.
      if (offsets.some((o) => o !== offsets[0] && o.got.size >= offsets[0]!.got.size * 0.9 && texts(o) !== texts(offsets[0]!))) {
        return fail(`On layer ${layer}, two texts sit beside most points at two different places, so which is the point number can't be told. Keep only the numbers on that layer, or export the points as CSV.`);
      }
      tries.push(offsets[0]!);
    }
    const ranked = tries.sort((a, b) => b.got.size - a.got.size);
    const best = ranked[0];
    if (!best) continue;
    if (ranked[1] && ranked[1].got.size >= best.got.size * 0.9) {
      return fail(`Two layers could hold the point numbers (${best.layer} and ${ranked[1].layer}): each has a text beside most points. Delete the other layer's texts, or export the points as CSV.`);
    }
    for (const p of best.two) doubled.add(p);
    for (const [p, t] of best.got) {
      // One text can number one point only, across groups too.
      const prior = labelUse.get(t);
      if (prior) {
        numbered.delete(prior);
        doubled.add(prior).add(p);
        continue;
      }
      labelUse.set(t, p);
      numbered.set(p, { id: t.text, code: attr(p, CODE_TAGS), heightAttr: attr(p, HEIGHT_TAGS) });
    }
  }

  // ---- Which groups are points, and the points they give.
  const out: ImportedPoint[] = [];
  const leftOut: string[] = [];
  const flatDrawing = places.every((p) => !p.z);
  let heightsFromAttr = 0;
  const pointGroups = new Set<string>();
  for (const [g, members] of groups) {
    const first = members[0]!.e;
    const name = first.type === "INSERT" ? `block ${first.block || "(unnamed)"} on layer ${first.layer || "0"}` : `point on layer ${first.layer || "0"}`;
    // A block whose number attributes disagree carries numbers: it belongs with the points, and is refused on its own.
    const done = members.filter((p) => numbered.has(p) || disagree.has(p));
    if (members.length < 2) {
      leftOut.push(`1 ${name}, which appears once`);
      continue;
    }
    if (done.length < members.length * 0.9) {
      leftOut.push(`${members.length} ${name}${done.length > 0 ? ` (only ${done.length} numbered)` : ""}`);
      continue;
    }
    pointGroups.add(g);
    for (const p of members) {
      const c = p.e;
      const k = numbered.get(p);
      if (!k) {
        const why = disagree.has(p) ? `has two numbers (${disagree.get(p)!.join(" and ")})` : doubled.has(p) ? "has two texts where its number would be, or shares its number with another point" : "has no number beside it";
        issues.push({ code: "MISSING_POINT_ID", severity: "error", line: c.line, message: `Line ${c.line}: the ${name} at ${p.x.toFixed(3)}, ${p.y.toFixed(3)} ${why}, so it isn't read.` });
        continue;
      }
      const problem = pointIdProblem(k.id);
      if (problem) {
        issues.push({ code: "MISSING_POINT_ID", severity: "error", line: c.line, message: `Line ${c.line} ${problem}.` });
        continue;
      }
      const cp = codeProblem(k.code);
      if (cp) {
        issues.push({ code: "CODE_NOT_READABLE", severity: "error", line: c.line, message: `Line ${c.line}, point ${k.id} ${cp}.` });
        continue;
      }
      let z: number | null = p.z ?? null;
      const fromAttr = k.heightAttr !== null && /^[+-]?\d+(?:\.\d+)?$/.test(k.heightAttr) ? Number(k.heightAttr) : null;
      if (flatDrawing && fromAttr !== null) {
        z = fromAttr;
        heightsFromAttr++;
      } else if (fromAttr !== null && z !== null && Math.abs(fromAttr - z) > 0.0005) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line: c.line, message: `Line ${c.line}, point ${k.id}: its height in the drawing is ${z} and its label says ${k.heightAttr}. Farbaek doesn't choose: correct one of them.` });
        continue;
      }
      out.push({ line: c.line, pointId: k.id, e: p.x, n: p.y, z, code: k.code });
    }
  }
  // A block drawn in another plane is never turned: refused where it would be a point, else left out with the rest.
  for (const c of turned) {
    if (pointGroups.has(groupOf(c))) issues.push({ code: "NOT_A_NUMBER", severity: "error", line: c.line, message: `Line ${c.line}: a block on layer ${c.layer || "0"} is drawn in another plane (its extrusion isn't straight up), so its place isn't read.` });
    else leftOut.push(`1 block ${c.block || "(unnamed)"} on layer ${c.layer || "0"}, drawn in another plane`);
  }
  if (heightsFromAttr > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `The drawing is flat (every point at height 0), so ${heightsFromAttr} height${heightsFromAttr === 1 ? " was" : "s were"} read from the blocks' height attribute.` });
  else if (flatDrawing && out.length > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: "Every point is at height 0 in the drawing: if the survey has heights, they aren't in it." });
  if (twice > 0) issues.push({ code: "DUPLICATE_POINT_SAME", severity: "warning", line: null, message: `${twice} point${twice === 1 ? " is" : "s are"} drawn twice at the same place (a POINT and a block), and read once.` });
  // A polyline's vertices are part of it, not shapes of their own.
  const other = entities.filter((e) => !["POINT", "INSERT", "TEXT", "MTEXT", "VERTEX"].includes(e.type)).length;
  const said = [...leftOut, ...(other > 0 ? [`${other} line${other === 1 ? "" : "s"}, circle${other === 1 ? "" : "s"} or other shape${other === 1 ? "" : "s"}`] : [])];
  if (said.length > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `Left out, as not numbered points: ${said.join("; ")}.` });
  if (out.length === 0 && !issues.some((i) => i.severity === "error")) issues.push({ code: "NO_ROWS", severity: "error", line: null, message: "No numbered points were found in the drawing: no POINT or block with a number attribute, or with its number written beside it. Export the points as CSV instead." });
  const finished = finishPoints(out, issues);
  return { points: finished.points, issues: finished.issues };
}
