import { describe, expect, test } from "bun:test";

import { parseRepoSlug } from "../src/services/project-mapping";

describe("parseRepoSlug", () => {
  test("returns owner and repository for a valid slug", () => {
    expect(parseRepoSlug("owner/repo.name")).toEqual(["owner", "repo.name"]);
  });

  test("rejects extra path segments", () => {
    expect(parseRepoSlug("owner/repo/extra")).toBeNull();
  });

  test("rejects URL query and fragment characters", () => {
    expect(parseRepoSlug("owner/repo?tab=readme")).toBeNull();
    expect(parseRepoSlug("owner/repo#readme")).toBeNull();
  });

  test("rejects missing path components", () => {
    expect(parseRepoSlug("owner/")).toBeNull();
    expect(parseRepoSlug("/repo")).toBeNull();
  });
});
