import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../../src/shared/utils/escape-html.js";

/**
 * Complementary edge-case coverage for escapeHtml.
 *
 * The base behaviour (each of the 5 special characters, common XSS payloads,
 * safe-string passthrough) is covered by tests/renderer/escape-html.test.ts.
 * This file exercises additional invariants critical to the renderer's XSS
 * boundary (idempotence on already-escaped strings, attribute-context
 * payloads, javascript:/data: scheme strings, mixed/unicode content).
 */
describe("escapeHtml — invariants", () => {
  it("does NOT decode already-escaped entities (escape is one-way)", () => {
    // Already-escaped input must be re-escaped: & is escaped first, so
    // "&amp;" becomes "&amp;amp;". This guarantees double-pass safety.
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    expect(escapeHtml("&#39;")).toBe("&amp;#39;");
  });

  it("escapes & first to avoid corrupting later replacements", () => {
    // If < were escaped first, the output would contain "&lt;" and the
    // subsequent & replacement would corrupt it to "&amp;lt;". Verify that
    // a leading & followed by < produces the correct ordered output.
    expect(escapeHtml("&<")).toBe("&amp;&lt;");
    expect(escapeHtml("&>")).toBe("&amp;&gt;");
  });

  it("is deterministic: same input always produces same output", () => {
    const input = '<div class="x">a & b</div>';
    expect(escapeHtml(input)).toBe(escapeHtml(input));
  });
});

describe("escapeHtml — attribute-context XSS", () => {
  it("neutralises double-quote attribute breakouts", () => {
    // Renderer uses pattern: title="${escapeHtml(value)}". A value
    // containing " would otherwise close the attribute and inject new ones.
    const evil = '" onerror="alert(1)';
    const out = escapeHtml(evil);
    expect(out).not.toContain('"');
    expect(out).toBe("&quot; onerror=&quot;alert(1)");
  });

  it("neutralises single-quote attribute breakouts", () => {
    const evil = "' onerror='alert(1)";
    const out = escapeHtml(evil);
    expect(out).not.toContain("'");
    expect(out).toBe("&#39; onerror=&#39;alert(1)");
  });

  it("escapes both quote types when mixed", () => {
    const out = escapeHtml(`a"b'c`);
    expect(out).toBe("a&quot;b&#39;c");
  });
});

describe("escapeHtml — payload passthrough", () => {
  it("does NOT strip javascript: URL strings (only escapes special chars)", () => {
    // escapeHtml is XSS-safe for HTML context but does not validate URLs.
    // URL validation lives in main/utils/url-validation.ts.
    const payload = "javascript:alert(1)";
    expect(escapeHtml(payload)).toBe("javascript:alert(1)");
  });

  it("does NOT strip data: URL strings", () => {
    const payload = "data:text/html,<script>alert(1)</script>";
    expect(escapeHtml(payload)).toBe(
      "data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("does NOT modify backslashes or forward slashes", () => {
    expect(escapeHtml("a/b\\c")).toBe("a/b\\c");
  });

  it("does NOT modify equals signs, colons, or parentheses", () => {
    expect(escapeHtml("foo(bar)=baz:qux")).toBe("foo(bar)=baz:qux");
  });
});

describe("escapeHtml — unicode and length", () => {
  it("preserves multi-byte unicode characters", () => {
    expect(escapeHtml("Café résumé")).toBe("Café résumé");
    expect(escapeHtml("日本語テスト")).toBe("日本語テスト");
    expect(escapeHtml("Tiếng Việt")).toBe("Tiếng Việt");
  });

  it("preserves emoji (surrogate pairs)", () => {
    expect(escapeHtml("📅 Meeting 🎥")).toBe("📅 Meeting 🎥");
    expect(escapeHtml("⚡ Auto")).toBe("⚡ Auto");
  });

  it("escapes special chars even when surrounded by unicode", () => {
    expect(escapeHtml("📅<script>日本</script>")).toBe(
      "📅&lt;script&gt;日本&lt;/script&gt;",
    );
  });

  it("handles long strings without corruption", () => {
    const long = "a&b".repeat(1000);
    const out = escapeHtml(long);
    expect(out.length).toBe("a&amp;b".length * 1000);
    expect(out.startsWith("a&amp;ba&amp;b")).toBe(true);
  });
});

describe("escapeHtml — null-byte and control characters", () => {
  it("preserves null bytes (does not strip)", () => {
    expect(escapeHtml("a\0b")).toBe("a\0b");
  });

  it("preserves control characters (does not strip)", () => {
    expect(escapeHtml("a\x01b\x1Fc")).toBe("a\x01b\x1Fc");
  });

  it("preserves carriage returns and form feeds", () => {
    expect(escapeHtml("a\rb\fc")).toBe("a\rb\fc");
  });
});

describe("escapeHtml — complex real-world payloads", () => {
  it("escapes meeting title with company name and quotes", () => {
    const title = `O'Reilly & Sons — "Q4 Review" <urgent>`;
    expect(escapeHtml(title)).toBe(
      "O&#39;Reilly &amp; Sons — &quot;Q4 Review&quot; &lt;urgent&gt;",
    );
  });

  it("escapes meeting description with HTML-like content", () => {
    const desc = "Agenda: 1) <intro> 2) Q&A 3) <wrap-up>";
    expect(escapeHtml(desc)).toBe(
      "Agenda: 1) &lt;intro&gt; 2) Q&amp;A 3) &lt;wrap-up&gt;",
    );
  });

  it("escapes calendar name with ampersand", () => {
    expect(escapeHtml("Work & Personal")).toBe("Work &amp; Personal");
  });

  it("escapes a polyglot XSS payload", () => {
    // Variant of the classic Brachiosaurus polyglot reduced to HTML-context.
    const polyglot = `'"--></style></script><script>alert(1)</script>`;
    const out = escapeHtml(polyglot);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</style>");
    expect(out).not.toContain('"');
    expect(out).not.toContain("'");
  });
});
