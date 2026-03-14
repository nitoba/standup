import { describe, expect, it } from "vitest";
import { markdownToEmailHtml } from "./markdown-to-email-html";
import { LIGHT_THEME } from "./theme";

describe("markdownToEmailHtml", () => {
  it("converts headings with inline style", async () => {
    const html = await markdownToEmailHtml("# Title\n## Section", LIGHT_THEME);
    expect(html).toContain("<h1 style=");
    expect(html).toContain("<h2 style=");
    expect(html).toContain("Title");
    expect(html).toContain("Section");
  });

  it("converts paragraphs with inline style", async () => {
    const html = await markdownToEmailHtml("Hello world", LIGHT_THEME);
    expect(html).toContain("<p style=");
    expect(html).toContain("Hello world");
  });

  it("converts unordered lists with inline style", async () => {
    const html = await markdownToEmailHtml(
      "- item one\n- item two",
      LIGHT_THEME,
    );
    expect(html).toContain("<ul style=");
    expect(html).toContain("<li style=");
    expect(html).toContain("item one");
  });

  it("converts bold text with inline style", async () => {
    const html = await markdownToEmailHtml("**bold text**", LIGHT_THEME);
    expect(html).toContain("<strong style=");
    expect(html).toContain("bold text");
  });

  it("converts links with target=_blank and inline style", async () => {
    const html = await markdownToEmailHtml(
      "[click here](https://example.com)",
      LIGHT_THEME,
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("click here");
  });

  it("returns a string for empty input", async () => {
    const html = await markdownToEmailHtml("", LIGHT_THEME);
    expect(typeof html).toBe("string");
  });
});
