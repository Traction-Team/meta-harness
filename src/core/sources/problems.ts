import { redact } from "./redact.js";

/**
 * The fix for a fab entry a person cannot change locally: a path that escapes
 * or collides with `.factory/`, a duplicate entry, or an entry type a fab may
 * not carry. The person who runs `import` or `update` usually does not own the
 * fab, so the fix names both ends.
 */
export const FAB_ENTRY_FIX =
  "Remove or rename this entry in the fab and publish it again, or use another version of the fab";

/**
 * The fix for a link a fab may not carry. `publish` copies a link inside
 * `.factory/` as the content of its target, so a published fab has none.
 */
export const FAB_LINK_FIX =
  "Replace the link with the file it points to (metafab publish does this), or use another version of the fab";

/** The fix for a fab over a size limit, from the fab validation rules. */
export const FAB_SIZE_FIX =
  "Keep the fab within the limits (1 MB per file, 10,000 files, directories and links, 64 MiB in total), or use another version of the fab";

/** The fix for a tarball Metafab could not read or check. */
export const FAB_DOWNLOAD_FIX =
  "Run the command again; if it fails again, use another version of the fab";

/**
 * The fix for a link this machine refused to create. The fab is valid; the
 * account or the operating system stopped Metafab writing the link.
 */
export const LINK_CREATE_FIX =
  "Allow this account to create symbolic links (on Windows, turn on Developer Mode), then run the command again";

/**
 * A problem file that starts with a source label: redacted, `/`-separated on
 * every platform, no trailing `/`. A label is whatever the person typed or
 * recorded (a path, a URL, an npm name), so it may carry a credential and, on
 * Windows, backslashes. The contract forbids both in `file`, and the message
 * keeps the label as typed.
 */
export function sourceProblemFile(label: string, relativePath?: string): string {
  const base = redact(label).replace(/\\/g, "/").replace(/\/+$/, "");
  return relativePath === undefined || relativePath === ""
    ? base
    : `${base}/${relativePath.replace(/^\.\//, "")}`;
}
