export function levenshtein(left: string, right: string): number {
  const source = Array.from(left);
  const target = Array.from(right);

  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  let current = new Array<number>(target.length + 1);

  for (let row = 1; row <= source.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= target.length; column += 1) {
      const substitution = previous[column - 1]! + (source[row - 1] === target[column - 1] ? 0 : 1);
      const deletion = previous[column]! + 1;
      const insertion = current[column - 1]! + 1;
      current[column] = Math.min(substitution, deletion, insertion);
    }
    [previous, current] = [current, previous];
  }

  return previous[target.length]!;
}

function defaultMaxDistance(input: string, candidate: string): number {
  const longest = Math.max(input.length, candidate.length);
  return longest <= 3 ? 1 : Math.min(3, Math.floor(longest / 3));
}

export interface SuggestOptions {
  maxDistance?: number;
}

export function suggest(input: string, candidates: readonly string[], options: SuggestOptions = {}): string | undefined {
  const needle = input.trim();
  if (needle === "") return undefined;

  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = levenshtein(needle.toLowerCase(), candidate.toLowerCase());
    if (
      best === undefined ||
      distance < best.distance ||
      (distance === best.distance && candidate < best.candidate)
    ) {
      best = { candidate, distance };
    }
  }

  if (best === undefined) return undefined;
  const maxDistance = options.maxDistance ?? defaultMaxDistance(needle, best.candidate);
  return best.distance <= maxDistance ? best.candidate : undefined;
}

export function didYouMean(input: string, candidates: readonly string[], options: SuggestOptions = {}): string | undefined {
  const candidate = suggest(input, candidates, options);
  return candidate === undefined ? undefined : `Did you mean "${candidate}"?`;
}
