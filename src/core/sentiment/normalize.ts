// Headline text normalization for the sentiment engine. Pure, no dependencies.
// Lowercases, keeps intra-word apostrophes (so "n't" survives for negation), and tokenizes on
// everything else. Deliberately simple and deterministic — no stemming, no AI.

/** Split a headline into lowercase word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'") // normalize curly apostrophes
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, '')) // trim stray leading/trailing apostrophes
    .filter(Boolean);
}
