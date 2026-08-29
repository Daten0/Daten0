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
  last_heartbeat_at: string;
}

interface WakaTimeStats {
  data: {
    total_seconds: number;
    human_readable_total: string;
    languages: WakaTimeLanguage[];
    is_up_to_date: boolean;
    percent_calculated: number;
    status: string;
  };
}

interface WakaTimeProjects {
  data: WakaTimeProject[];
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
  return (
    typeof v.name === "string" &&
    typeof v.last_heartbeat_at === "string" &&
    !Number.isNaN(Date.parse(v.last_heartbeat_at))
  );
}

function isWakaTimeStats(value: unknown): value is WakaTimeStats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const data = v.data as Record<string, unknown> | undefined;
  if (typeof data !== "object" || data === null) return false;
  if (
    typeof data.total_seconds !== "number" ||
    typeof data.human_readable_total !== "string" ||
    typeof data.is_up_to_date !== "boolean" ||
    typeof data.percent_calculated !== "number" ||
    typeof data.status !== "string" ||
    !Array.isArray(data.languages) ||
    !data.languages.every(isWakaTimeLanguage)
  ) {
    return false;
  }
  return true;
}

function isWakaTimeProjects(value: unknown): value is WakaTimeProjects {
  if (typeof value !== "object" || value === null) return false;
  const data = (value as Record<string, unknown>).data;
  return Array.isArray(data) && data.every(isWakaTimeProject);
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
  private projectsCache: Promise<WakaTimeProjects> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://wakatime.com/api/v1",
    private readonly timeoutMs = 10_000,
    private readonly retryDelayMs = 500,
    private readonly maxStatsAttempts = 3,
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
    for (let attempt = 1; attempt <= this.maxStatsAttempts; attempt++) {
      const response = await this.request(
        `${this.baseUrl}/users/current/stats/last_7_days`,
        {
          headers: {
            Authorization: `Basic ${btoa(this.apiKey)}`,
          },
        },
      );

      if (response.status === 202) {
        if (attempt < this.maxStatsAttempts) {
          await Bun.sleep(this.retryDelayMs);
          continue;
        }
        throw new Error("WakaTime stats are still being calculated");
      }

      if (!response.ok) {
        throw new Error(
          `WakaTime request failed: ${response.status} ${response.statusText}`,
        );
      }

      const body = await readJson(response);
      if (!isWakaTimeStats(body)) {
        throw new Error("WakaTime response did not match expected schema");
      }

      if (!body.data.is_up_to_date || body.data.percent_calculated < 100) {
        if (attempt < this.maxStatsAttempts) {
          await Bun.sleep(this.retryDelayMs);
          continue;
        }
        throw new Error(
          `WakaTime stats are incomplete: ${body.data.percent_calculated}% calculated`,
        );
      }

      return body;
    }

    throw new Error("WakaTime stats could not be loaded");
  }

  private async fetchProjects(): Promise<WakaTimeProjects> {
    if (this.projectsCache) return this.projectsCache;

    this.projectsCache = this.requestProjects();
    try {
      return await this.projectsCache;
    } catch (error) {
      this.projectsCache = null;
      throw error;
    }
  }

  private async requestProjects(): Promise<WakaTimeProjects> {
    const response = await this.request(
      `${this.baseUrl}/users/current/projects`,
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
    if (!isWakaTimeProjects(body)) {
      throw new Error(
        "WakaTime projects response did not match expected schema",
      );
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
    const body = await this.fetchProjects();
    return body.data.map((project) => ({
      name: project.name,
      lastHeartbeatAt: project.last_heartbeat_at,
    }));
  }
}
