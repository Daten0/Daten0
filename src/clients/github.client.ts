import type { GitHubRepo } from "../types/activity";

interface GitHubRepoResponse {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
}

interface GitHubLanguagesResponse {
  [language: string]: number;
}

function isGitHubRepoResponse(value: unknown): value is GitHubRepoResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.full_name === "string" &&
    typeof v.html_url === "string" &&
    (v.description === null || typeof v.description === "string") &&
    (v.language === null || typeof v.language === "string") &&
    typeof v.stargazers_count === "number"
  );
}

function isGitHubLanguagesResponse(
  value: unknown,
): value is GitHubLanguagesResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) {
    if (typeof v[key] !== "number") return false;
  }
  return true;
}

export class GitHubClient {
  constructor(
    private readonly token: string | null = null,
    private readonly baseUrl = "https://api.github.com",
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
          `GitHub request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new Error("GitHub response was not valid JSON");
    }
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    const response = await this.request(
      `${this.baseUrl}/repos/${owner}/${repo}`,
      { headers: this.buildHeaders() },
    );

    if (response.status === 404) {
      throw new Error(`GitHub repository not found: ${owner}/${repo}`);
    }

    if (!response.ok) {
      throw new Error(
        `GitHub request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await this.readJson(response);
    if (!isGitHubRepoResponse(body)) {
      throw new Error("GitHub response did not match expected schema");
    }

    return {
      fullName: body.full_name,
      htmlUrl: body.html_url,
      description: body.description,
      language: body.language,
      starCount: body.stargazers_count,
    };
  }

  async getRepositoryLanguages(
    owner: string,
    repo: string,
  ): Promise<string[]> {
    const response = await this.request(
      `${this.baseUrl}/repos/${owner}/${repo}/languages`,
      { headers: this.buildHeaders() },
    );

    if (response.status === 404) {
      throw new Error(`GitHub repository not found: ${owner}/${repo}`);
    }

    if (!response.ok) {
      throw new Error(
        `GitHub request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await this.readJson(response);
    if (!isGitHubLanguagesResponse(body)) {
      throw new Error("GitHub response did not match expected schema");
    }

    return Object.keys(body);
  }
}