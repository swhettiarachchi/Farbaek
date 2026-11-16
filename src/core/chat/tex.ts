/**
 * The LaTeX maths an answer writes, turned into a MathML tree the browser draws itself (stage 199, ADR 0213). Every browser Farbaek
 * supports draws MathML Core, so no maths library is loaded. It covers what chat answers use: fractions, roots, powers and
 * indices, sums, products, integrals and limits, Greek letters, operators and relations, accents, text, fonts, brackets that grow,
 * matrices, cases and aligned equations. A command it doesn't know is shown as written, in the maths font, never dropped.
 */

export interface MathNode {
  tag: "mrow" | "mi" | "mn" | "mo" | "mtext" | "mfrac" | "msqrt" | "mroot" | "msup" | "msub" | "msubsup" | "munder" | "mover" | "munderover" | "mtable" | "mtr" | "mtd" | "mspace" | "mstyle";
  attrs?: Record<string, string>;
  text?: string;
  children?: MathNode[];
}

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const SYMBOLS: Record<string, string> = {
  infty: "∞", partial: "∂", nabla: "∇", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ", emptyset: "∅", varnothing: "∅", prime: "′", degree: "°",
  angle: "∠", triangle: "△", square: "□", checkmark: "✓", dagger: "†", top: "⊤", bot: "⊥", forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬",
};

const OPERATORS: Record<string, string> = {
  times: "×", cdot: "⋅", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "∙", oplus: "⊕", ominus: "⊖", otimes: "⊗", odot: "⊙",
  cup: "∪", cap: "∩", setminus: "∖", wedge: "∧", land: "∧", vee: "∨", lor: "∨", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈",
  equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫", in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆",
  supseteq: "⊇", mid: "∣", nmid: "∤", parallel: "∥", perp: "⊥", to: "→", rightarrow: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔",
  Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦", longrightarrow: "⟶", uparrow: "↑", downarrow: "↓",
  ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", dots: "…", colon: ":", vert: "|", Vert: "‖", lvert: "|", rvert: "|", lVert: "‖", rVert: "‖",
  langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", lbrace: "{", rbrace: "}", backslash: "\\", therefore: "∴", because: "∵",
};

/** Operators drawn large, with limits above and below in display maths. */
const LARGE: Record<string, string> = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁", bigotimes: "⨂" };

const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "det", "dim", "gcd", "deg", "ker", "arg", "Pr"]);
const LIMIT_FUNCTIONS = new Set(["lim", "max", "min", "sup", "inf", "limsup", "liminf"]);

const ACCENTS: Record<string, string> = { hat: "^", widehat: "^", bar: "¯", overline: "¯", vec: "→", dot: "˙", ddot: "¨", tilde: "~", widetilde: "~", check: "ˇ", breve: "˘", acute: "´", grave: "`", overrightarrow: "→" };

const VARIANTS: Record<string, string> = { mathbb: "double-struck", mathcal: "script", mathscr: "script", mathfrak: "fraktur", mathbf: "bold", boldsymbol: "bold-italic", mathit: "italic", mathrm: "normal", mathsf: "sans-serif", mathtt: "monospace" };

const SPACES: Record<string, string> = { ",": "0.1667em", ":": "0.2222em", ">": "0.2222em", ";": "0.2778em", " ": "0.25em", quad: "1em", qquad: "2em", "!": "-0.1667em", enspace: "0.5em", thinspace: "0.1667em" };

const SIZING = new Set(["big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "Biggl", "Biggr", "displaystyle", "textstyle", "limits", "nolimits", "nonumber", "notag"]);

type Token = { k: "cmd"; v: string } | { k: "char"; v: string } | { k: "num"; v: string } | { k: "open" } | { k: "close" } | { k: "sup" } | { k: "sub" } | { k: "amp" } | { k: "newline" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\") {
      const name = /^[A-Za-z]+/.exec(src.slice(i + 1));
      if (name) {
        out.push({ k: "cmd", v: name[0] });
        i += 1 + name[0].length;
      } else if (src[i + 1] === "\\") {
        out.push({ k: "newline" });
        i += 2;
      } else if (src[i + 1] !== undefined) {
        out.push({ k: "cmd", v: src[i + 1]! });
        i += 2;
      } else i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "{") out.push({ k: "open" });
    else if (ch === "}") out.push({ k: "close" });
    else if (ch === "^") out.push({ k: "sup" });
    else if (ch === "_") out.push({ k: "sub" });
    else if (ch === "&") out.push({ k: "amp" });
    else if (/[0-9]/.test(ch)) {
      const n = /^[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i))![0];
      out.push({ k: "num", v: n });
      i += n.length;
      continue;
    } else out.push({ k: "char", v: ch });
    i++;
  }
  return out;
}

