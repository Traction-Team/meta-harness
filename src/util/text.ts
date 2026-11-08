export function toLF(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function equalIgnoringEOL(left: string, right: string): boolean {
  return toLF(left) === toLF(right);
}

export function isSingleLine(text: string): boolean {
  return !text.includes("\n") && !text.includes("\r");
}
