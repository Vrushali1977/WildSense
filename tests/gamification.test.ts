import { describe, expect, it } from 'vitest';
import type { JournalEntry, MissionCompletion, WalkRecord } from '../src/lib/db';
import { calculateAchievements, calculateCurrentStreak, calculateWeeklyRecap, getDailyMissions, getElapsedSeconds, getLocalWeekRange, localDateKey, MISSION_XP } from '../src/lib/gamification';
import { remainingAtDeadline, resumeDeadline } from '../src/lib/walkTimer';

const mission = (id: string, day: string, observation?: string): MissionCompletion => ({ id, missionId: 'leaf-shapes', title: 'Three kinds of leaf', completedAt: `${day}T12:00:00`, localDate: day, xp: MISSION_XP, category: 'Plants', ...(observation ? { observation } : {}) });
const entry = (id: string, label: string, date: string, kind: JournalEntry['kind'] = 'discovery'): JournalEntry => ({ id, label, notes: '', createdAt: date, kind });

describe('mission schedule and achievement calculations', () => {
  it('selects three curated local missions deterministically', () => {
    const date = new Date(2026, 5, 4, 9);
    expect(getDailyMissions(date)).toEqual(getDailyMissions(date));
    expect(getDailyMissions(date)).toHaveLength(3);
    expect(getDailyMissions(date).every((item) => item.instructions.length > 0)).toBe(true);
  });

  it('unlocks milestones from persisted completion and observation records only', () => {
    const completions = ['2026-06-06', '2026-06-13', '2026-06-20', '2026-06-08', '2026-06-09'].map((day, i) => mission(`${i}`, day));
    const badges = calculateAchievements(completions, Array.from({ length: 5 }, (_, i) => entry(`${i}`, 'Observation', '2026-06-09T12:00:00', 'observation')));
    expect(badges.filter((item) => item.unlocked).map((item) => item.id)).toEqual(['first-steps', 'nature-explorer', 'keen-observer', 'weekend-wanderer']);
    expect(badges.find((item) => item.id === 'nature-enthusiast')?.progress).toBe(5);
    const missionObservations = Array.from({ length: 5 }, (_, index) => ({ ...mission(String(index), `2026-06-0${index + 1}`, 'A saved field note') }));
    expect(calculateAchievements(missionObservations, []).find((item) => item.id === 'keen-observer')?.unlocked).toBe(true);
  });

  it('counts the current streak using local calendar dates and breaks after a missed day', () => {
    const now = new Date(2026, 5, 8, 8);
    expect(calculateCurrentStreak([mission('a', '2026-06-06'), mission('b', '2026-06-07'), mission('c', '2026-06-08')], [], now)).toBe(3);
    expect(calculateCurrentStreak([mission('a', '2026-06-05')], [], now)).toBe(0);
    const walk: WalkRecord = { id: 'walk', startedAt: 1, completedAt: '2026-06-08T07:00:00', localDate: '2026-06-08', durationMinutes: 5, elapsedSeconds: 300, completed: true, xp: 15 };
    expect(calculateCurrentStreak([], [walk], now)).toBe(1);
  });

  it('uses Monday-to-Monday local week boundaries', () => {
    const { start, end } = getLocalWeekRange(new Date(2026, 5, 7, 23));
    expect(localDateKey(start)).toBe('2026-06-01');
    expect(localDateKey(end)).toBe('2026-06-08');
  });

  it('builds the recap only from actual activity and leaves favorite empty without enough records', () => {
    const date = new Date(2026, 5, 3, 12);
    const completions = [mission('a', '2026-06-02', 'Mottled green')];
    const entries = [entry('discovery', 'fern', '2026-06-02T09:00:00'), entry('mission-observation:a', 'Nature observation', '2026-06-02T10:00:00', 'observation')];
    const walks: WalkRecord[] = [{ id: 'w', startedAt: 0, completedAt: '2026-06-02T12:10:00', localDate: '2026-06-02', durationMinutes: 10, elapsedSeconds: 600, completed: true, xp: 15 }];
    const recap = calculateWeeklyRecap(completions, entries, walks, date);
    expect(recap).toMatchObject({ missionsCompleted: 1, discoveriesSaved: 1, observationsRecorded: 1, walkMinutes: 10, favoriteDiscovery: undefined });
    const empty = calculateWeeklyRecap([], [], [], date);
    expect(empty).toMatchObject({ missionsCompleted: 0, discoveriesSaved: 0, observationsRecorded: 0, walkMinutes: 0 });
  });

  it('calculates timer elapsed seconds without accumulating interval drift', () => {
    expect(getElapsedSeconds(1_000, 8_999)).toBe(7);
    expect(getElapsedSeconds(2_000, 1_000)).toBe(0);
  });

  it('preserves remaining time through a pause and resume', () => {
    const deadline = 30_000;
    const pauseTime = 11_000;
    const remaining = remainingAtDeadline(deadline, pauseTime);
    const resumedDeadline = resumeDeadline(50_000, remaining);
    expect(remaining).toBe(19_000);
    expect(remainingAtDeadline(resumedDeadline, 60_000)).toBe(9_000);
    expect(remainingAtDeadline(resumedDeadline, 70_000)).toBe(0);
  });
});