const row = (children: MathNode[]): MathNode => (children.length === 1 ? children[0]! : { tag: "mrow", children });
const mo = (text: string, attrs?: Record<string, string>): MathNode => ({ tag: "mo", text, attrs });

class Parser {
  i = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly display: boolean,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  /** A run of atoms up to a closing brace, the end, an & or a \\ (inside a table). */
  parseRow(stopAtCell = false): MathNode[] {
    const out: MathNode[] = [];
    while (this.i < this.tokens.length) {
      const t = this.peek()!;
      if (t.k === "close") break;
      if (stopAtCell && (t.k === "amp" || t.k === "newline")) break;
      if (t.k === "cmd" && (t.v === "right" || t.v === "end")) break;
      if (t.k === "cmd" && t.v === "over") {
        // {a \over b}
        this.i++;
        const numerator = row(out.splice(0));
        const denominator = row(this.parseRow(stopAtCell));
        out.push({ tag: "mfrac", children: [numerator, denominator] });
        break;
      }
      const atom = this.parseAtom();
      if (!atom) continue;
      out.push(this.scripts(atom));
    }
    return out;
  }

  /** Attaches ^ and _ to what came before. */
  private scripts(base: MathNode): MathNode {
    let sup: MathNode | null = null;
    let sub: MathNode | null = null;
    for (;;) {
      const t = this.peek();
      if (t?.k === "sup" && !sup) {
        this.i++;
        sup = this.parseArgument();
      } else if (t?.k === "sub" && !sub) {
        this.i++;
        sub = this.parseArgument();
      } else if (t?.k === "char" && t.v === "'" && !sup) {
        this.i++;
        let primes = "′";
        while (this.peek()?.k === "char" && (this.peek() as { v: string }).v === "'") {
          this.i++;
          primes += "′";
        }
        sup = mo(primes);
      } else break;
    }
    const under = base.attrs?.["data-limits"] === "1" && this.display;
    if (base.attrs?.["data-limits"]) {
      const rest = { ...base.attrs };
      delete rest["data-limits"];
      base = { ...base, attrs: Object.keys(rest).length ? rest : undefined };
    }
    if (sup && sub) return { tag: under ? "munderover" : "msubsup", children: [base, sub, sup] };
    if (sup) return { tag: under ? "mover" : "msup", children: [base, sup] };
    if (sub) return { tag: under ? "munder" : "msub", children: [base, sub] };
    return base;
  }

  /** One argument: a {group} or a single atom. */
  parseArgument(): MathNode {
    const t = this.peek();
    if (!t) return { tag: "mrow", children: [] };
    if (t.k === "open") {
      this.i++;
      const inner = this.parseRow();
      if (this.peek()?.k === "close") this.i++;
      return row(inner);
    }
    return this.parseAtom() ?? { tag: "mrow", children: [] };
  }

  /** The raw text of a {group}, for \text and \operatorname. */
  private rawGroup(): string {
    if (this.peek()?.k !== "open") {
      const t = this.tokens[this.i++];
      return t && "v" in t ? t.v : "";
    }
    this.i++;
    let depth = 1;
    let text = "";
    while (this.i < this.tokens.length) {
      const t = this.tokens[this.i++]!;
      if (t.k === "open") depth++;
      if (t.k === "close" && --depth === 0) break;
      text += t.k === "cmd" ? (t.v.length === 1 ? t.v : `\\${t.v} `) : t.k === "num" || t.k === "char" ? t.v : t.k === "open" ? "{" : t.k === "close" ? "}" : " ";
    }
    return text;
  }

