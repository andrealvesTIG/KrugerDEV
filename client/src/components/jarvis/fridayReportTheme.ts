// Shared design system for Friday Reports.
//
// Generates the same CSS rules under any scope selector so the in-chat card,
// the full-page view, and the standalone exported HTML all look identical.
//
// The renderer expects four host-provided CSS variables — --foreground,
// --muted, --muted-foreground, --border, --card, --primary — using HSL
// values without the hsl() wrapper (the same convention shadcn uses).
// `STANDALONE_THEME_VARS` provides safe light-mode defaults so exports look
// right outside the app shell.

export const STANDALONE_THEME_VARS = `
  --foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --card: 0 0% 100%;
  --primary: 221 83% 53%;
`;

export function buildReportCss(scope: string): string {
  return `
${scope} {
  --fr-good: 16 185 129;
  --fr-warn: 245 158 11;
  --fr-danger: 244 63 94;
  --fr-info: 14 165 233;
  --fr-accent: 99 102 241;
  --fr-radius: 10px;
  --fr-radius-sm: 6px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 0.875rem;
  line-height: 1.55;
  color: inherit;
  font-feature-settings: "ss01", "cv11";
}
${scope} > *:first-child { margin-top: 0; }
${scope} > *:last-child  { margin-bottom: 0; }

/* ---------- Headings ---------- */
${scope} h1 {
  font-size: 1.5rem; font-weight: 800; letter-spacing: -0.015em;
  line-height: 1.2; margin: 1.25rem 0 0.5rem;
}
${scope} h2 {
  display: flex; align-items: center; gap: 0.55rem;
  font-size: 1.05rem; font-weight: 700; letter-spacing: -0.005em;
  margin: 1.5rem 0 0.6rem; padding-bottom: 0.4rem;
  border-bottom: 1px solid hsl(var(--border));
}
${scope} h2::before {
  content: ""; width: 4px; height: 14px; flex-shrink: 0; border-radius: 2px;
  background: linear-gradient(180deg, rgb(var(--fr-accent)), rgb(var(--fr-info)));
}
${scope} h3 {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: hsl(var(--muted-foreground));
  margin: 1rem 0 0.4rem;
}
${scope} h4 {
  font-size: 0.92rem; font-weight: 600; margin: 0.85rem 0 0.35rem;
}

/* ---------- Text & lists ---------- */
${scope} p { margin: 0.4rem 0; }
${scope} ul, ${scope} ol { margin: 0.4rem 0; padding-left: 1.2rem; }
${scope} li { margin: 0.15rem 0; }
${scope} li::marker { color: rgb(var(--fr-accent)); }
${scope} strong { font-weight: 600; }

/* ---------- Links ---------- */
${scope} a {
  color: hsl(var(--primary)); text-decoration: none;
  border-bottom: 1px dashed hsl(var(--primary) / 0.45);
  transition: border-color 120ms ease, color 120ms ease;
}
${scope} a:hover { border-bottom-color: hsl(var(--primary)); }

/* ---------- Code ---------- */
${scope} code {
  background: hsl(var(--muted)); padding: 0.1rem 0.35rem;
  border-radius: var(--fr-radius-sm); font-size: 0.82em;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
${scope} pre {
  background: hsl(var(--muted)); padding: 0.75rem 0.9rem;
  border-radius: var(--fr-radius); overflow-x: auto;
  font-size: 0.8rem; margin: 0.6rem 0;
  border: 1px solid hsl(var(--border));
}
${scope} pre code { background: transparent; padding: 0; font-size: inherit; }

/* ---------- Blockquote ---------- */
${scope} blockquote {
  margin: 0.75rem 0; padding: 0.55rem 0.85rem;
  border-left: 3px solid rgb(var(--fr-info));
  background: rgb(var(--fr-info) / 0.08);
  border-radius: 0 var(--fr-radius-sm) var(--fr-radius-sm) 0;
  color: hsl(var(--foreground));
}
${scope} blockquote > :first-child { margin-top: 0; }
${scope} blockquote > :last-child  { margin-bottom: 0; }

/* ---------- HR ---------- */
${scope} hr {
  border: 0; height: 1px; margin: 1.25rem 0;
  background: linear-gradient(90deg, transparent, hsl(var(--border)) 35%, hsl(var(--border)) 65%, transparent);
}

/* ---------- Tables ---------- */
${scope} table {
  width: 100%; border-collapse: separate; border-spacing: 0;
  margin: 0.85rem 0; font-size: 0.82rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--fr-radius); overflow: hidden;
  font-variant-numeric: tabular-nums;
}
${scope} thead { background: hsl(var(--muted) / 0.6); }
${scope} th {
  text-align: left; font-weight: 600;
  padding: 0.5rem 0.75rem;
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
  border-bottom: 1px solid hsl(var(--border));
  vertical-align: middle; white-space: nowrap;
}
${scope} td {
  padding: 0.55rem 0.75rem; vertical-align: top;
  border-bottom: 1px solid hsl(var(--border));
}
${scope} tbody tr:last-child td { border-bottom: 0; }
${scope} tbody tr:hover td { background: hsl(var(--muted) / 0.35); }
${scope} td.num, ${scope} th.num { text-align: right; font-variant-numeric: tabular-nums; }

/* ---------- Images ---------- */
${scope} img { max-width: 100%; height: auto; border-radius: var(--fr-radius-sm); }
${scope} figure { margin: 0.85rem 0; }
${scope} figcaption {
  font-size: 0.72rem; color: hsl(var(--muted-foreground));
  text-align: center; margin-top: 0.35rem;
}

/* ===================================================================
   UTILITY COMPONENTS — referenced by the AI in generated reports.
   ================================================================ */

/* Hero header — the dramatic, premium opening block for every report.
   Gradient background, accent stripe, glow, optional inline at-a-glance
   stats. Always render this first inside the report body. */
${scope} .hero {
  position: relative; overflow: hidden;
  margin: 0 0 1rem; padding: 1.25rem 1.4rem 1.1rem;
  border-radius: 14px;
  background:
    radial-gradient(800px 200px at 110% -20%, rgb(var(--fr-info) / 0.18), transparent 60%),
    radial-gradient(500px 180px at -10% 120%, rgb(var(--fr-accent) / 0.16), transparent 60%),
    linear-gradient(135deg, rgb(var(--fr-accent) / 0.10), rgb(var(--fr-info) / 0.05));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.06);
}
${scope} .hero::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: linear-gradient(180deg, rgb(var(--fr-accent)), rgb(var(--fr-info)), rgb(var(--fr-info) / 0.6));
}
${scope} .hero__eyebrow {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.12em; color: rgb(var(--fr-accent));
  margin: 0 0 0.45rem; line-height: 1;
}
${scope} .hero__eyebrow::before {
  content: ""; width: 6px; height: 6px; border-radius: 999px;
  background: rgb(var(--fr-accent)); box-shadow: 0 0 0 3px rgb(var(--fr-accent) / 0.18);
}
${scope} .hero__title {
  font-size: 1.55rem; font-weight: 800; letter-spacing: -0.02em;
  line-height: 1.15; margin: 0 0 0.4rem;
  color: hsl(var(--foreground));
  background: linear-gradient(95deg, hsl(var(--foreground)) 35%, rgb(var(--fr-accent)));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
${scope} .hero__lede {
  font-size: 0.92rem; line-height: 1.5; max-width: 64ch;
  color: hsl(var(--foreground)); margin: 0;
}
${scope} .hero__stats {
  display: flex; flex-wrap: wrap; gap: 0.85rem 1.75rem;
  margin-top: 0.9rem; padding-top: 0.85rem;
  border-top: 1px solid hsl(var(--border));
}
${scope} .hero__stat { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
${scope} .hero__stat-label {
  font-size: 0.6rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: hsl(var(--muted-foreground));
}
${scope} .hero__stat-value {
  font-size: 1.05rem; font-weight: 700; line-height: 1.2;
  color: hsl(var(--foreground)); font-variant-numeric: tabular-nums;
}
${scope} .hero--good   { background: radial-gradient(800px 200px at 110% -20%, rgb(var(--fr-good) / 0.22), transparent 60%), linear-gradient(135deg, rgb(var(--fr-good) / 0.10), rgb(var(--fr-good) / 0.04)); }
${scope} .hero--good::before   { background: linear-gradient(180deg, rgb(var(--fr-good)), rgb(var(--fr-good) / 0.6)); }
${scope} .hero--good .hero__eyebrow,
${scope} .hero--good .hero__title { color: rgb(var(--fr-good)); -webkit-text-fill-color: rgb(var(--fr-good)); background: none; }
${scope} .hero--warn   { background: radial-gradient(800px 200px at 110% -20%, rgb(var(--fr-warn) / 0.22), transparent 60%), linear-gradient(135deg, rgb(var(--fr-warn) / 0.10), rgb(var(--fr-warn) / 0.04)); }
${scope} .hero--warn::before   { background: linear-gradient(180deg, rgb(var(--fr-warn)), rgb(var(--fr-warn) / 0.6)); }
${scope} .hero--warn .hero__eyebrow { color: rgb(var(--fr-warn)); }
${scope} .hero--danger { background: radial-gradient(800px 200px at 110% -20%, rgb(var(--fr-danger) / 0.22), transparent 60%), linear-gradient(135deg, rgb(var(--fr-danger) / 0.10), rgb(var(--fr-danger) / 0.04)); }
${scope} .hero--danger::before { background: linear-gradient(180deg, rgb(var(--fr-danger)), rgb(var(--fr-danger) / 0.6)); }
${scope} .hero--danger .hero__eyebrow { color: rgb(var(--fr-danger)); }
@media (max-width: 640px) {
  ${scope} .hero { padding: 1rem 1.1rem 1rem; }
  ${scope} .hero__title { font-size: 1.3rem; }
  ${scope} .hero__stats { gap: 0.65rem 1rem; }
}
@media print {
  ${scope} .hero {
    background: none !important;
    border: 1px solid #cbd5e1 !important;
    box-shadow: none !important;
  }
  ${scope} .hero::before,
  ${scope} .hero::after { display: none !important; }
  ${scope} .hero__title {
    background: none !important;
    -webkit-text-fill-color: currentColor !important;
    color: #0f172a !important;
  }
  ${scope} .hero__eyebrow { color: #475569 !important; }
}


/* KPI grid: compact tiles with a colored accent bar */
${scope} .kpi-grid {
  display: grid; gap: 0.55rem; margin: 0.75rem 0;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
${scope} .kpi {
  position: relative; overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--fr-radius);
  padding: 0.6rem 0.8rem 0.6rem 0.95rem;
  background: hsl(var(--card));
}
${scope} .kpi::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(180deg, rgb(var(--fr-accent)), rgb(var(--fr-info)));
}
${scope} .kpi--good::before   { background: rgb(var(--fr-good)); }
${scope} .kpi--warn::before   { background: rgb(var(--fr-warn)); }
${scope} .kpi--danger::before { background: rgb(var(--fr-danger)); }
${scope} .kpi--info::before   { background: rgb(var(--fr-info)); }
${scope} .kpi__label {
  font-size: 0.62rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: hsl(var(--muted-foreground));
  margin: 0; line-height: 1.2;
}
${scope} .kpi__value {
  font-size: 1.4rem; font-weight: 700; line-height: 1.15;
  margin: 0.2rem 0 0; color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums; letter-spacing: -0.015em;
}
${scope} .kpi__delta {
  font-size: 0.7rem; font-weight: 600; margin-top: 0.15rem;
  color: hsl(var(--muted-foreground));
}
${scope} .kpi__delta--up   { color: rgb(var(--fr-good)); }
${scope} .kpi__delta--down { color: rgb(var(--fr-danger)); }

/* Callouts — colored side-bar info boxes */
${scope} .callout {
  margin: 0.65rem 0; padding: 0.6rem 0.85rem;
  border-left: 3px solid rgb(var(--fr-info));
  background: rgb(var(--fr-info) / 0.08);
  border-radius: 0 var(--fr-radius-sm) var(--fr-radius-sm) 0;
  color: hsl(var(--foreground));
}
${scope} .callout--success { border-color: rgb(var(--fr-good));   background: rgb(var(--fr-good)   / 0.08); }
${scope} .callout--warn    { border-color: rgb(var(--fr-warn));   background: rgb(var(--fr-warn)   / 0.08); }
${scope} .callout--danger  { border-color: rgb(var(--fr-danger)); background: rgb(var(--fr-danger) / 0.08); }
${scope} .callout__title { font-weight: 700; margin: 0 0 0.2rem; font-size: 0.85rem; }
${scope} .callout > :first-child { margin-top: 0; }
${scope} .callout > :last-child  { margin-bottom: 0; }

/* Pill badges */
${scope} .badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.1rem 0.55rem; font-size: 0.66rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  background: hsl(var(--muted)); color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 999px; line-height: 1.5;
  vertical-align: middle;
}
${scope} .badge--good   { background: rgb(var(--fr-good)   / 0.14); color: rgb(var(--fr-good));   border-color: rgb(var(--fr-good)   / 0.32); }
${scope} .badge--warn   { background: rgb(var(--fr-warn)   / 0.14); color: rgb(var(--fr-warn));   border-color: rgb(var(--fr-warn)   / 0.32); }
${scope} .badge--danger { background: rgb(var(--fr-danger) / 0.14); color: rgb(var(--fr-danger)); border-color: rgb(var(--fr-danger) / 0.32); }
${scope} .badge--info   { background: rgb(var(--fr-info)   / 0.14); color: rgb(var(--fr-info));   border-color: rgb(var(--fr-info)   / 0.32); }
${scope} .badge--muted  { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }

/* Status dots */
${scope} .status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 999px;
  background: hsl(var(--muted-foreground));
  margin-right: 0.4rem; vertical-align: middle;
  box-shadow: 0 0 0 2px hsl(var(--card));
}
${scope} .status-dot--good   { background: rgb(var(--fr-good)); }
${scope} .status-dot--warn   { background: rgb(var(--fr-warn)); }
${scope} .status-dot--danger { background: rgb(var(--fr-danger)); }
${scope} .status-dot--info   { background: rgb(var(--fr-info)); }

/* Progress bars */
${scope} .progress {
  position: relative; height: 6px; width: 100%;
  background: hsl(var(--muted)); border-radius: 999px; overflow: hidden;
  margin: 0.35rem 0;
}
${scope} .progress__fill {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--fr-accent)), rgb(var(--fr-info)));
}
${scope} .progress--good   .progress__fill { background: rgb(var(--fr-good)); }
${scope} .progress--warn   .progress__fill { background: rgb(var(--fr-warn)); }
${scope} .progress--danger .progress__fill { background: rgb(var(--fr-danger)); }

/* Section card wrapper */
${scope} .section {
  border: 1px solid hsl(var(--border)); border-radius: var(--fr-radius);
  padding: 0.85rem 1rem; margin: 0.75rem 0;
  background: hsl(var(--card) / 0.55);
}
${scope} .section__title {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: hsl(var(--muted-foreground));
  margin: 0 0 0.5rem;
}

/* Two/three-column split */
${scope} .split {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;
  margin: 0.55rem 0;
}
${scope} .split--3 { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 640px) {
  ${scope} .split, ${scope} .split--3 { grid-template-columns: 1fr; }
}

/* Compact label/value pair list */
${scope} .meta {
  display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 0.85rem;
  font-size: 0.82rem; margin: 0.4rem 0;
}
${scope} .meta dt {
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: hsl(var(--muted-foreground)); margin: 0;
}
${scope} .meta dd { margin: 0; color: hsl(var(--foreground)); }
`;
}
