export type ProjectRepoMapping = Record<string, string>;

const REPO_PART = /^[A-Za-z0-9._-]+$/;

export function parseRepoSlug(
  value: string | undefined,
): [owner: string, repo: string] | null {
  if (!value) return null;

  const parts = value.split("/");
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    !parts.every((part) => REPO_PART.test(part))
  ) {
    return null;
  }

  return [parts[0], parts[1]];
}
