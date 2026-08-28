function requireEnv(name: string): string {
  const value = Bun.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string): string | null {
  const value = Bun.env[name];
  return value && value.length > 0 ? value : null;
}

function readStringList(envName: string): string[] {
  const raw = optionalEnv(envName);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${envName}: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${envName}: must be a JSON array of strings`);
  }

  const result: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      throw new Error(
        `Invalid ${envName}: every entry must be a string`,
      );
    }
    if (item.length > 0) {
      result.push(item);
    }
  }
  return result;
}

function readMapping(): Record<string, string> {
  const raw = optionalEnv("CURRENT_PROJECT_MAPPING");
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CURRENT_PROJECT_MAPPING: ${message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "Invalid CURRENT_PROJECT_MAPPING: must be a JSON object",
    );
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(
        `Invalid CURRENT_PROJECT_MAPPING: value for "${key}" must be a string`,
      );
    }
    result[key] = value;
  }
  return result;
}

export const config = {
  wakatime: {
    apiKey: requireEnv("WAKATIME_API_KEY"),
    baseUrl: "https://wakatime.com/api/v1",
  },
  github: {
    token: optionalEnv("GITHUB_TOKEN"),
    baseUrl: "https://api.github.com",
  },
  currentProject: {
    mapping: readMapping(),
  },
  techStack: {
    localRepoPaths: readStringList("LOCAL_REPOS_PATHS"),
  },
};