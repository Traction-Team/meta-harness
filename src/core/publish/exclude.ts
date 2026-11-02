import picomatch from "picomatch";

function semanticPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * Matches `publish.exclude` globs against paths relative to `.factory/`.
 *
 * A glob that matches a directory also matches every path below it, so
 * `skills/our-api` and `skills/our-api/**` both leave the skill out. `dot: true`
 * is required because `.factory/` itself is a dot directory and a skill may
 * carry a dot file.
 */
export function exclusionMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  const matchers = patterns
    .map(semanticPath)
    .filter((pattern) => pattern !== "")
    .map((pattern) => picomatch(pattern, { dot: true }));
  if (matchers.length === 0) return () => false;

  return (relativePath: string): boolean => {
    const relative = semanticPath(relativePath);
    if (matchers.some((matches) => matches(relative))) return true;

    const segments = relative.split("/");
    for (let depth = segments.length - 1; depth > 0; depth -= 1) {
      if (matchers.some((matches) => matches(segments.slice(0, depth).join("/")))) return true;
    }
    return false;
  };
}
