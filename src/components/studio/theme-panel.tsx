"use client";

import { InfoIcon, LockSimpleIcon, MoonIcon, SunIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { CORNERS, FONT_PAIRS, LOOK_SWATCHES, THEME_TOKENS, contrastRatio, type CornerId, type FontPairId, type ThemeToken } from "@/core/studio/site-theme";
import { readTheme, type VisualEdit } from "@/core/studio/visual-edit";

export type ThemePreview = { look?: string | null; vars?: Record<string, string> } | null;

const EDITABLE: readonly ThemeToken[] = ["accent", "accent-2", "ink", "paper"];

/**
 * The site's theme (ADR 0159), for a site on the Farbaek Studio kit: a look,
 * its colours, a font pairing and a corner style. Colours preview live in
 * the page while the picker moves, then apply as one draft edit; every other
 * choice applies straight to the draft. Nothing is saved until the review.
 */
export function ThemePanel({
  files,
  onKit,
  kitPro,
  upgradeHref,
  onApply,
  onPreview,
}: {
  files: Readonly<Record<string, string>>;
  onKit: boolean;
  kitPro: boolean;
  /** Where the person can upgrade an older site's design onto the kit. */
  upgradeHref: string;
  onApply(edit: VisualEdit): void;
  onPreview(preview: ThemePreview): void;
}) {
  const id = useId();
  const theme = useMemo(() => readTheme(files), [files]);
  const current = theme.look && LOOK_SWATCHES[theme.look] ? theme.look : null;
  const [mode, setMode] = useState<"light" | "dark">(current && LOOK_SWATCHES[current]!.dark ? "dark" : "light");
  const base = current ? LOOK_SWATCHES[current]! : LOOK_SWATCHES.signal!;
  const shown: Record<string, string> = { accent: base.accent, "accent-2": base.accent2, ink: base.ink, paper: base.paper, ...theme.tokens };
  const [colors, setColors] = useState<Partial<Record<ThemeToken, string>>>({});
  const value = (t: ThemeToken) => colors[t] ?? shown[t] ?? "#000000";
  const touched = Object.keys(colors).length > 0;

  if (!onKit) {
    return (
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-4 text-sm text-ink-2">
        <p className="flex items-center gap-2 font-medium text-ink">
          <InfoIcon size={20} weight="fill" className="shrink-0 text-info" aria-hidden /> Theme controls need the Studio kit
        </p>
        <p>This site was built before the Farbaek Studio kit, so its colours and fonts are its own CSS. Upgrade its design once, and you can change the look, colours, fonts and corners here.</p>
        <div>
          <Link href={upgradeHref} className={buttonClasses("secondary", "sm")}>
            Upgrade its design
          </Link>
        </div>
      </div>
    );
  }

  const setColor = (t: ThemeToken, v: string) => {
    const next = { ...colors, [t]: v };
    setColors(next);
    onPreview({ vars: Object.fromEntries(Object.entries(next).map(([k, c]) => [`--${k}`, c])) });
  };
  const textContrast = contrastRatio(value("ink"), value("paper"));
  const accentContrast = contrastRatio(value("accent"), value("paper"));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body font-medium">Look</p>
          <div className="inline-flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Light or dark looks">
            {(
              [
                ["light", "Light", SunIcon],
                ["dark", "Dark", MoonIcon],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-150 ${mode === m ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
              >
                <Icon size={16} weight="bold" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {Object.entries(LOOK_SWATCHES)
            .filter(([, s]) => s.dark === (mode === "dark"))
            .map(([look, s]) => {
              const locked = s.pro && !kitPro;
              const on = current === look;
              return (
                <li key={look}>
                  <button
                    type="button"
                    disabled={locked || on}
                    onClick={() => onApply({ kind: "theme", look })}
                    aria-pressed={on}
                    title={locked ? "Studio kit Pro is part of the paid plans." : undefined}
                    className={`grid w-full gap-2 rounded-sm border p-2 text-left transition-[border-color,transform] duration-150 active:scale-[0.98] ${on ? "border-accent ring-1 ring-accent disabled:cursor-default" : locked ? "border-line opacity-60 disabled:cursor-not-allowed" : "border-line hover:border-accent/60"}`}
                  >
                    {/* The look itself, in its own colours: the person's site, not Farbaek's interface. */}
                    <span className="flex h-14 items-end justify-between rounded-[10px] p-2" style={{ background: s.paper, color: s.ink }}>
                      <span className="text-lg font-semibold leading-none">Aa</span>
                      <span className="h-4 w-8 rounded-full" style={{ background: s.accent }} />
                    </span>
                    <span className="flex items-center gap-1 text-sm">
                      {s.label}
                      {s.pro ? (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-1.5 text-xs text-ink-3">
                          {locked ? <LockSimpleIcon size={14} weight="bold" aria-hidden /> : null}Pro
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
        {/* A phone has no hover for a tooltip, so the reason a look is off is written out. */}
        {!kitPro && Object.values(LOOK_SWATCHES).some((s) => s.pro) ? <p className="mt-2 text-xs text-ink-3">Looks marked Pro are part of the paid plans.</p> : null}
      </div>

      <fieldset className="grid gap-3 border-t border-line pt-4">
        <legend className="sr-only">Colours</legend>
        <p className="text-body font-medium">Colours</p>
        <div className="grid grid-cols-2 gap-3">
          {EDITABLE.map((t) => (
            <div key={t} className="grid gap-1.5">
              <label htmlFor={`${id}-${t}`} className="text-xs text-ink-2">
                {THEME_TOKENS[t]}
              </label>
              {/* The whole 44px row opens the colour picker, not only the swatch. */}
              <label htmlFor={`${id}-${t}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-surface px-2">
                <input id={`${id}-${t}`} type="color" value={value(t)} onChange={(e) => setColor(t, e.target.value)} className="size-8 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
                <span aria-hidden className="font-mono text-xs text-ink-2">{value(t)}</span>
              </label>
            </div>
          ))}
        </div>
        {textContrast < 4.5 || accentContrast < 3 ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
            <WarningCircleIcon size={14} weight="fill" className="mt-px shrink-0 text-caution" aria-hidden />
            <span>
              {textContrast < 4.5 ? `Text on this background is hard to read (contrast ${textContrast.toFixed(1)}:1, aim for 4.5). ` : ""}
              {accentContrast < 3 ? `The accent barely stands out from the background (${accentContrast.toFixed(1)}:1, aim for 3).` : ""}
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!touched}
            onClick={() => {
              onApply({ kind: "theme", tokens: colors });
              setColors({});
            }}
            className={buttonClasses("secondary", "sm")}
          >
            Apply colours
          </button>
          {touched ? (
            <button
              type="button"
              onClick={() => {
                setColors({});
                onPreview(null);
              }}
              className={buttonClasses("ghost", "sm")}
            >
              Reset
            </button>
          ) : (
            <span className="text-xs text-ink-3">Colours show in the page as you pick them.</span>
          )}
        </div>
      </fieldset>

      <div className="grid gap-2 border-t border-line pt-4">
        <p className="text-body font-medium">Fonts</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {(Object.entries(FONT_PAIRS) as [FontPairId, (typeof FONT_PAIRS)[FontPairId]][]).map(([pair, f]) => (
            <li key={pair}>
              <button
                type="button"
                aria-pressed={theme.fonts === pair}
                disabled={theme.fonts === pair}
                onClick={() => onApply({ kind: "theme", fonts: pair })}
                className={`grid w-full gap-0.5 rounded-sm border p-3 text-left transition-[border-color,transform] duration-150 active:scale-[0.98] disabled:cursor-default ${theme.fonts === pair ? "border-accent ring-1 ring-accent" : "border-line hover:border-accent/60"}`}
              >
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-xs text-ink-3">
                  {f.display}
                  {f.display === f.body ? "" : ` with ${f.body}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-2 border-t border-line pt-4">
        <p className="text-body font-medium" id={`${id}-corners`}>
          Corners
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-corners`}>
          {(Object.entries(CORNERS) as [CornerId, (typeof CORNERS)[CornerId]][]).map(([c, v]) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={theme.corners === c}
              onClick={() => onApply({ kind: "theme", corners: c })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-150 ${theme.corners === c ? "border-accent bg-accent/[0.06] text-ink" : "border-line text-ink-2 hover:text-ink"}`}
            >
              <span aria-hidden className="size-4 border-2 border-current" style={{ borderRadius: v.radius === "4px" ? 2 : v.radius === "16px" ? 5 : 8 }} />
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
