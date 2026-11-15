import { pathToFileURL } from "node:url";

/**
 * The npm dist-tag a package version publishes under.
 *
 * A prerelease publishes under `next` and every other version under `latest`,
 * so `npx @seasb/metafab` never installs a prerelease. A `+<build>` part alone
 * does not make a prerelease.
 *
 * `npm publish` refuses a prerelease version without `--tag` on npm 11, and an
 * older npm would move `latest` to it, so the release workflow always passes
 * the tag this script prints:
 *
 *   node .github/scripts/dist-tag.mjs 2.0.0-next.1   # next
 *
 * It has no dependencies: the workflow runs it from a checkout, not from the
 * built package.
 */

/** A semantic version, from semver.org: `major.minor.patch`, optional `-prerelease` and `+build`. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * The dist-tag for `version`: `next` when it has a prerelease part, else
 * `latest`. Throws on anything that is not a semantic version, so a malformed
 * `package.json` version stops the release instead of publishing somewhere
 * unexpected.
 *
 * @param {string} version
 * @returns {"next" | "latest"}
 */
export function distTag(version) {
  const match = SEMVER.exec(version);
  if (match === null) {
    throw new Error(`not a semantic version: ${JSON.stringify(version)}`);
  }
  // match[4] is the prerelease part. match[5], the build part, may be there on
  // its own and still leaves the version a stable one.
  return match[4] === undefined ? "latest" : "next";
}

// Only the command line prints: importing the module has no side effects.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${distTag(process.argv[2])}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
