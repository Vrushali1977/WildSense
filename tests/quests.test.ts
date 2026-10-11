import { describe, expect, it } from 'vitest';
import { countCompletedQuestIds, getQuestOfTheDay, quests } from '../src/data/quests';

describe('nature quests', () => {
  it('selects a stable quest for the same calendar day', () => {
    const date = new Date(2026, 4, 12, 9);
    expect(getQuestOfTheDay(date).id).toBe(getQuestOfTheDay(date).id);
    expect(quests.map(({ id }) => id)).toContain(getQuestOfTheDay(date).id);
  });

  it('counts known completed quests once and ignores stale ids', () => {
    expect(countCompletedQuestIds([quests[0]!.id, quests[0]!.id, quests[1]!.id, 'removed-quest'])).toBe(2);
  });
});
