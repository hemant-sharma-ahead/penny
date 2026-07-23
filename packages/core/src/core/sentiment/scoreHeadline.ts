// Pure, deterministic headline scorer (Phase A). No AI, no network, no state.
// Walks the tokens once, applying VADER-style negation + intensifier windows, and sums signed
// lexicon weights. Output is a descriptive lean (positive/negative/neutral) + the matched terms
// for an explainable "why" popover. See docs/MARKET_SENTIMENT_RESEARCH.md.

import { tokenize } from './normalize';
import { POSITIVE, NEGATIVE, INTENSIFIERS, NEGATORS, EFFECT_WINDOW } from './lexicon';
import type { ScoredHeadline, SentimentLabel, MatchedTerm } from './types';

/** Score >= this leans positive; <= -this leans negative; between is neutral. */
const LABEL_THRESHOLD = 1;

function labelFor(score: number): SentimentLabel {
  if (score >= LABEL_THRESHOLD) return 'positive';
  if (score <= -LABEL_THRESHOLD) return 'negative';
  return 'neutral';
}

/**
 * Score a single headline. Pure function of its text (title only in Phase A).
 * - a negator within `EFFECT_WINDOW` tokens before a sentiment word flips its polarity,
 * - an intensifier within the same window scales its magnitude.
 */
export function scoreHeadline(text: string): ScoredHeadline {
  const tokens = tokenize(text);
  let score = 0;
  const matched: MatchedTerm[] = [];

  // Distance (in tokens) since the last negator / intensifier; Infinity = out of range.
  let sinceNegator = Infinity;
  let intensifier = 1;
  let sinceIntensifier = Infinity;

  for (const token of tokens) {
    const base = POSITIVE[token] ?? (NEGATIVE[token] !== undefined ? -NEGATIVE[token] : undefined);

    if (base !== undefined) {
      let weight = base;
      if (sinceIntensifier <= EFFECT_WINDOW) weight *= intensifier;
      if (sinceNegator <= EFFECT_WINDOW) weight *= -1;

      score += weight;
      matched.push({ term: token, polarity: weight >= 0 ? 'positive' : 'negative', weight });

      // Consume the modifiers so they don't bleed onto later words.
      sinceNegator = Infinity;
      sinceIntensifier = Infinity;
      intensifier = 1;
    }

    // Update modifier state AFTER processing this token.
    if (NEGATORS.has(token)) sinceNegator = 0;
    else if (sinceNegator !== Infinity) sinceNegator += 1;

    if (INTENSIFIERS[token] !== undefined) {
      intensifier = INTENSIFIERS[token] as number;
      sinceIntensifier = 0;
    } else if (sinceIntensifier !== Infinity) {
      sinceIntensifier += 1;
    }
  }

  return { score, label: labelFor(score), matched };
}
