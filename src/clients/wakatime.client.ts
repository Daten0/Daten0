import type {
  CodingActivity,
  LanguageActivity,
  ProjectActivity,
} from "../types/activity";

interface WakaTimeLanguage {
  name: string;
  total_seconds: number;
  percent: number;
}

interface WakaTimeProject {
  name: string;
  total_seconds: number;
  percent: number;
  last_heartbeat_at?: string;
}

interface WakaTimeStats {
  data: {
    total_seconds: number;
    human_readable_total: string;
    languages: WakaTimeLanguage[];
    projects?: WakaTimeProject[];
  };
}

function isWakaTimeLanguage(value: unknown): value is WakaTimeLanguage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.total_seconds === "number" &&
    typeof v.percent === "number"
  );
}

function isWakaTimeProject(value: unknown): value is WakaTimeProject {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== "string" ||
    typeof v.total_seconds !== "number" ||
    typeof v.percent !== "number"
  ) {
    return false;
  }
  if (
    v.last_heartbeat_at !== undefined &&
    typeof v.last_heartbeat_at !== "string"
  ) {
    return false;
  }
  return true;
}

function isWakaTimeStats(value: unknown): value is WakaTimeStats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const data = v.data as Record<string, unknown> | undefined;
  if (typeof data !== "object" || data === null) return false;
  if (
    typeof data.total_seconds !== "number" ||
    typeof data.human_readable_total !== "string" ||
    !Array.isArray(data.languages) ||
    !data.languages.every(isWakaTimeLanguage)
  ) {
    return false;
  }
  if (data.projects !== undefined) {
    if (!Array.isArray(data.projects)) return false;
    if (!data.projects.every(isWakaTimeProject)) return false;
  }
  return true;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("WakaTime response was not valid JSON");
  }
}

export class WakaTimeClient {
  private statsCache: Promise<WakaTimeStats> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://wakatime.com/api/v1",
    private readonly timeoutMs = 10_000,
  ) {}

  private async request(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `WakaTime request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchStats(): Promise<WakaTimeStats> {
    if (this.statsCache) {
      return this.statsCache;
    }

    this.statsCache = this.requestStats();

    try {
      return await this.statsCache;
    } catch (error) {
      this.statsCache = null;
      throw error;
    }
  }

  private async requestStats(): Promise<WakaTimeStats> {
    const response = await this.request(
      `${this.baseUrl}/users/current/stats/last_7_days`,
      {
        headers: {
          Authorization: `Basic ${btoa(this.apiKey)}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `WakaTime request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await readJson(response);
    if (!isWakaTimeStats(body)) {
      throw new Error("WakaTime response did not match expected schema");
    }

    return body;
  }

  async getLast7DaysActivity(): Promise<CodingActivity> {
    const body = await this.fetchStats();

    const languages: LanguageActivity[] = body.data.languages.map(
      (language) => ({
        name: language.name,
        totalSeconds: language.total_seconds,
        percentage: language.percent,
      }),
    );

    return {
      totalSeconds: body.data.total_seconds,
      text: body.data.human_readable_total,
      languages,
    };
  }

  async getRecentProjectActivity(): Promise<ProjectActivity[]> {
    const body = await this.fetchStats();

    const projects = body.data.projects ?? [];

    return projects.map((project) => ({
      name: project.name,
      totalSeconds: project.total_seconds,
      percent: project.percent,
      lastHeartbeatAt:
        project.last_heartbeat_at ?? new Date(0).toISOString(),
    }));
  }
}