import { afterEach, describe, expect, mock, test } from "bun:test";

import { GitHubClient } from "../src/clients/github.client";

describe("GitHubClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(status: number, body: string | object): Response {
    const isJson = typeof body === "object";
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { "Content-Type": isJson ? "application/json" : "text/plain" },
    });
  }

  test("returns GitHubRepo on success", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: RequestInit["headers"];

    globalThis.fetch = mock(async (input: string | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return mockResponse(200, {
        full_name: "octocat/Hello-World",
        html_url: "https://github.com/octocat/Hello-World",
        description: "My first repo",
        language: "Go",
        stargazers_count: 42,
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient();
    const repo = await client.getRepository("octocat", "Hello-World");

    expect(capturedUrl).toBe("https://api.github.com/repos/octocat/Hello-World");
    expect(capturedHeaders).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    expect(repo).toEqual({
      fullName: "octocat/Hello-World",
      htmlUrl: "https://github.com/octocat/Hello-World",
      description: "My first repo",
      language: "Go",
      starCount: 42,
    });
  });

  test("throws a clear error when the request times out", async () => {
    globalThis.fetch = mock(async (_input: string | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("Aborted")),
        );
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient("test-token", undefined, 20);

    await expect(
      client.getRepository("octocat", "Hello-World"),
    ).rejects.toThrow("GitHub request timed out after 20ms");
  });

  test("includes Authorization header when token is provided", async () => {
    let capturedHeaders: RequestInit["headers"];

    globalThis.fetch = mock(async (_input: string | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return mockResponse(200, {
        full_name: "x/y",
        html_url: "https://github.com/x/y",
        description: null,
        language: null,
        stargazers_count: 0,
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient("secret-token");
    await client.getRepository("x", "y");

    const headerRecord = capturedHeaders as Record<string, string>;
    expect(headerRecord.Authorization).toBe("Bearer secret-token");
  });

  test("throws on 404 with helpful message", async () => {
    globalThis.fetch = mock(async () => mockResponse(404, { message: "Not Found" })) as unknown as typeof fetch;

    const client = new GitHubClient();

    expect(() => client.getRepository("missing", "repo")).toThrow(
      "GitHub repository not found: missing/repo",
    );
  });

  test("throws on other non-2xx responses", async () => {
    globalThis.fetch = mock(async () => mockResponse(500, { message: "boom" })) as unknown as typeof fetch;

    const client = new GitHubClient();

    expect(() => client.getRepository("x", "y")).toThrow(
      "GitHub request failed: 500",
    );
  });

  test("throws on invalid JSON response", async () => {
    globalThis.fetch = mock(async () => mockResponse(200, "not-json{")) as unknown as typeof fetch;

    const client = new GitHubClient();

    expect(() => client.getRepository("x", "y")).toThrow(
      "GitHub response was not valid JSON",
    );
  });

  test("throws when response does not match schema", async () => {
    globalThis.fetch = mock(async () => mockResponse(200, { foo: "bar" })) as unknown as typeof fetch;

    const client = new GitHubClient();

    expect(() => client.getRepository("x", "y")).toThrow(
      "GitHub response did not match expected schema",
    );
  });

  test("rejects a repository URL outside the expected GitHub path", async () => {
    globalThis.fetch = mock(async () =>
      mockResponse(200, {
        full_name: "x/y",
        html_url: "https://example.com/x/y)<!-- CURRENT_PROJECT:END -->",
        description: null,
        language: null,
        stargazers_count: 0,
      }),
    ) as unknown as typeof fetch;

    const client = new GitHubClient();

    await expect(client.getRepository("x", "y")).rejects.toThrow(
      "GitHub response did not match expected schema",
    );
  });

  test("accepts null description and language", async () => {
    globalThis.fetch = mock(async () =>
      mockResponse(200, {
        full_name: "x/y",
        html_url: "https://github.com/x/y",
        description: null,
        language: null,
        stargazers_count: 0,
      }),
    ) as unknown as typeof fetch;

    const client = new GitHubClient();
    const repo = await client.getRepository("x", "y");

    expect(repo.description).toBeNull();
    expect(repo.language).toBeNull();
  });

  test("uses a custom baseUrl when provided", async () => {
    let capturedUrl: string | undefined;

    globalThis.fetch = mock(async (input: string | URL) => {
      capturedUrl = String(input);
      return mockResponse(200, {
        full_name: "x/y",
        html_url: "https://github.com/x/y",
        description: null,
        language: null,
        stargazers_count: 0,
      });
    }) as unknown as typeof fetch;

    const client = new GitHubClient(null, "https://gh.example/api");
    await client.getRepository("x", "y");

    expect(capturedUrl).toBe("https://gh.example/api/repos/x/y");
  });

  describe("getRepositoryLanguages", () => {
    test("returns array of language names", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          TypeScript: 12345,
          Rust: 6789,
          Go: 4321,
        }),
      ) as unknown as typeof fetch;

      const client = new GitHubClient();
      const languages = await client.getRepositoryLanguages("octocat", "Hello-World");

      expect(languages).toEqual(["TypeScript", "Rust", "Go"]);
    });

    test("returns empty array for empty repo", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, {})) as unknown as typeof fetch;

      const client = new GitHubClient();
      const languages = await client.getRepositoryLanguages("octocat", "empty");

      expect(languages).toEqual([]);
    });

    test("throws on 404", async () => {
      globalThis.fetch = mock(async () => mockResponse(404, { message: "Not Found" })) as unknown as typeof fetch;

      const client = new GitHubClient();

      await expect(
        client.getRepositoryLanguages("missing", "repo"),
      ).rejects.toThrow("GitHub repository not found: missing/repo");
    });

    test("throws on non-2xx", async () => {
      globalThis.fetch = mock(async () => mockResponse(500, { message: "boom" })) as unknown as typeof fetch;

      const client = new GitHubClient();

      await expect(
        client.getRepositoryLanguages("x", "y"),
      ).rejects.toThrow("GitHub request failed: 500");
    });

    test("throws on invalid JSON", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, "not-json{")) as unknown as typeof fetch;

      const client = new GitHubClient();

      await expect(
        client.getRepositoryLanguages("x", "y"),
      ).rejects.toThrow("GitHub response was not valid JSON");
    });

    test("throws when response is not an object", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, ["not", "an", "object"])) as unknown as typeof fetch;

      const client = new GitHubClient();

      await expect(
        client.getRepositoryLanguages("x", "y"),
      ).rejects.toThrow("GitHub response did not match expected schema");
    });

    test("uses custom baseUrl when provided", async () => {
      let capturedUrl: string | undefined;

      globalThis.fetch = mock(async (input: string | URL) => {
        capturedUrl = String(input);
        return mockResponse(200, { TypeScript: 100 });
      }) as unknown as typeof fetch;

      const client = new GitHubClient(null, "https://gh.example/api");
      await client.getRepositoryLanguages("x", "y");

      expect(capturedUrl).toBe("https://gh.example/api/repos/x/y/languages");
    });

    test("includes Authorization header when token provided", async () => {
      let capturedHeaders: RequestInit["headers"];

      globalThis.fetch = mock(async (_input: string | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return mockResponse(200, { Rust: 100 });
      }) as unknown as typeof fetch;

      const client = new GitHubClient("secret-token");
      await client.getRepositoryLanguages("x", "y");

      const headerRecord = capturedHeaders as Record<string, string>;
      expect(headerRecord.Authorization).toBe("Bearer secret-token");
    });
  });
});
