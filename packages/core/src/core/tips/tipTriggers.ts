// "Did You Know" Tier 1 (contextual nudge) trigger conditions — pure functions, each taking
// already-available screen state and returning whether that nudge is eligible to show right now. The
// caller (a mobile screen) still owns whether the specific fact has already been dismissed — see
// `apps/mobile/src/lib/tipsStorage.ts` — these only decide "is this the right MOMENT," not "have we
// already told them."

/** Transactions — nudge about bulk-hashtag once 3+ rows are selected. */
export function shouldNudgeBulkHashtag(selectedCount: number): boolean {
  return selectedCount >= 3;
}

/** Manage Tags — nudge about Set Aside once the user has a few tags but has never used it. */
export function shouldNudgeSetAside(tagCount: number, anyTagIsSetAside: boolean): boolean {
  return tagCount >= 3 && !anyTagIsSetAside;
}

/** Goals — nudge about linking a transaction to a goal, only once there's enough real tracked history
 *  for Penny's own suggestions to be meaningful (never a cold, data-free guess). */
export function shouldNudgeGoalLink(goalCount: number, monthsTracked: number): boolean {
  return goalCount === 0 && monthsTracked >= 2;
}
