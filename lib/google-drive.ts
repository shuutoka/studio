export type GoogleDriveBackupFile = {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
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
    };
  }
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const EFS_MIME = "application/vnd.enfer-fatal-studio";

export async function authorizeGoogleDrive(clientId: string) {
  if (!clientId.trim()) throw new Error("Ajoutez d’abord un identifiant client Google dans Paramètres → Sauvegarde.");
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

export async function saveBackupToGoogleDrive(token: string, blob: Blob, filename: string, existingFileId?: string) {
  if (existingFileId) {
    const updated = await upload(token, blob, filename, existingFileId);
    if (updated) return updated;
  }
  const created = await upload(token, blob, filename);
  if (!created) throw new Error("Google Drive n’a pas renvoyé le fichier sauvegardé.");
  return created;
}

export async function listGoogleDriveBackups(token: string): Promise<GoogleDriveBackupFile[]> {
  const query = encodeURIComponent("trashed = false and (name contains '.efs' or mimeType = 'application/vnd.enfer-fatal-studio')");
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)&pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await driveError(response, "Impossible de lire les sauvegardes Google Drive."));
  const data = await response.json() as { files?: GoogleDriveBackupFile[] };
  return data.files ?? [];
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
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity n’a pas pu être chargé.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity n’a pas pu être chargé."));
    document.head.appendChild(script);
  });
}
