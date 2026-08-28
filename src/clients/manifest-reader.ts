import { access, readFile } from "fs/promises";
import { join } from "path";

export class ManifestReader {
  constructor(private readonly fsAdapter: FileSystem = defaultFsAdapter) {}

  async readFrameworks(repoPaths: string[]): Promise<string[]> {
    const found = new Set<string>();

    for (const repoPath of repoPaths) {
      const names = await this.readFrameworksFromRepo(repoPath);
      for (const name of names) {
        found.add(name);
      }
    }

    return [...found].sort();
  }

  private async readFrameworksFromRepo(repoPath: string): Promise<string[]> {
    const detected: string[] = [];

    const tasks: Array<Promise<void>> = [];

    for (const parser of parsers) {
      tasks.push(
        (async () => {
          const filePath = join(repoPath, parser.filename);
          if (!(await this.fsAdapter.exists(filePath))) return;
          const content = await this.fsAdapter.readText(filePath);
          for (const name of parser.parse(content)) {
            detected.push(name);
          }
        })(),
      );
    }

    await Promise.all(tasks);
    return detected;
  }
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
}

const defaultFsAdapter: FileSystem = {
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async readText(path) {
    return readFile(path, "utf8");
  },
};

interface ManifestParser {
  filename: string;
  parse(content: string): string[];
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function parsePackageJson(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];

  const v = parsed as Record<string, unknown>;
  const collected: string[] = [];

  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = v[key];
    if (typeof section !== "object" || section === null) continue;
    for (const name of Object.keys(section as Record<string, unknown>)) {
      collected.push(name);
    }
  }

  return uniqueSorted(collected);
}

function parseCargoToml(content: string): string[] {
  const deps: string[] = [];
  let inDependencies = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inDependencies =
        line === "[dependencies]" ||
        line === "[dev-dependencies]" ||
        line === "[build-dependencies]";
      continue;
    }
    if (!inDependencies) continue;
    if (line.startsWith("#") || line.length === 0) continue;

    const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (match && match[1]) {
      deps.push(match[1]);
    }
  }

  return uniqueSorted(deps);
}

const METADATA_FIELDS = new Set([
  "name",
  "version",
  "description",
  "readme",
  "authors",
  "license",
  "classifiers",
  "requires-python",
  "dependencies",
  "optional-dependencies",
  "dynamic",
  "urls",
  "scripts",
  "gui-scripts",
  "entry-points",
]);

function looksLikeVersion(value: string): boolean {
  const v = value.trim().replace(/^["']|["']$/g, "");
  return /^[\^~>=<]?\d/.test(v);
}

function parsePyprojectToml(content: string): string[] {
  const deps: string[] = [];
  let inProject = false;
  let inProjectDeps = false;
  let inToolDeps = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inProject = line === "[project]" || line.startsWith("project.");
      inProjectDeps =
        line.startsWith("project.dependencies") ||
        line.startsWith("project.optional-dependencies");
      inToolDeps =
        line.startsWith("[tool.poetry") ||
        line === "[tool.poetry.dependencies]" ||
        line === "[tool.poetry.group.dev.dependencies]";
      continue;
    }
    if (line.startsWith("#") || line.length === 0) continue;
    if (!(inProject || inProjectDeps || inToolDeps)) continue;

    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (match && match[1]) {
      const key = match[1];
      const value = match[2]?.trim();
      if (inProjectDeps || inToolDeps) {
        deps.push(key);
      } else if (inProject && !METADATA_FIELDS.has(key)) {
        // Heuristic: if value looks like a version spec, treat as dependency
        if (value && looksLikeVersion(value)) {
          deps.push(key);
        }
      }
    }
  }

  return uniqueSorted(deps);
}

function parseGoMod(content: string): string[] {
  const deps: string[] = [];
  let inRequire = false;
  let depth = 0;

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("//")) continue;

    if (trimmed === "require (") {
      inRequire = true;
      depth = 1;
      continue;
    }

    if (inRequire) {
      if (trimmed.includes("(")) depth++;
      if (trimmed.includes(")")) {
        depth--;
        if (depth === 0) {
          inRequire = false;
          continue;
        }
      }
      const match = trimmed.match(/^\s*([A-Za-z0-9_\-/.]+)\s+v[\d.]+/);
      if (match && match[1]) {
        deps.push(match[1]);
      }
    }
  }

  return uniqueSorted(deps);
}

function parseDockerfile(content: string): string[] {
  const found = new Set<string>();
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*FROM\s+([^\s]+)/i);
    if (match && match[1]) {
      found.add("Docker");
      const image = match[1];
      const base = image.split(":")[0]?.split("/").pop();
      if (base) found.add(base);
    }
  }
  return [...found].sort();
}

function parseComposeYaml(content: string): string[] {
  const found = new Set<string>();
  if (/^\s*services:/m.test(content)) {
    found.add("Docker Compose");
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*image:\s*["']?([^"'\s]+)/);
    if (match && match[1]) {
      found.add("Docker Compose");
      const base = match[1].split(":")[0]?.split("/").pop();
      if (base) found.add(base);
    }
  }
  return [...found].sort();
}

const parsers: ManifestParser[] = [
  { filename: "package.json", parse: parsePackageJson },
  { filename: "Cargo.toml", parse: parseCargoToml },
  { filename: "pyproject.toml", parse: parsePyprojectToml },
  { filename: "go.mod", parse: parseGoMod },
  { filename: "Dockerfile", parse: parseDockerfile },
  { filename: "compose.yaml", parse: parseComposeYaml },
  { filename: "docker-compose.yml", parse: parseComposeYaml },
];