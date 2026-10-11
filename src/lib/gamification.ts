import type { JournalEntry, MissionCompletion, WalkRecord } from './db';
import { missions, type NatureMission } from '../data/missions';

export const MISSION_XP = 10;
export const WALK_XP = 15;

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDailyMissions(date = new Date()): NatureMission[] {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - startOfYear.getTime()) / 86_400_000);
  const start = (dayOfYear * 3) % missions.length;
  return Array.from({ length: 3 }, (_, index) => missions[(start + index) % missions.length]!);
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

export function calculateAchievements(completions: MissionCompletion[], entries: JournalEntry[]): Achievement[] {
  const missionDays = new Set(completions.map((item) => item.localDate));
  const missionObservationIds = new Set(completions.filter((item) => Boolean(item.observation)).map((item) => `mission-observation:${item.id}`));
  const observerCount = completions.filter((item) => Boolean(item.observation)).length
    + entries.filter((entry) => entry.kind === 'observation' && !missionObservationIds.has(entry.id)).length;
  const definitions: Array<Omit<Achievement, 'unlocked' | 'progress'> & { value: number }> = [
    { id: 'first-steps', title: 'First Steps', description: 'Complete your first nature mission.', icon: 'seedling', value: completions.length, target: 1 },
    { id: 'nature-explorer', title: 'Nature Explorer', description: 'Complete five nature missions.', icon: 'compass', value: completions.length, target: 5 },
    { id: 'keen-observer', title: 'Keen Observer', description: 'Save five nature observations.', icon: 'eye', value: observerCount, target: 5 },
    { id: 'weekend-wanderer', title: 'Weekend Wanderer', description: 'Complete missions on three separate days.', icon: 'autumn', value: missionDays.size, target: 3 },
    { id: 'nature-enthusiast', title: 'Nature Enthusiast', description: 'Complete twenty nature missions.', icon: 'leaf', value: completions.length, target: 20 },
  ];
  return definitions.map(({ value, ...achievement }) => ({ ...achievement, progress: Math.min(value, achievement.target), unlocked: value >= achievement.target }));
}

export function calculateCurrentStreak(completions: MissionCompletion[], walks: WalkRecord[], now = new Date()): number {
  const activeDays = new Set([
    ...completions.map((record) => record.localDate),
    ...walks.map((record) => record.localDate),
  ]);
  const today = localDateKey(now);
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let cursor = activeDays.has(today) ? now : yesterdayDate;
  if (!activeDays.has(localDateKey(cursor))) return 0;
  let streak = 0;
  while (activeDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

export function getLocalWeekRange(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

export interface WeeklyRecap {
  start: Date;
  end: Date;
  missionsCompleted: number;
  discoveriesSaved: number;
  observationsRecorded: number;
  walkMinutes: number;
  favoriteDiscovery?: string;
  suggestedMission: NatureMission;
}

export function calculateWeeklyRecap(
  completions: MissionCompletion[],
  entries: JournalEntry[],
  walks: WalkRecord[],
  date = new Date(),
): WeeklyRecap {
  const { start, end } = getLocalWeekRange(date);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  const inWeek = (createdAt: string) => {
    const key = localDateKey(new Date(createdAt));
    return key >= startKey && key < endKey;
  };
  const weeklyCompletions = completions.filter((item) => item.localDate >= startKey && item.localDate < endKey);
  const weeklyEntries = entries.filter((entry) => inWeek(entry.createdAt));
  const discoveries = weeklyEntries.filter((entry) => entry.kind !== 'observation' && entry.kind !== 'walk');
  const observationsRecorded = weeklyEntries.filter((entry) => entry.kind === 'observation').length
    + weeklyCompletions.filter((item) => Boolean(item.observation) && !entries.some((entry) => entry.id === `mission-observation:${item.id}` && inWeek(entry.createdAt))).length;
  const labels = new Map<string, number>();
  for (const entry of discoveries) labels.set(entry.label, (labels.get(entry.label) ?? 0) + 1);
  const favorite = [...labels.entries()].sort((left, right) => right[1] - left[1])[0];
  const completedMissionIds = new Set(weeklyCompletions.map((item) => item.missionId));
  const suggestedMission = missions.find((mission) => !completedMissionIds.has(mission.id)) ?? missions[0]!;
  const walkMinutes = Math.floor(walks.filter((walk) => walk.localDate >= startKey && walk.localDate < endKey && walk.completed).reduce((total, walk) => total + walk.elapsedSeconds, 0) / 60);
  return {
    start,
    end,
    missionsCompleted: weeklyCompletions.length,
    discoveriesSaved: discoveries.length,
    observationsRecorded,
    walkMinutes,
    favoriteDiscovery: discoveries.length >= 2 ? favorite?.[0] : undefined,
    suggestedMission,
  };
}

export function getElapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
