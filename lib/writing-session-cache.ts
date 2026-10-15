export const MAX_CACHED_WRITING_VOLUMES = 3;

export type WritingSessionCacheEntry = {
  volumeId: string;
};

export function touchWritingSession<T extends WritingSessionCacheEntry>(
  sessions: readonly T[],
  session: T,
  limit = MAX_CACHED_WRITING_VOLUMES,
) {
  const withoutCurrent = sessions.filter((candidate) => candidate.volumeId !== session.volumeId);
  const next = [...withoutCurrent, session];
  const overflow = Math.max(0, next.length - Math.max(1, limit));
  return {
    sessions: next.slice(overflow),
    evicted: next.slice(0, overflow),
  };
}

export function removeWritingSession<T extends WritingSessionCacheEntry>(
  sessions: readonly T[],
  volumeId: string,
) {
  return sessions.filter((session) => session.volumeId !== volumeId);
}
