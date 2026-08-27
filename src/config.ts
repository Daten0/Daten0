function requireEnv(name: string): string {
  const value = Bun.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  wakatime: {
    apiKey: requireEnv("WAKATIME_API_KEY"),
    baseUrl: "https://wakatime.com/api/v1",
  },
};