  private optional(): MathNode | null {
    const t = this.peek();
    if (t?.k !== "char" || t.v !== "[") return null;
    this.i++;
    const out: MathNode[] = [];
    while (this.i < this.tokens.length) {
      const n = this.peek()!;
      if (n.k === "char" && n.v === "]") {
        this.i++;
        break;
      }
      const atom = this.parseAtom();
      if (atom) out.push(this.scripts(atom));
    }
    return row(out);
  }

  private delimiter(): string {
    const t = this.tokens[this.i++];
    if (!t) return "";
    if (t.k === "char") return t.v === "." ? "" : t.v;
    if (t.k === "cmd") return OPERATORS[t.v] ?? (t.v === "{" ? "{" : t.v === "}" ? "}" : t.v === "|" ? "‖" : t.v);
    return "";
  }

  parseAtom(): MathNode | null {
    const t = this.tokens[this.i++];
    if (!t) return null;
    switch (t.k) {
      case "num":
        return { tag: "mn", text: t.v };
      case "char":
        if (/[A-Za-z]/.test(t.v)) return { tag: "mi", text: t.v };
        if (t.v === "~") return { tag: "mspace", attrs: { width: "0.25em" } };
        return mo(t.v, /[([{)\]}|]/.test(t.v) ? { stretchy: "false" } : undefined);
      case "open": {
        const inner = this.parseRow();
        if (this.peek()?.k === "close") this.i++;
        return { tag: "mrow", children: inner };
      }
      case "close":
      case "amp":
      case "newline":
        return null;
      case "sup":
      case "sub":
        // A script with nothing before it: attach to an empty base.
        this.i--;
        return this.scripts({ tag: "mrow", children: [] });
      case "cmd":
        return this.command(t.v);
    }
  }

