import { afterEach, describe, expect, mock, test } from "bun:test";

import { WakaTimeClient } from "../src/clients/wakatime.client";

describe("WakaTimeClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(
    status: number,
    body: string | object,
    options: { ok?: boolean } = {},
  ): Response {
    const isJson = typeof body === "object";
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { "Content-Type": isJson ? "application/json" : "text/plain" },
      ...options,
    });
  }

  test("returns parsed CodingActivity on success", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: RequestInit["headers"];

    globalThis.fetch = mock(async (input: string | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return mockResponse(200, {
        data: {
          total_seconds: 3600,
          human_readable_total: "1 hr 0 mins",
          languages: [
            { name: "TypeScript", total_seconds: 1800, percent: 50 },
            { name: "Rust", total_seconds: 1800, percent: 50 },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");
    const activity = await client.getLast7DaysActivity();

    expect(capturedUrl).toBe(
      "https://wakatime.com/api/v1/users/current/stats/last_7_days",
    );
    expect(capturedHeaders).toEqual({
      Authorization: `Basic ${btoa("test-key")}`,
    });
    expect(activity.totalSeconds).toBe(3600);
    expect(activity.text).toBe("1 hr 0 mins");
    expect(activity.languages).toHaveLength(2);
    expect(activity.languages[0]).toEqual({
      name: "TypeScript",
      totalSeconds: 1800,
      percentage: 50,
    });
  });

  test("throws on non-2xx HTTP response", async () => {
    globalThis.fetch = mock(async () => mockResponse(401, { error: "Unauthorized" })) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");

    expect(() => client.getLast7DaysActivity()).toThrow(
      "WakaTime request failed: 401",
    );
  });

  test("throws a clear error when the request times out", async () => {
    globalThis.fetch = mock(async (_input: string | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("Aborted")),
        );
      });
    }) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key", undefined, 20);

    await expect(client.getLast7DaysActivity()).rejects.toThrow(
      "WakaTime request timed out after 20ms",
    );
  });

  test("throws on invalid JSON response", async () => {
    globalThis.fetch = mock(async () => mockResponse(200, "not-json{")) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");

    expect(() => client.getLast7DaysActivity()).toThrow(
      "WakaTime response was not valid JSON",
    );
  });

  test("throws when response is missing data field", async () => {
    globalThis.fetch = mock(async () => mockResponse(200, { foo: "bar" })) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");

    expect(() => client.getLast7DaysActivity()).toThrow(
      "WakaTime response did not match expected schema",
    );
  });

  test("throws when a language entry is malformed", async () => {
    globalThis.fetch = mock(async () =>
      mockResponse(200, {
        data: {
          total_seconds: 100,
          human_readable_total: "1 min 40 secs",
          languages: [{ name: "Go", total_seconds: "not-a-number", percent: 100 }],
        },
      }),
    ) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");

    expect(() => client.getLast7DaysActivity()).toThrow(
      "WakaTime response did not match expected schema",
    );
  });

  test("accepts an empty languages array", async () => {
    globalThis.fetch = mock(async () =>
      mockResponse(200, {
        data: {
          total_seconds: 0,
          human_readable_total: "0 secs",
          languages: [],
        },
      }),
    ) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key");
    const activity = await client.getLast7DaysActivity();

    expect(activity.totalSeconds).toBe(0);
    expect(activity.languages).toEqual([]);
  });

  test("uses a custom baseUrl when provided", async () => {
    let capturedUrl: string | undefined;

    globalThis.fetch = mock(async (input: string | URL) => {
      capturedUrl = String(input);
      return mockResponse(200, {
        data: {
          total_seconds: 0,
          human_readable_total: "0 secs",
          languages: [],
        },
      });
    }) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key", "https://wakatime.example/api");
    await client.getLast7DaysActivity();

    expect(capturedUrl).toBe(
      "https://wakatime.example/api/users/current/stats/last_7_days",
    );
  });

  describe("getRecentProjectActivity", () => {
    test("returns mapped ProjectActivity list from stats endpoint", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: {
            total_seconds: 9000,
            human_readable_total: "2 hrs 30 mins",
            languages: [],
            projects: [
              {
                name: "my-app",
                total_seconds: 7200,
                percent: 80,
                last_heartbeat_at: "2024-01-05T10:00:00Z",
              },
              {
                name: "other",
                total_seconds: 1800,
                percent: 20,
                last_heartbeat_at: "2024-01-04T10:00:00Z",
              },
            ],
          },
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");
      const projects = await client.getRecentProjectActivity();

      expect(projects).toHaveLength(2);
      expect(projects[0]).toEqual({
        name: "my-app",
        totalSeconds: 7200,
        percent: 80,
        lastHeartbeatAt: "2024-01-05T10:00:00Z",
      });
    });

    test("returns empty array when no projects field is present", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: {
            total_seconds: 0,
            human_readable_total: "0 secs",
            languages: [],
          },
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");
      const projects = await client.getRecentProjectActivity();

      expect(projects).toEqual([]);
    });

    test("uses epoch zero when last_heartbeat_at is missing", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: {
            total_seconds: 100,
            human_readable_total: "1 min 40 secs",
            languages: [],
            projects: [
              { name: "x", total_seconds: 100, percent: 100 },
            ],
          },
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");
      const projects = await client.getRecentProjectActivity();

      expect(projects[0]?.lastHeartbeatAt).toBe(new Date(0).toISOString());
    });

    test("throws on non-2xx response", async () => {
      globalThis.fetch = mock(async () => mockResponse(403, { error: "Forbidden" })) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      expect(() => client.getRecentProjectActivity()).toThrow(
        "WakaTime request failed: 403",
      );
    });

    test("throws on invalid JSON", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, "not-json{")) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      expect(() => client.getRecentProjectActivity()).toThrow(
        "WakaTime response was not valid JSON",
      );
    });

    test("throws when project entry is malformed", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: {
            total_seconds: 100,
            human_readable_total: "1 min 40 secs",
            languages: [],
            projects: [{ name: "x", total_seconds: "not-a-number", percent: 100 }],
          },
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      expect(() => client.getRecentProjectActivity()).toThrow(
        "WakaTime response did not match expected schema",
      );
    });

    test("makes only one API request when both methods are called", async () => {
      let fetchCount = 0;

      globalThis.fetch = mock(async () => {
        fetchCount++;
        return mockResponse(200, {
          data: {
            total_seconds: 9000,
            human_readable_total: "2 hrs 30 mins",
            languages: [
              { name: "TypeScript", total_seconds: 9000, percent: 100 },
            ],
            projects: [
              {
                name: "my-app",
                total_seconds: 9000,
                percent: 100,
                last_heartbeat_at: "2024-01-05T10:00:00Z",
              },
            ],
          },
        });
      }) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await client.getLast7DaysActivity();
      await client.getRecentProjectActivity();
      await client.getLast7DaysActivity();

      expect(fetchCount).toBe(1);
    });

    test("retries after a failed request (cache is not sticky)", async () => {
      let fetchCount = 0;

      globalThis.fetch = mock(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return mockResponse(500, { error: "boom" });
        }
        return mockResponse(200, {
          data: {
            total_seconds: 0,
            human_readable_total: "0 secs",
            languages: [],
            projects: [],
          },
        });
      }) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await expect(
        client.getLast7DaysActivity(),
      ).rejects.toThrow("WakaTime request failed: 500");

      const activity = await client.getLast7DaysActivity();
      expect(activity.totalSeconds).toBe(0);
      expect(fetchCount).toBe(2);
    });
  });
});
