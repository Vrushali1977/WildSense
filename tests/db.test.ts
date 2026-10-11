import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, completeMission, deleteJournalEntry, getCompletedQuestIds, getCompletedWalks, getJournalEntries, getMissionCompletions, saveCompletedWalk, saveJournalEntry, setQuestCompleted, type MissionCompletion, type WalkRecord } from '../src/lib/db';

afterEach(async () => {
  await clearAllLocalData();
});

describe('local IndexedDB persistence', () => {
  it('stores journal notes and image blobs and returns newest entries first', async () => {
    const older = { id: 'old', label: 'oak leaf', createdAt: '2026-01-01T00:00:00.000Z', notes: 'Ribbed edges', image: new Blob(['photo'], { type: 'image/jpeg' }) };
    const newer = { id: 'new', label: 'fern', createdAt: '2026-02-01T00:00:00.000Z', notes: 'By the path' };
    await saveJournalEntry(older);
    await saveJournalEntry(newer);

    const entries = await getJournalEntries();
    expect(entries.map(({ id }) => id)).toEqual(['new', 'old']);
    expect(entries[1]?.notes).toBe('Ribbed edges');
    expect(entries[1]?.image?.size).toBe(5);
  });

  it('persists quest completion and supports deleting an entry', async () => {
    await saveJournalEntry({ id: 'one', label: 'cloud', createdAt: '2026-03-01T00:00:00.000Z', notes: '' });
    await setQuestCompleted('cloud-watch');
    await deleteJournalEntry('one');

    expect(await getJournalEntries()).toEqual([]);
    expect(await getCompletedQuestIds()).toEqual(['cloud-watch']);
  });

  it('clears both stores together', async () => {
    await saveJournalEntry({ id: 'one', label: 'moss', createdAt: '2026-03-01T00:00:00.000Z', notes: '' });
    await setQuestCompleted('textures');
    await clearAllLocalData();

    expect(await getJournalEntries()).toEqual([]);
    expect(await getCompletedQuestIds()).toEqual([]);
  });

  it('awards a mission once and atomically stores its optional observation', async () => {
    const record: MissionCompletion = { id: '2026-06-01:leaf-shapes', missionId: 'leaf-shapes', title: 'Three kinds of leaf', completedAt: '2026-06-01T10:00:00.000Z', localDate: '2026-06-01', xp: 10, category: 'Plants', observation: 'Edges looked serrated' };
    expect(await completeMission(record)).toBe(true);
    expect(await completeMission(record)).toBe(false);
    expect(await getMissionCompletions()).toEqual([record]);
    expect(await getJournalEntries()).toEqual([{
      id: `mission-observation:${record.id}`,
      label: `Observation · ${record.title}`,
      createdAt: record.completedAt,
      notes: 'Edges looked serrated',
      kind: 'observation',
      category: 'Plants',
    }]);
  });

  it('stores only unique completed walk records', async () => {
    const walk: WalkRecord = { id: 'walk-one', startedAt: 1_000, completedAt: '2026-06-01T10:10:00.000Z', localDate: '2026-06-01', durationMinutes: 10, elapsedSeconds: 600, completed: true, xp: 15 };
    expect(await saveCompletedWalk(walk)).toBe(true);
    expect(await saveCompletedWalk(walk)).toBe(false);
    expect(await getCompletedWalks()).toEqual([walk]);
  });
});
