import { describe, expect, it } from 'vitest';
import { shouldNudgeBulkHashtag, shouldNudgeSetAside, shouldNudgeGoalLink } from '@/core/tips/tipTriggers';

describe('shouldNudgeBulkHashtag', () => {
  it('is false below 3 selected', () => {
    expect(shouldNudgeBulkHashtag(0)).toBe(false);
    expect(shouldNudgeBulkHashtag(2)).toBe(false);
  });

  it('is true at 3+ selected', () => {
    expect(shouldNudgeBulkHashtag(3)).toBe(true);
    expect(shouldNudgeBulkHashtag(10)).toBe(true);
  });
});

describe('shouldNudgeSetAside', () => {
  it('is false with fewer than 3 tags', () => {
    expect(shouldNudgeSetAside(2, false)).toBe(false);
  });

  it('is false once any tag is already Set Aside, regardless of tag count', () => {
    expect(shouldNudgeSetAside(5, true)).toBe(false);
  });

  it('is true at 3+ tags with none marked Set Aside', () => {
    expect(shouldNudgeSetAside(3, false)).toBe(true);
  });
});

describe('shouldNudgeGoalLink', () => {
  it('is false with an existing goal, regardless of months tracked', () => {
    expect(shouldNudgeGoalLink(1, 12)).toBe(false);
  });

  it('is false with no goal but under 2 months tracked', () => {
    expect(shouldNudgeGoalLink(0, 1)).toBe(false);
  });

  it('is true with no goal and 2+ months tracked', () => {
    expect(shouldNudgeGoalLink(0, 2)).toBe(true);
    expect(shouldNudgeGoalLink(0, 6)).toBe(true);
  });
});
