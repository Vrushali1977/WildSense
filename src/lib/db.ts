export interface JournalEntry {
  id: string;
  label: string;
  createdAt: string;
  notes: string;
  image?: Blob;
  kind?: 'discovery' | 'observation' | 'walk';
  environment?: string;
  category?: string;
}

export interface QuestProgress {
  id: string;
  completedAt: string;
}

export interface MissionCompletion {
  id: string;
  missionId: string;
  title: string;
  completedAt: string;
  localDate: string;
  xp: number;
  category: string;
  observation?: string;
}

export interface WalkRecord {
  id: string;
  startedAt: number;
  completedAt: string;
  localDate: string;
  durationMinutes: number;
  elapsedSeconds: number;
  completed: true;
  xp: number;
  reflection?: string;
}

const DATABASE_NAME = 'wildsense-local';
const DATABASE_VERSION = 2;
const JOURNAL_STORE = 'journal';
const QUEST_STORE = 'quests';
const MISSION_STORE = 'mission-completions';
const WALK_STORE = 'completed-walks';
let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The local database request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('The local database transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('The local database transaction failed.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not provide local IndexedDB storage.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(JOURNAL_STORE)) {
        const store = database.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!database.objectStoreNames.contains(QUEST_STORE)) {
        database.createObjectStore(QUEST_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(MISSION_STORE)) {
        const store = database.createObjectStore(MISSION_STORE, { keyPath: 'id' });
        store.createIndex('localDate', 'localDate');
      }
      if (!database.objectStoreNames.contains(WALK_STORE)) {
        const store = database.createObjectStore(WALK_STORE, { keyPath: 'id' });
        store.createIndex('localDate', 'localDate');
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Could not open local storage.'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('Local storage is busy in another tab. Close older WildSense tabs and try again.'));
    };
  });
  return databasePromise;
}

async function withStore<T>(name: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(name, mode);
  const done = transactionDone(transaction);
  try {
    const result = await requestResult(action(transaction.objectStore(name)));
    await done;
    return result;
  } catch (error) {
    try { transaction.abort(); } catch { /* The transaction may already be finished. */ }
    await done.catch(() => undefined);
    throw error;
  }
}

export async function getJournalEntries(): Promise<JournalEntry[]> {
  const rows = await withStore<JournalEntry[]>(JOURNAL_STORE, 'readonly', (store) => store.getAll());
  return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function saveJournalEntry(entry: JournalEntry): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(JOURNAL_STORE, 'readwrite', (store) => store.put(entry));
}

export function deleteJournalEntry(id: string): Promise<undefined> {
  return withStore<undefined>(JOURNAL_STORE, 'readwrite', (store) => store.delete(id));
}

export async function getCompletedQuestIds(): Promise<string[]> {
  const rows = await withStore<QuestProgress[]>(QUEST_STORE, 'readonly', (store) => store.getAll());
  return rows.map((row) => row.id);
}

export function setQuestCompleted(id: string): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(QUEST_STORE, 'readwrite', (store) => store.put({ id, completedAt: new Date().toISOString() } satisfies QuestProgress));
}

export async function getMissionCompletions(): Promise<MissionCompletion[]> {
  return withStore<MissionCompletion[]>(MISSION_STORE, 'readonly', (store) => store.getAll());
}

/** Stores a mission reward and its optional observation in one transaction. */
export async function completeMission(record: MissionCompletion): Promise<boolean> {
  const database = await openDatabase();
  const transaction = database.transaction(record.observation ? [MISSION_STORE, JOURNAL_STORE] : [MISSION_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const missionStore = transaction.objectStore(MISSION_STORE);
  try {
    const existing = await requestResult(missionStore.get(record.id));
    if (existing) {
      await done;
      return false;
    }
    const added = requestResult(missionStore.add(record));
    let observationAdded: Promise<IDBValidKey> | undefined;
    if (record.observation) {
      const observation: JournalEntry = {
        id: `mission-observation:${record.id}`,
        label: `Observation · ${record.title}`,
        createdAt: record.completedAt,
        notes: record.observation,
        kind: 'observation',
        category: record.category,
      };
      observationAdded = requestResult(transaction.objectStore(JOURNAL_STORE).add(observation));
    }
    await added;
    if (observationAdded) await observationAdded;
    await done;
    return true;
  } catch (error) {
    try { transaction.abort(); } catch { /* The transaction may already be finished. */ }
    await done.catch(() => undefined);
    throw error;
  }
}

export async function getCompletedWalks(): Promise<WalkRecord[]> {
  return withStore<WalkRecord[]>(WALK_STORE, 'readonly', (store) => store.getAll());
}

export async function saveCompletedWalk(record: WalkRecord): Promise<boolean> {
  try {
    await withStore<IDBValidKey>(WALK_STORE, 'readwrite', (store) => store.add(record));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function clearAllLocalData(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([JOURNAL_STORE, QUEST_STORE, MISSION_STORE, WALK_STORE], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(JOURNAL_STORE).clear();
  transaction.objectStore(QUEST_STORE).clear();
  transaction.objectStore(MISSION_STORE).clear();
  transaction.objectStore(WALK_STORE).clear();
  await done;
}