  private command(name: string): MathNode | null {
    if (GREEK[name]) return { tag: "mi", text: GREEK[name], attrs: /^[A-Z]/.test(name) ? { mathvariant: "normal" } : undefined };
    if (SYMBOLS[name]) return { tag: "mi", text: SYMBOLS[name], attrs: { mathvariant: "normal" } };
    if (OPERATORS[name]) return mo(OPERATORS[name]!);
    if (LARGE[name]) return { tag: "mo", text: LARGE[name], attrs: { largeop: "true", ...(name.includes("int") ? {} : { movablelimits: "true", "data-limits": "1" }) } };
    if (FUNCTIONS.has(name)) return { tag: "mi", text: name, attrs: { mathvariant: "normal" } };
    if (LIMIT_FUNCTIONS.has(name)) return { tag: "mo", text: name === "limsup" ? "lim sup" : name === "liminf" ? "lim inf" : name, attrs: { movablelimits: "true", form: "prefix", "data-limits": "1" } };
    if (SPACES[name]) return { tag: "mspace", attrs: { width: SPACES[name]! } };
    if (SIZING.has(name)) return null;
    if (name === "{" || name === "}" || name === "%" || name === "$" || name === "#" || name === "&" || name === "_") return mo(name);
    if (name === "|") return mo("‖");

    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "cfrac": {
        const a = this.parseArgument();
        const b = this.parseArgument();
        return { tag: "mfrac", children: [a, b] };
      }
      case "binom":
      case "dbinom":
      case "tbinom": {
        const a = this.parseArgument();
        const b = this.parseArgument();
        return { tag: "mrow", children: [mo("("), { tag: "mfrac", attrs: { linethickness: "0" }, children: [a, b] }, mo(")")] };
      }
      case "sqrt": {
        const index = this.optional();
        const radicand = this.parseArgument();
        return index ? { tag: "mroot", children: [radicand, index] } : { tag: "msqrt", children: [radicand] };
      }
      case "text":
      case "textrm":
      case "textnormal":
      case "mbox":
      case "textit":
      case "textbf":
        return { tag: "mtext", text: this.rawGroup(), attrs: name === "textbf" ? { mathvariant: "bold" } : name === "textit" ? { mathvariant: "italic" } : undefined };
      case "operatorname":
        return { tag: "mi", text: this.rawGroup(), attrs: { mathvariant: "normal" } };
      case "left": {
        const open = this.delimiter();
        const inner = this.parseRow();
        let close = "";
        if (this.peek()?.k === "cmd" && (this.peek() as { v: string }).v === "right") {
          this.i++;
          close = this.delimiter();
        }
        return { tag: "mrow", children: [...(open ? [mo(open, { fence: "true", stretchy: "true" })] : []), ...inner, ...(close ? [mo(close, { fence: "true", stretchy: "true" })] : [])] };
      }
      case "begin":
        return this.environment(this.rawGroup().trim());
      case "underline": {
        const base = this.parseArgument();
        return { tag: "munder", children: [base, mo("_", { stretchy: "true" })] };
      }
      case "underbrace":
      case "overbrace": {
        const base = this.parseArgument();
        return { tag: name === "underbrace" ? "munder" : "mover", attrs: { "data-limits": "1" }, children: [base, mo(name === "underbrace" ? "⏟" : "⏞", { stretchy: "true" })] };
      }
      case "not": {
        const next = this.parseAtom();
        return next?.text ? { ...next, text: `${next.text}̸` } : next;
      }
      case "pmod": {
        const arg = this.parseArgument();
        return { tag: "mrow", children: [mo("("), { tag: "mi", text: "mod", attrs: { mathvariant: "normal" } }, { tag: "mspace", attrs: { width: "0.3em" } }, arg, mo(")")] };
      }
      case "boxed":
      case "color":
      case "textcolor":
        if (name !== "boxed") this.rawGroup();
        return this.parseArgument();
    }
    if (ACCENTS[name]) {
      const base = this.parseArgument();
      return { tag: "mover", attrs: { accent: "true" }, children: [base, mo(ACCENTS[name]!, { stretchy: name.startsWith("wide") || name === "overline" || name === "overrightarrow" ? "true" : "false" })] };
    }
    if (VARIANTS[name]) {
      const arg = this.parseArgument();
      return { tag: "mstyle", attrs: { mathvariant: VARIANTS[name]! }, children: [arg] };
    }
    // Not known: shown as written.
    return { tag: "mtext", text: `\\${name}` };
  }

  private environment(name: string): MathNode {
    const rows: MathNode[][] = [[]];
    for (;;) {
      const cells = this.parseRow(true);
      rows[rows.length - 1]!.push(row(cells));
      const t = this.peek();
      if (!t) break;
      if (t.k === "amp") {
        this.i++;
        continue;
      }
      if (t.k === "newline") {
        this.i++;
        rows.push([]);
        continue;
      }
      if (t.k === "cmd" && t.v === "end") {
        this.i++;
        this.rawGroup();
        break;
      }
      // A stray } or \right inside: skip it.
      this.i++;
    }
    const kept = rows.filter((r) => r.some((c) => c.tag !== "mrow" || (c.children?.length ?? 0) > 0));
    const align = name.startsWith("align") || name === "aligned" || name === "split" ? "right left" : name === "cases" ? "left left" : "center";
    const table: MathNode = {
      tag: "mtable",
      attrs: { columnalign: align, rowspacing: "0.4em", columnspacing: name.startsWith("align") || name === "aligned" ? "0.2em" : "1em" },
      children: kept.map((r) => ({ tag: "mtr", children: r.map((c) => ({ tag: "mtd", children: [c] })) })),
    };
    const fences: Record<string, [string, string]> = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", ""] };
    const f = fences[name];
    if (!f) return table;
    return { tag: "mrow", children: [mo(f[0], { fence: "true", stretchy: "true" }), table, ...(f[1] ? [mo(f[1], { fence: "true", stretchy: "true" })] : [])] };
  }

}

/** The MathML tree for one formula. Never throws: if reading fails, the formula comes back as text. */
export function texToMath(tex: string, display: boolean): MathNode {
  const src = tex.trim().slice(0, 4000);
  try {
    const tokens = tokenize(src);
    const parser = new Parser(tokens, display);
    const children: MathNode[] = [];
    while (parser.i < tokens.length) {
      children.push(...parser.parseRow());
      // A stray closing brace or a lone right or end command: skipped, so the rest of the formula still shows.
      if (parser.i < tokens.length) parser.i++;
    }
    return { tag: "mrow", children };
  } catch {
    return { tag: "mtext", text: src };
  }
}
