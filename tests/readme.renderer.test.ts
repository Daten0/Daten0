import { describe, expect, test } from "bun:test";

import { ReadmeRenderer } from "../src/renderers/readme.renderer";
import type { CodingTimeSummary, TechStack } from "../src/types/activity";

describe("ReadmeRenderer", () => {
  const renderer = new ReadmeRenderer();

  test("replaces content inside a dynamic section", () => {
    const readme = `
# Profile

Before

<!-- TECH_STACK:START -->
Old content
<!-- TECH_STACK:END -->

After
`;

    const result = renderer.replaceSection(
      readme,
      "TECH_STACK",
      "Rust • TypeScript • Bun",
    );

    expect(result).toContain(
      `<!-- TECH_STACK:START -->
Rust • TypeScript • Bun
<!-- TECH_STACK:END -->`,
    );

    expect(result).toContain("Before");
    expect(result).toContain("After");
    expect(result).not.toContain("Old content");
  });

  test("throws when start marker is missing", () => {
    const readme = `
<!-- TECH_STACK:END -->
`;

    expect(() =>
      renderer.replaceSection(
        readme,
        "TECH_STACK",
        "Rust",
      ),
    ).toThrow("Missing start marker");
  });

  test("throws when end marker is missing", () => {
    const readme = `
<!-- TECH_STACK:START -->
`;

    expect(() =>
      renderer.replaceSection(
        readme,
        "TECH_STACK",
        "Rust",
      ),
    ).toThrow("Missing end marker");
  });

  test("throws when marker order is invalid", () => {
    const readme = `
<!-- TECH_STACK:END -->

content

<!-- TECH_STACK:START -->
`;

    expect(() =>
      renderer.replaceSection(
        readme,
        "TECH_STACK",
        "Rust",
      ),
    ).toThrow("Invalid marker order");
  });

  test("throws when the start marker appears more than once", () => {
    const readme = `
<!-- CODING_TIME:START -->
first block
<!-- CODING_TIME:END -->
<!-- CODING_TIME:START -->
second block
<!-- CODING_TIME:END -->
`;

    expect(() =>
      renderer.replaceSection(readme, "CODING_TIME", "Rust"),
    ).toThrow("Duplicate start marker");
  });

  test("throws when the end marker appears more than once", () => {
    const readme = `
<!-- CODING_TIME:START -->
content
<!-- CODING_TIME:END -->
<!-- CODING_TIME:END -->
`;

    expect(() =>
      renderer.replaceSection(readme, "CODING_TIME", "Rust"),
    ).toThrow("Duplicate end marker");
  });

  describe("renderCodingTime", () => {
    test("renders coding time with languages", () => {
      const summary: CodingTimeSummary = {
        totalSeconds: 3600,
        text: "1 hr 0 mins",
        languages: [
          { name: "TypeScript", totalSeconds: 1800, percentage: 50.0 },
          { name: "Rust", totalSeconds: 1080, percentage: 30.0 },
          { name: "Python", totalSeconds: 720, percentage: 20.0 },
        ],
      };

      const result = renderer.renderCodingTime(summary);

      expect(result).toContain("**Last 7 Days:** 1 hr 0 mins");
      expect(result).toContain("- **TypeScript** — 50.0%");
      expect(result).toContain("- **Rust** — 30.0%");
      expect(result).toContain("- **Python** — 20.0%");
    });

    test("renders zero coding activity message", () => {
      const summary: CodingTimeSummary = {
        totalSeconds: 0,
        text: "0 secs",
        languages: [],
      };

      const result = renderer.renderCodingTime(summary);

      expect(result).toBe("No coding activity tracked in the last 7 days.");
    });

    test("renders with empty languages array", () => {
      const summary: CodingTimeSummary = {
        totalSeconds: 100,
        text: "1 min 40 secs",
        languages: [],
      };

      const result = renderer.renderCodingTime(summary);

      expect(result).toContain("**Last 7 Days:** 1 min 40 secs");
      expect(result).not.toContain("- **");
    });

    test("formats percentages to one decimal place", () => {
      const summary: CodingTimeSummary = {
        totalSeconds: 1000,
        text: "16 mins 40 secs",
        languages: [
          { name: "Go", totalSeconds: 333, percentage: 33.333 },
          { name: "Java", totalSeconds: 667, percentage: 66.667 },
        ],
      };

      const result = renderer.renderCodingTime(summary);

      expect(result).toContain("- **Go** — 33.3%");
      expect(result).toContain("- **Java** — 66.7%");
    });

    test("escapes external language names and coding-time text", () => {
      const result = renderer.renderCodingTime({
        totalSeconds: 60,
        text: "1 min\n<!-- CODING_TIME:END -->",
        languages: [{
          name: "[Type](bad)<!-- TECH_STACK:END -->",
          totalSeconds: 60,
          percentage: 100,
        }],
      });

      expect(result).not.toContain("<!-- CODING_TIME:END -->");
      expect(result).not.toContain("<!-- TECH_STACK:END -->");
      expect(result).toContain("&lt;!-- CODING\\_TIME:END --&gt;");
    });

    test("renders all languages provided in summary", () => {
      const summary: CodingTimeSummary = {
        totalSeconds: 5000,
        text: "1 hr 23 mins",
        languages: [
          { name: "A", totalSeconds: 1000, percentage: 20.0 },
          { name: "B", totalSeconds: 1000, percentage: 20.0 },
          { name: "C", totalSeconds: 1000, percentage: 20.0 },
          { name: "D", totalSeconds: 1000, percentage: 20.0 },
          { name: "E", totalSeconds: 1000, percentage: 20.0 },
          { name: "F", totalSeconds: 100, percentage: 2.0 },
        ],
      };

      const result = renderer.renderCodingTime(summary);

      const languageLines = result.split("\n").filter((l) => l.startsWith("- **"));
      expect(languageLines).toHaveLength(6);
      expect(result).toContain("F");
    });
  });

  describe("renderCurrentProject", () => {
    test("returns fallback message when project is null", () => {
      const result = renderer.renderCurrentProject(null);
      expect(result).toBe("- 🔭 I'm currently between projects.");
    });

    test("renders project name without link when no repository", () => {
      const result = renderer.renderCurrentProject({
        name: "my-app",
        lastHeartbeatAt: "2024-01-01T00:00:00.000Z",
        repository: null,
      });

      expect(result).toBe(
        "- 🔭 I'm currently working on **my-app**",
      );
    });

    test("renders project name as link when repository is present", () => {
      const result = renderer.renderCurrentProject({
        name: "my-app",
        lastHeartbeatAt: "2024-01-01T00:00:00.000Z",
        repository: {
          fullName: "me/my-app",
          htmlUrl: "https://github.com/me/my-app",
          description: "An awesome app",
          language: "TypeScript",
          starCount: 5,
        },
      });

      expect(result).toBe(
        "- 🔭 I'm currently working on [**my-app**](https://github.com/me/my-app) — An awesome app",
      );
    });

    test("renders linked name without description suffix when description is null", () => {
      const result = renderer.renderCurrentProject({
        name: "my-app",
        lastHeartbeatAt: "2024-01-01T00:00:00.000Z",
        repository: {
          fullName: "me/my-app",
          htmlUrl: "https://github.com/me/my-app",
          description: null,
          language: "Go",
          starCount: 0,
        },
      });

      expect(result).toBe(
        "- 🔭 I'm currently working on [**my-app**](https://github.com/me/my-app)",
      );
      expect(result).not.toContain(" — ");
    });

    test("normalizes and escapes external project text", () => {
      const result = renderer.renderCurrentProject({
        name: "[private](bad)\n<!-- CURRENT_PROJECT:END -->",
        lastHeartbeatAt: "2024-01-01T00:00:00.000Z",
        repository: {
          fullName: "me/public",
          htmlUrl: "https://github.com/me/public",
          description: "line one\n**line two**",
          language: "TypeScript",
          starCount: 0,
        },
      });

      expect(result).not.toContain("<!-- CURRENT_PROJECT:END -->");
      expect(result).not.toContain("\n");
      expect(result).toContain("\\[private\\]\\(bad\\)");
      expect(result).toContain("\\*\\*line two\\*\\*");
    });
  });

  describe("renderTechStack", () => {
    test("returns placeholder message when hasData is false", () => {
      const result = renderer.renderTechStack({
        languages: [],
        frameworks: [],
        hasData: false,
      });

      expect(result).toContain("Recently Used technologies will appear here");
    });

    test("renders languages with badges when present", () => {
      const result = renderer.renderTechStack({
        languages: [
          { name: "TypeScript", source: "wakatime" },
          { name: "Rust", source: "github" },
        ],
        frameworks: [],
        hasData: true,
      });

      expect(result).toContain("**Languages (Recently Used)**");
      expect(result).toContain("img.shields.io/badge/");
      expect(result).toContain("TypeScript");
      expect(result).toContain("Rust");
    });

    test("renders frameworks with badges when present", () => {
      const result = renderer.renderTechStack({
        languages: [],
        frameworks: [
          { name: "React", source: "manifest" },
          { name: "Express", source: "manifest" },
        ],
        hasData: true,
      });

      expect(result).toContain("**Frameworks & Tools (Recently Used)**");
      expect(result).toContain("img.shields.io/badge/");
      expect(result).toContain("React");
      expect(result).toContain("Express");
    });

    test("renders both languages and frameworks sections", () => {
      const result = renderer.renderTechStack({
        languages: [{ name: "Go", source: "wakatime" }],
        frameworks: [{ name: "Docker", source: "manifest" }],
        hasData: true,
      });

      expect(result).toContain("**Languages (Recently Used)**");
      expect(result).toContain("**Frameworks & Tools (Recently Used)**");
      expect(result).toContain("Go");
      expect(result).toContain("Docker");
    });

    test("badge URLs use correct format with style=for-the-badge", () => {
      const result = renderer.renderTechStack({
        languages: [{ name: "TypeScript", source: "wakatime" }],
        frameworks: [],
        hasData: true,
      });

      expect(result).toMatch(
        /img\.shields\.io\/badge\/TypeScript-[A-F0-9]{6}\?style=for-the-badge/,
      );
    });

    test("escapes HTML special characters in badge alt attribute", () => {
      const result = renderer.renderTechStack({
        languages: [{ name: `C"<script>`, source: "wakatime" }],
        frameworks: [],
        hasData: true,
      });

      expect(result).toContain('alt="C&quot;&lt;script&gt;"');
      expect(result).not.toContain(`alt="C"<script>"`);
    });

    test("does not render languages section when empty", () => {
      const result = renderer.renderTechStack({
        languages: [],
        frameworks: [{ name: "React", source: "manifest" }],
        hasData: true,
      });

      expect(result).not.toContain("**Languages");
      expect(result).toContain("**Frameworks & Tools");
    });

    test("does not render frameworks section when empty", () => {
      const result = renderer.renderTechStack({
        languages: [{ name: "Go", source: "wakatime" }],
        frameworks: [],
        hasData: true,
      });

      expect(result).toContain("**Languages");
      expect(result).not.toContain("**Frameworks & Tools");
    });
  });
});
