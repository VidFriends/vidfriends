// Offline copies in the app's private document directory (FR-MOB-04, BR-OFF-1..4). An index file
// lists them with what the Downloads screen shows while offline. Copies are removed when their
// share is gone, on sign-out and when the server changes.
import { ApiError } from '@vidfriends/api-client';
import { getShare, getShareMedia } from '@vidfriends/contracts';
import { Directory, File, Paths } from 'expo-file-system';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/lib/session';
import {
  canDownload,
  fileFor,
  goneEntries,
  parseIndex,
  usedBytes,
  type DownloadCheck,
  type OfflineEntry,
  type OfflineIndex,
} from './plan';

const dir = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(dir(), 'index.json');

function readIndex(): OfflineIndex {
  try {
    const f = indexFile();
    return parseIndex(f.exists ? f.textSync() : null);
  } catch {
    return parseIndex(null);
  }
}

function writeIndex(index: OfflineIndex) {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  indexFile().write(JSON.stringify(index));
}

export interface DownloadRequest {
  shareId: string;
  title: string;
  person: string;
  bytes: number | null;
}

interface OfflineApi {
  index: OfflineIndex;
  used: number;
  /** Share id → progress 0..1 while downloading. */
  progress: Record<string, number>;
  check(bytes: number | null): DownloadCheck;
  download(req: DownloadRequest): Promise<void>;
  cancel(shareId: string): void;
  remove(shareId: string): void;
  setCap(bytes: number): void;
  /** The local file URI of a downloaded share, if any. */
  localUri(shareId: string): string | null;
}

const OfflineContext = createContext<OfflineApi | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [index, setIndex] = useState<OfflineIndex>(readIndex);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const aborts = useRef(new Map<string, AbortController>());
  const server = useRef<string | null>(null);

  const commit = useCallback((next: OfflineIndex) => {
    writeIndex(next);
    setIndex(next);
  }, []);

  const removeEntries = useCallback(
    (ids: Set<string>) => {
      const current = readIndex();
      for (const e of current.entries) {
        if (ids.has(e.share_id)) {
          try {
            const f = new File(dir(), e.file);
            if (f.exists) f.delete();
          } catch {
            // already gone
          }
        }
      }
      commit({ ...current, entries: current.entries.filter((e) => !ids.has(e.share_id)) });
    },
    [commit],
  );

  const removeAll = useCallback(() => {
    for (const a of aborts.current.values()) a.abort();
    try {
      const d = dir();
      if (d.exists) d.delete();
    } catch {
      // nothing to remove
    }
    setIndex(parseIndex(null));
    setProgress({});
  }, []);

  // BR-OFF-4: signing out or changing servers removes every copy.
  useEffect(() => {
    if (!session.ready) return;
    const base = session.instance?.baseUrl ?? null;
    if (!session.signedIn || (server.current && base !== server.current)) removeAll();
    if (session.signedIn) server.current = base;
  }, [session.ready, session.signedIn, session.instance?.baseUrl, removeAll]);

  // BR-OFF-3: when online and in the foreground, drop copies whose share is gone.
  const reconcile = useCallback(async () => {
    if (!session.signedIn) return;
    const current = readIndex();
    const status: Record<string, 'ok' | 'gone' | 'unknown'> = {};
    for (const e of current.entries) {
      try {
        await session.api.call(getShare, { params: { id: e.share_id } });
        status[e.share_id] = 'ok';
      } catch (err) {
        status[e.share_id] =
          err instanceof ApiError && (err.status === 404 || err.status === 403)
            ? 'gone'
            : 'unknown';
      }
    }
    const gone = goneEntries(current, status);
    if (gone.length) removeEntries(new Set(gone.map((e) => e.share_id)));
  }, [session.signedIn, session.api, removeEntries]);

  useEffect(() => {
    void reconcile();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reconcile();
    });
    return () => sub.remove();
  }, [reconcile]);

  const download = useCallback(
    async (req: DownloadRequest) => {
      const check = canDownload(readIndex(), req.bytes, Paths.availableDiskSpace);
      if (check !== 'ok') throw new Error(check);
      const { media_url } = await session.api.call(getShareMedia, {
        params: { id: req.shareId },
      });
      if (!media_url) throw new Error('not_ready');
      const d = dir();
      if (!d.exists) d.create({ intermediates: true });
      const name = fileFor(req.shareId);
      const partial = new File(d, `${name}.part`);
      if (partial.exists) partial.delete();
      const abort = new AbortController();
      aborts.current.set(req.shareId, abort);
      setProgress((p) => ({ ...p, [req.shareId]: 0 }));
      try {
        const task = File.createDownloadTask(media_url, partial, {
          signal: abort.signal,
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0)
              setProgress((p) => ({ ...p, [req.shareId]: bytesWritten / totalBytes }));
          },
        });
        const file = await task.downloadAsync();
        if (!file) throw new Error('cancelled');
        const target = new File(d, name);
        if (target.exists) target.delete();
        file.moveSync(target);
        const entry: OfflineEntry = {
          share_id: req.shareId,
          title: req.title,
          person: req.person,
          bytes: target.size ?? req.bytes ?? 0,
          downloaded_at: new Date().toISOString(),
          file: name,
        };
        const current = readIndex();
        commit({
          ...current,
          entries: [entry, ...current.entries.filter((e) => e.share_id !== req.shareId)],
        });
      } catch (err) {
        if (partial.exists) partial.delete();
        throw err;
      } finally {
        aborts.current.delete(req.shareId);
        setProgress(({ [req.shareId]: _done, ...rest }) => rest);
      }
    },
    [session.api, commit],
  );

  const api: OfflineApi = {
    index,
    used: usedBytes(index),
    progress,
    check: (bytes) => canDownload(index, bytes, Paths.availableDiskSpace),
    download,
    cancel: (id) => aborts.current.get(id)?.abort(),
    remove: (id) => removeEntries(new Set([id])),
    setCap: (bytes) => commit({ ...readIndex(), cap_bytes: bytes }),
    localUri: (id) => {
      const e = index.entries.find((x) => x.share_id === id);
      if (!e) return null;
      const f = new File(dir(), e.file);
      return f.exists ? f.uri : null;
    },
  };
  return <OfflineContext.Provider value={api}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineApi {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline outside OfflineProvider');
  return ctx;
}
