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
    let normalizedBody = body;
    if (isJson && "data" in body) {
      const data = body.data;
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        normalizedBody = {
          ...body,
          data: {
            is_up_to_date: true,
            percent_calculated: 100,
            status: "ok",
            ...data,
          },
        };
      }
    }
    const text = typeof normalizedBody === "string"
      ? normalizedBody
      : JSON.stringify(normalizedBody);
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

  test("retries a stale stats response until it is current", async () => {
    let fetchCount = 0;
    globalThis.fetch = mock(async () => {
      fetchCount++;
      return mockResponse(200, {
        data: {
          total_seconds: 100,
          human_readable_total: "1 min 40 secs",
          languages: [],
          is_up_to_date: fetchCount > 1,
          percent_calculated: fetchCount > 1 ? 100 : 60,
        },
      });
    }) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key", undefined, 10_000, 0);
    const activity = await client.getLast7DaysActivity();

    expect(activity.totalSeconds).toBe(100);
    expect(fetchCount).toBe(2);
  });

  test("rejects stats that remain incomplete", async () => {
    globalThis.fetch = mock(async () =>
      mockResponse(200, {
        data: {
          total_seconds: 100,
          human_readable_total: "1 min 40 secs",
          languages: [],
          is_up_to_date: false,
          percent_calculated: 60,
        },
      }),
    ) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key", undefined, 10_000, 0);

    await expect(client.getLast7DaysActivity()).rejects.toThrow(
      "WakaTime stats are incomplete: 60% calculated",
    );
  });

  test("retries 202 responses and fails clearly when processing continues", async () => {
    let fetchCount = 0;
    globalThis.fetch = mock(async () => {
      fetchCount++;
      return mockResponse(202, {});
    }) as unknown as typeof fetch;

    const client = new WakaTimeClient("test-key", undefined, 10_000, 0);

    await expect(client.getLast7DaysActivity()).rejects.toThrow(
      "WakaTime stats are still being calculated",
    );
    expect(fetchCount).toBe(3);
  });

  describe("getRecentProjectActivity", () => {
    test("returns project recency from the projects endpoint", async () => {
      let capturedUrl: string | undefined;
      globalThis.fetch = mock(async (input: string | URL) => {
        capturedUrl = String(input);
        return mockResponse(200, {
          data: [
            {
              name: "my-app",
              last_heartbeat_at: "2024-01-05T10:00:00Z",
            },
            {
              name: "other",
              last_heartbeat_at: "2024-01-04T10:00:00Z",
            },
          ],
        });
      }) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");
      const projects = await client.getRecentProjectActivity();

      expect(capturedUrl).toBe(
        "https://wakatime.com/api/v1/users/current/projects",
      );
      expect(projects).toHaveLength(2);
      expect(projects[0]).toEqual({
        name: "my-app",
        lastHeartbeatAt: "2024-01-05T10:00:00Z",
      });
    });

    test("returns an empty array when no projects exist", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, { data: [] })) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");
      const projects = await client.getRecentProjectActivity();

      expect(projects).toEqual([]);
    });

    test("rejects a project without last_heartbeat_at", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: [{ name: "x" }],
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await expect(client.getRecentProjectActivity()).rejects.toThrow(
        "WakaTime projects response did not match expected schema",
      );
    });

    test("throws on non-2xx response", async () => {
      globalThis.fetch = mock(async () => mockResponse(403, { error: "Forbidden" })) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await expect(client.getRecentProjectActivity()).rejects.toThrow(
        "WakaTime request failed: 403",
      );
    });

    test("throws on invalid JSON", async () => {
      globalThis.fetch = mock(async () => mockResponse(200, "not-json{")) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await expect(client.getRecentProjectActivity()).rejects.toThrow(
        "WakaTime response was not valid JSON",
      );
    });

    test("rejects a malformed heartbeat timestamp", async () => {
      globalThis.fetch = mock(async () =>
        mockResponse(200, {
          data: [{ name: "x", last_heartbeat_at: "not-a-date" }],
        }),
      ) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await expect(client.getRecentProjectActivity()).rejects.toThrow(
        "WakaTime projects response did not match expected schema",
      );
    });

    test("caches projects separately from stats", async () => {
      let fetchCount = 0;

      globalThis.fetch = mock(async (input: string | URL) => {
        fetchCount++;
        if (String(input).endsWith("/projects")) {
          return mockResponse(200, {
            data: [{
              name: "my-app",
              last_heartbeat_at: "2024-01-05T10:00:00Z",
            }],
          });
        }
        return mockResponse(200, { data: {
          total_seconds: 9000,
          human_readable_total: "2 hrs 30 mins",
          languages: [
            { name: "TypeScript", total_seconds: 9000, percent: 100 },
          ],
        } });
      }) as unknown as typeof fetch;

      const client = new WakaTimeClient("test-key");

      await client.getLast7DaysActivity();
      await client.getRecentProjectActivity();
      await client.getLast7DaysActivity();
      await client.getRecentProjectActivity();

      expect(fetchCount).toBe(2);
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
