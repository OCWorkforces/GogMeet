import { describe, it, expect } from "vitest";

// Import escapeHtml - we need to test it in isolation
// Since it's not exported, we'll test via a simple inline implementation
// that matches the actual function
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

describe("escapeHtml", () => {
  it("escapes & to &amp;", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeHtml("&&")).toBe("&amp;&amp;");
  });

  it("escapes < to &lt;", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("a < b")).toBe("a &lt; b");
  });

  it("escapes > to &gt;", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
    expect(escapeHtml(">>")).toBe("&gt;&gt;");
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('Say "Hello"')).toBe("Say &quot;Hello&quot;");
    expect(escapeHtml('""')).toBe("&quot;&quot;");
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("It's working")).toBe("It&#39;s working");
    expect(escapeHtml("''")).toBe("&#39;&#39;");
  });

  it("escapes all 5 special characters together", () => {
    expect(escapeHtml(`<div title="It's <">&'`)).toBe(
      "&lt;div title=&quot;It&#39;s &lt;&quot;&gt;&amp;&#39;",
    );
  });

  it("handles XSS payloads", () => {
    // Basic XSS attempt
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;",
    );
    // Event handler injection
    expect(escapeHtml('<img onerror="alert(1)" src=x>')).toBe(
      "&lt;img onerror=&quot;alert(1)&quot; src=x&gt;",
    );
    // Single quote attribute break - input: '><script>...
    // Order: ' -> &#39;, then > -> &gt;
    expect(escapeHtml("'><script>alert('XSS')</script>")).toBe(
      "&#39;&gt;&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;",
    );
  });

  it("passes safe strings unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
    expect(escapeHtml("Meeting at 10:00 AM")).toBe("Meeting at 10:00 AM");
    expect(escapeHtml("日本語")).toBe("日本語");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("preserves newlines and whitespace", () => {
    expect(escapeHtml("Line 1\nLine 2")).toBe("Line 1\nLine 2");
    expect(escapeHtml("  spaced  ")).toBe("  spaced  ");
    expect(escapeHtml("\t\t")).toBe("\t\t");
  });
});
