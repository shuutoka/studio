import { normalizeProject, type StudioMedia, type StudioProject } from "@/lib/studio";

const DATABASE_NAME = "enfer-fatal-studio";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const MEDIA_STORE = "media";

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
      try {
        resolve(request.result.map((project) => normalizeProject(project)));
      } catch (error) {
        reject(error);
      }
    };
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
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function persistMedia(media: StudioMedia | StudioMedia[]) {
  const items = Array.isArray(media) ? media : [media];
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    items.forEach((item) => store.put(item));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
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

export async function loadProjectMedia(projectId: string): Promise<StudioMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readonly");
    const index = transaction.objectStore(MEDIA_STORE).index("projectId");
    const request = index.getAll(projectId);
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
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function deleteStoredProject(projectId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([PROJECT_STORE, MEDIA_STORE], "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(projectId);

    const mediaIndex = transaction.objectStore(MEDIA_STORE).index("projectId");
    const cursorRequest = mediaIndex.openKeyCursor(IDBKeyRange.only(projectId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      transaction.objectStore(MEDIA_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}
