import { describe, expect, test } from "bun:test";

import {
  ManifestReader,
  type FileSystem,
} from "../src/clients/manifest-reader";

class MemoryFs implements FileSystem {
  constructor(private readonly files: Record<string, string>) {}

  async exists(path: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.files, path);
  }

  async readText(path: string): Promise<string> {
    const content = this.files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  }
}

describe("ManifestReader", () => {
  test("returns empty list when no repos are provided", async () => {
    const reader = new ManifestReader(new MemoryFs({}));
    const result = await reader.readFrameworks([]);
    expect(result).toEqual([]);
  });

  test("returns empty list when no manifest files exist in any repo", async () => {
    const reader = new ManifestReader(new MemoryFs({}));
    const result = await reader.readFrameworks(["/repo1", "/repo2"]);
    expect(result).toEqual([]);
  });

  test("extracts dependencies from package.json", async () => {
    const fs = new MemoryFs({
      "/repo/package.json": JSON.stringify({
        name: "demo",
        dependencies: {
          express: "^4.0.0",
          react: "^18.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      }),
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual(["express", "react", "typescript"]);
  });

  test("returns empty when package.json is invalid JSON", async () => {
    const fs = new MemoryFs({ "/repo/package.json": "{not json" });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual([]);
  });

  test("returns empty when package.json has no dependencies", async () => {
    const fs = new MemoryFs({
      "/repo/package.json": JSON.stringify({ name: "demo" }),
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual([]);
  });

  test("extracts dependencies from Cargo.toml", async () => {
    const fs = new MemoryFs({
      "/repo/Cargo.toml": `
[package]
name = "demo"

[dependencies]
tokio = "1.0"
serde = "1.0"

[dev-dependencies]
mockall = "0.11"
`,
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual(["mockall", "serde", "tokio"]);
  });

  test("extracts dependencies from pyproject.toml", async () => {
    const fs = new MemoryFs({
      "/repo/pyproject.toml": `
[project]
name = "demo"
fastapi = "^0.100.0"
pandas = "^2.0.0"
`,
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual(["fastapi", "pandas"]);
  });

  test("extracts dependencies from go.mod require block", async () => {
    const fs = new MemoryFs({
      "/repo/go.mod": `
module example.com/demo

go 1.21

require (
  github.com/gin-gonic/gin v1.9.0
  github.com/spf13/cobra v1.7.0
)
`,
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual(["github.com/gin-gonic/gin", "github.com/spf13/cobra"]);
  });

  test("extracts base image from Dockerfile", async () => {
    const fs = new MemoryFs({
      "/repo/Dockerfile": "FROM node:20-alpine\nRUN npm install\n",
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toContain("Docker");
    expect(result).toContain("node");
  });

  test("extracts image references from compose.yaml", async () => {
    const fs = new MemoryFs({
      "/repo/compose.yaml": `
services:
  web:
    image: nginx:latest
  db:
    image: postgres:15
`,
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toContain("Docker Compose");
    expect(result).toContain("nginx");
    expect(result).toContain("postgres");
  });

  test("aggregates frameworks across multiple repos, deduplicated", async () => {
    const fs = new MemoryFs({
      "/repo-a/package.json": JSON.stringify({
        dependencies: { react: "^18.0.0", express: "^4.0.0" },
      }),
      "/repo-b/package.json": JSON.stringify({
        dependencies: { react: "^18.0.0", vue: "^3.0.0" },
      }),
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo-a", "/repo-b"]);
    expect(result).toEqual(["express", "react", "vue"]);
  });

  test("skips manifest types not present in a given repo", async () => {
    const fs = new MemoryFs({
      "/repo/package.json": JSON.stringify({ dependencies: { react: "^18" } }),
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toEqual(["react"]);
  });

  test("also recognizes docker-compose.yml as compose file", async () => {
    const fs = new MemoryFs({
      "/repo/docker-compose.yml": `
services:
  web:
    image: redis:7
`,
    });
    const reader = new ManifestReader(fs);
    const result = await reader.readFrameworks(["/repo"]);
    expect(result).toContain("Docker Compose");
  });
});