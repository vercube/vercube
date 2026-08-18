/**
 * Matches a path against the devtools mount on whole path segments, so a mount
 * of `/_devtools` claims `/_devtools/api/graph` but never `/_devtools-admin`.
 *
 * @param path route or request pathname
 * @param mount resolved devtools mount path
 * @returns whether the path belongs to the devtools mount
 */
export function isUnderMount(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount}/`);
}
