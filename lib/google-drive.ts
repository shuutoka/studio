import type { StudioSettings } from "@/lib/studio";

export type GoogleDriveBackupFile = {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
};

export type GoogleDriveConfiguration = {
  clientId: string;
  apiKey: string;
  appId: string;
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type PickerDocument = Record<string, string | number | undefined>;
type PickerResponse = Record<string, string | PickerDocument[] | undefined>;
type Picker = { setVisible: (visible: boolean) => void };
type DocsView = {
  setMimeTypes: (mimeTypes: string) => DocsView;
  setMode: (mode: string) => DocsView;
};
type PickerBuilder = {
  addView: (view: DocsView) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setOrigin: (origin: string) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  setSize: (width: number, height: number) => PickerBuilder;
  build: () => Picker;
};
type PickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string; MIME_TYPE: string };
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  DocsView: new (viewId?: string) => DocsView;
  PickerBuilder: new () => PickerBuilder;
};

declare global {
  interface Window {
    gapi?: {
      load: (library: string, options: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }) => void;
    };
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => TokenClient;
        };
      };
      picker?: PickerNamespace;
    };
  }
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const EFS_MIME = "application/vnd.enfer-fatal-studio";

export class GoogleDrivePickerCancelledError extends Error {
  constructor() {
    super("Sélection Google Drive annulée.");
    this.name = "GoogleDrivePickerCancelledError";
  }
}

export function resolveGoogleDriveConfiguration(settings: StudioSettings): GoogleDriveConfiguration {
  return {
    clientId: settings.googleDriveClientId.trim() || import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID?.trim() || "",
    apiKey: settings.googleDriveApiKey.trim() || import.meta.env.VITE_GOOGLE_DRIVE_API_KEY?.trim() || "",
    appId: settings.googleDriveAppId.trim() || import.meta.env.VITE_GOOGLE_DRIVE_APP_ID?.trim() || "",
  };
}

export function canSaveToGoogleDrive(configuration: GoogleDriveConfiguration) {
  return Boolean(configuration.clientId);
}

export function canPickFromGoogleDrive(configuration: GoogleDriveConfiguration) {
  return Boolean(configuration.clientId && configuration.apiKey && configuration.appId);
}

export async function authorizeGoogleDrive(clientId: string) {
  if (!clientId.trim()) throw new Error("Ajoutez d’abord l’identifiant client Google dans Paramètres → Sauvegarde.");
  await loadGoogleIdentity();
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: DRIVE_SCOPE,
      callback: (response) => response.access_token
        ? resolve(response.access_token)
        : reject(new Error(response.error_description || response.error || "Autorisation Google refusée.")),
      error_callback: () => reject(new Error("La fenêtre d’autorisation Google a été fermée ou bloquée.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function pickGoogleDriveBackup(configuration: GoogleDriveConfiguration, existingToken?: string | null) {
  if (!canPickFromGoogleDrive(configuration)) {
    throw new Error("Le sélecteur Drive nécessite le Client ID, la clé API et le numéro de projet Google.");
  }
  await Promise.all([loadGoogleIdentity(), loadGooglePicker()]);
  const token = existingToken || await authorizeGoogleDrive(configuration.clientId);
  const picker = window.google!.picker!;
  const file = await new Promise<GoogleDriveBackupFile>((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMode(picker.DocsViewMode.LIST)
      .setMimeTypes(`${EFS_MIME},application/zip,application/octet-stream`);
    const instance = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(configuration.apiKey)
      .setAppId(configuration.appId)
      .setOrigin(window.location.origin)
      .setTitle("Ouvrir une sauvegarde Enfer Fatal Studio")
      .setSize(Math.min(1100, Math.max(720, window.innerWidth - 48)), Math.min(720, Math.max(520, window.innerHeight - 48)))
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) {
          reject(new GoogleDrivePickerCancelledError());
          return;
        }
        if (action !== picker.Action.PICKED) return;
        const document = (data[picker.Response.DOCUMENTS] as PickerDocument[] | undefined)?.[0];
        const id = String(document?.[picker.Document.ID] ?? "");
        if (!id) { reject(new Error("Google Drive n’a pas renvoyé le fichier choisi.")); return; }
        resolve({
          id,
          name: String(document?.[picker.Document.NAME] ?? "sauvegarde.efs"),
          modifiedTime: "",
        });
      })
      .build();
    instance.setVisible(true);
  });
  return { token, file };
}

export async function saveBackupToGoogleDrive(token: string, blob: Blob, filename: string, existingFileId?: string) {
  if (existingFileId) {
    const updated = await upload(token, blob, filename, existingFileId);
    if (updated) return updated;
  }
  const created = await upload(token, blob, filename);
  if (!created) throw new Error("Google Drive n’a pas renvoyé le fichier sauvegardé.");
  return created;
}

export async function downloadGoogleDriveBackup(token: string, file: GoogleDriveBackupFile) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await driveError(response, "Impossible de charger cette sauvegarde Google Drive."));
  return new File([await response.blob()], file.name || "sauvegarde.efs", { type: EFS_MIME });
}

async function upload(token: string, blob: Blob, filename: string, fileId?: string): Promise<GoogleDriveBackupFile | null> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: filename, mimeType: EFS_MIME, appProperties: { format: "enfer-fatal-studio" } })], { type: "application/json" }));
  form.append("file", blob, filename);
  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size";
  const response = await fetch(endpoint, { method: fileId ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (fileId && response.status === 404) return null;
  if (!response.ok) throw new Error(await driveError(response, "La sauvegarde Google Drive a échoué."));
  return response.json() as Promise<GoogleDriveBackupFile>;
}

async function driveError(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: { message?: string } };
    return data.error?.message || fallback;
  } catch {
    return fallback;
  }
}

async function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return;
  await loadScript("https://accounts.google.com/gsi/client", "google-identity", "Google Identity n’a pas pu être chargé.");
}

async function loadGooglePicker() {
  if (window.google?.picker) return;
  await loadScript("https://apis.google.com/js/api.js", "google-api", "Google Picker n’a pas pu être chargé.");
  if (!window.gapi) throw new Error("Google Picker n’est pas disponible.");
  await new Promise<void>((resolve, reject) => window.gapi!.load("picker", {
    callback: resolve,
    onerror: () => reject(new Error("Google Picker n’a pas pu être initialisé.")),
    timeout: 10_000,
    ontimeout: () => reject(new Error("Google Picker a mis trop de temps à répondre.")),
  }));
}

async function loadScript(src: string, marker: string, errorMessage: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-google-script="${marker}"]`);
  if (existing) {
    if (existing.dataset.loaded === "true") return;
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(errorMessage)), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.googleScript = marker;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error(errorMessage));
    document.head.appendChild(script);
  });
}
