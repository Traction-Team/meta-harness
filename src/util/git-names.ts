/**
 * The code points HFS+ ignores inside a name, exactly as Git's `next_hfs_char`
 * skips them: a name that reads as `.git` only after they are dropped is still
 * `.git` to a Mac.
 */
const HFS_IGNORABLE = /[\u200c\u200d\u200e\u200f\u202a-\u202e\u206a-\u206f\ufeff]/g;

/**
 * Names Git reads as `.git`, matched the way Git's own `verify_path` matches:
 * case-insensitively, after the trailing spaces and periods NTFS and HFS
 * ignore, after the code points HFS+ ignores entirely, with the `:` stream
 * suffix NTFS drops, and including the 8.3 short name a Windows filesystem
 * reports for `.git`.
 */
export function isDotGitName(name: string): boolean {
  // `is_hfs_dotgit`: the ignorable code points are not part of the name.
  if (name.replace(HFS_IGNORABLE, "").toLowerCase() === ".git") return true;

  // `is_ntfs_dotgit`: a stream suffix ends the name, then spaces and periods.
  const stream = name.indexOf(":");
  const semantic = (stream === -1 ? name : name.slice(0, stream))
    .replace(/[ .]+$/, "")
    .toLowerCase();
  return semantic === ".git" || semantic === "git~1";
}
