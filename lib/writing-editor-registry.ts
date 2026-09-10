export type ActiveWritingDocument = {
  flush: () => Promise<void>;
  exportDocx: () => Promise<Blob>;
  getText: () => string;
  print: () => boolean;
  navigateToText: (text: string) => void;
};

const activeDocuments = new Map<string, ActiveWritingDocument>();

export function registerActiveWritingDocument(
  volumeId: string,
  document: ActiveWritingDocument,
) {
  activeDocuments.set(volumeId, document);
  return () => {
    if (activeDocuments.get(volumeId) === document) activeDocuments.delete(volumeId);
  };
}

export function getActiveWritingDocument(volumeId: string) {
  return activeDocuments.get(volumeId) ?? null;
}

export async function flushOpenWritingDocuments() {
  await Promise.all([...activeDocuments.values()].map((document) => document.flush()));
}
