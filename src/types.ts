export interface CacheEntry {
  hash: string;
  documentId?: string;
}

export interface CacheData {
  [path: string]: CacheEntry;
}

export interface PersistedCache {
  get(path: string): string | undefined;
  set(path: string, hash: string): void;
  remove(path: string): void;
  rename(oldPath: string, newPath: string): void;
  getDocumentId(path: string): string | undefined;
  setDocumentId(path: string, documentId: string): void;
  save(): Promise<void>;
}
