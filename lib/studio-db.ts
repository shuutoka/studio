import {
  normalizeProject,
  normalizeSettings,
  type StudioMedia,
  type StudioProject,
  type StudioSettings,
} from "@/lib/studio";

const DATABASE_NAME = "enfer-fatal-studio";
const DATABASE_VERSION = 4;
const PROJECT_STORE = "projects";
const MEDIA_STORE = "media";
const SETTINGS_STORE = "settings";
const WRITING_SESSION_STORE = "writing-sessions";

export type StoredWritingSession = {
  id: string;
  projectId: string;
  volumeId: string;
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
  selection: unknown | null;
  updatedAt: string;
};

function writingSessionId(projectId: string, volumeId: string) {
  return `${projectId}:${volumeId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        const store = database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(WRITING_SESSION_STORE)) {
        const store = database.createObjectStore(WRITING_SESSION_STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Stockage indisponible"));
  });
}

export async function loadProjects(): Promise<StudioProject[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_STORE).getAll();
    request.onsuccess = () => {
      try { resolve(request.result.map(normalizeProject)); } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function loadSettings(): Promise<StudioSettings> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SETTINGS_STORE, "readonly");
    const request = transaction.objectStore(SETTINGS_STORE).get("studio-settings");
    request.onsuccess = () => resolve(normalizeSettings(request.result));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function persistProjects(projects: StudioProject[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    const store = transaction.objectStore(PROJECT_STORE);
    projects.forEach((project) => store.put(project));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function persistSettings(settings: StudioSettings) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put(settings);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function loadWritingSession(projectId: string, volumeId: string) {
  const database = await openDatabase();
  return new Promise<StoredWritingSession | null>((resolve, reject) => {
    const transaction = database.transaction(WRITING_SESSION_STORE, "readonly");
    const request = transaction.objectStore(WRITING_SESSION_STORE).get(writingSessionId(projectId, volumeId));
    request.onsuccess = () => resolve((request.result as StoredWritingSession | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function persistWritingSession(
  session: Omit<StoredWritingSession, "id" | "updatedAt">,
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WRITING_SESSION_STORE, "readwrite");
    transaction.objectStore(WRITING_SESSION_STORE).put({
      ...session,
      id: writingSessionId(session.projectId, session.volumeId),
      updatedAt: new Date().toISOString(),
    } satisfies StoredWritingSession);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function deleteWritingSession(projectId: string, volumeId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WRITING_SESSION_STORE, "readwrite");
    transaction.objectStore(WRITING_SESSION_STORE).delete(writingSessionId(projectId, volumeId));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function persistMedia(media: StudioMedia | StudioMedia[]) {
  const items = Array.isArray(media) ? media : [media];
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    items.forEach((item) => store.put(item));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function loadMedia(mediaId: string): Promise<StudioMedia | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const request = transaction.objectStore(MEDIA_STORE).get(mediaId);
    request.onsuccess = () => resolve((request.result as StudioMedia | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function loadAllMedia(): Promise<StudioMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const request = transaction.objectStore(MEDIA_STORE).getAll();
    request.onsuccess = () => resolve(request.result as StudioMedia[]);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function loadProjectMedia(projectId: string): Promise<StudioMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const request = transaction.objectStore(MEDIA_STORE).index("projectId").getAll(projectId);
    request.onsuccess = () => resolve(request.result as StudioMedia[]);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function deleteMedia(mediaId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).delete(mediaId);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function deleteStoredProject(projectId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([PROJECT_STORE, MEDIA_STORE, WRITING_SESSION_STORE], "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(projectId);
    const cursorRequest = transaction.objectStore(MEDIA_STORE).index("projectId").openKeyCursor(IDBKeyRange.only(projectId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      transaction.objectStore(MEDIA_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };
    const sessionCursorRequest = transaction.objectStore(WRITING_SESSION_STORE).index("projectId").openKeyCursor(IDBKeyRange.only(projectId));
    sessionCursorRequest.onsuccess = () => {
      const cursor = sessionCursorRequest.result;
      if (!cursor) return;
      transaction.objectStore(WRITING_SESSION_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function replaceLocalStudio(
  projects: StudioProject[],
  settings: StudioSettings,
  media: StudioMedia[],
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_STORE, MEDIA_STORE, SETTINGS_STORE, WRITING_SESSION_STORE],
      "readwrite",
    );
    const projectStore = transaction.objectStore(PROJECT_STORE);
    const mediaStore = transaction.objectStore(MEDIA_STORE);
    projectStore.clear();
    mediaStore.clear();
    transaction.objectStore(WRITING_SESSION_STORE).clear();
    projects.forEach((project) => projectStore.put(project));
    media.forEach((item) => mediaStore.put(item));
    transaction.objectStore(SETTINGS_STORE).put(settings);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
