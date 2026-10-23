const BINARY_SAMPLE_SIZE = 8 * 1024;

export function toLF(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function equalIgnoringEOL(left: string, right: string): boolean {
  return toLF(left) === toLF(right);
}

export function isBinary(data: Uint8Array): boolean {
  const end = Math.min(data.length, BINARY_SAMPLE_SIZE);
  for (let index = 0; index < end; index += 1) {
    if (data[index] === 0) return true;
  }
  return false;
}

export function isSingleLine(text: string): boolean {
  return !text.includes("\n") && !text.includes("\r");
}
