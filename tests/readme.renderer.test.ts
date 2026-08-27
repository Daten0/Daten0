import { describe, expect, test } from "bun:test";

import { ReadmeRenderer } from "../src/renderers/readme.renderer";

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
});