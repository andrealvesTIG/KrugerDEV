// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

let isSafeImageSrc: typeof import("../client/src/components/jarvis/FridayReportCard").isSafeImageSrc;
let sanitizeReportHtml: typeof import("../client/src/components/jarvis/FridayReportCard").sanitizeReportHtml;
let tryParseFridayReport: typeof import("../client/src/components/jarvis/FridayReportCard").tryParseFridayReport;

beforeAll(async () => {
  const mod = await import("../client/src/components/jarvis/FridayReportCard");
  isSafeImageSrc = mod.isSafeImageSrc;
  sanitizeReportHtml = mod.sanitizeReportHtml;
  tryParseFridayReport = mod.tryParseFridayReport;
});

describe("isSafeImageSrc", () => {
  it("rejects protocol-relative URLs", () => {
    expect(isSafeImageSrc("//evil.com/a.png")).toBe(false);
  });
  it("rejects external http(s) origins", () => {
    expect(isSafeImageSrc("https://evil.com/a.png")).toBe(false);
    expect(isSafeImageSrc("http://evil.com/a.png")).toBe(false);
  });
  it("rejects javascript: URLs", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });
  it("rejects empty src", () => {
    expect(isSafeImageSrc("")).toBe(false);
  });
  it("allows root-relative same-origin paths", () => {
    expect(isSafeImageSrc("/img/logo.png")).toBe(true);
  });
  it("allows data:image/* URIs", () => {
    expect(isSafeImageSrc("data:image/png;base64,AAAA")).toBe(true);
  });
  it("rejects non-image data URIs", () => {
    expect(isSafeImageSrc("data:text/html,<script>")).toBe(false);
  });
});

describe("sanitizeReportHtml", () => {
  it("strips <script> tags", () => {
    const out = sanitizeReportHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeReportHtml('<p onclick="alert(1)">hi</p>');
    expect(out).not.toContain("onclick");
  });

  it("neutralises javascript: hrefs on anchors", () => {
    const out = sanitizeReportHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/href=["']javascript:/i);
  });

  it("hardens external links with target=_blank rel=noopener", () => {
    const out = sanitizeReportHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener");
  });

  it("removes images with external src", () => {
    const out = sanitizeReportHtml('<img src="https://evil.com/a.png" />');
    expect(out).not.toContain("evil.com");
  });

  it("removes images with protocol-relative src", () => {
    const out = sanitizeReportHtml('<img src="//evil.com/a.png" />');
    expect(out).not.toContain("evil.com");
  });

  it("preserves data:image/ src", () => {
    const out = sanitizeReportHtml('<img src="data:image/png;base64,AAAA" />');
    expect(out).toContain("data:image/png");
  });

  it("strips disallowed style properties (position, url())", () => {
    const out = sanitizeReportHtml(
      '<div style="position:fixed; color:red; background:url(http://x/y.png)">x</div>',
    );
    expect(out).not.toMatch(/position\s*:/i);
    expect(out).not.toMatch(/url\s*\(/i);
    expect(out).toMatch(/color\s*:\s*red/i);
  });

  it("strips iframe and form elements", () => {
    // Note: no `src` on iframe — happy-dom would otherwise try to load it
    // and emit an unhandled rejection from inside the test harness.
    const out = sanitizeReportHtml('<iframe></iframe><form><input/></form>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
  });

  it("preserves safe table markup", () => {
    const out = sanitizeReportHtml(
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    );
    expect(out).toContain("<table");
    expect(out).toContain("<th");
    expect(out).toContain("<td");
  });
});

describe("tryParseFridayReport", () => {
  it("parses well-formed JSON header + HTML body", () => {
    const block = `{"title":"Q3 Status","subtitle":"Marketing"}\n---\n<h1>Hello</h1><p>x</p>`;
    const parsed = tryParseFridayReport(block);
    expect(parsed?.title).toBe("Q3 Status");
    expect(parsed?.subtitle).toBe("Marketing");
    expect(parsed?.html).toContain("<h1>Hello</h1>");
  });

  it("supports header.html field when no separator present", () => {
    const block = `{"title":"R","html":"<p>inline</p>"}`;
    const parsed = tryParseFridayReport(block);
    expect(parsed?.title).toBe("R");
    expect(parsed?.html).toBe("<p>inline</p>");
  });

  it("returns null on malformed JSON", () => {
    expect(tryParseFridayReport(`not json\n---\n<p>x</p>`)).toBeNull();
  });

  it("returns null when title is missing", () => {
    const block = `{"subtitle":"x"}\n---\n<p>x</p>`;
    expect(tryParseFridayReport(block)).toBeNull();
  });

  it("returns null when body is empty", () => {
    const block = `{"title":"R"}\n---\n   `;
    expect(tryParseFridayReport(block)).toBeNull();
  });

  it("preserves generatedAt when present", () => {
    const block = `{"title":"R","generatedAt":"2025-10-14T09:00:00Z"}\n---\n<p>x</p>`;
    const parsed = tryParseFridayReport(block);
    expect(parsed?.generatedAt).toBe("2025-10-14T09:00:00Z");
  });
});
