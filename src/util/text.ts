export function toLF(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function equalIgnoringEOL(left: string, right: string): boolean {
  return toLF(left) === toLF(right);
}

export function isSingleLine(text: string): boolean {
  return !text.includes("\n") && !text.includes("\r");
}

/**
 * True when the text has at least one line break and every `\n` is preceded by
 * `\r`: the file uses CRLF throughout, with no LF-only line.
 */
export function usesCRLF(text: string): boolean {
  if (!text.includes("\n")) return false;
  return !text.replace(/\r\n/g, "").includes("\n");
}
