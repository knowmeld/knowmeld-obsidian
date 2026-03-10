import { TFile, Vault, Notice, getFrontMatterInfo, App } from "obsidian";
import { KnowmeldSettingStore } from "./settings.store";
import { PersistedCache } from "./types";

const MIN_CONTENT_LENGTH = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

enum SyncDecision {
  SKIP,
  SYNC,
  FAILED,
}

interface IAuthenticator {
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
}

export interface ShouldSyncFileResult {
  shouldSync: boolean;
  reason: string;
}

export interface ShouldSyncFileOptions {
  path: string;
  excludedFolders: string[];
  contentWithoutFrontMatter?: string;
  contentHash?: string;
  cachedHash?: string;
}

export function shouldSyncFile(opts: ShouldSyncFileOptions): ShouldSyncFileResult {
  const { path, excludedFolders, contentWithoutFrontMatter, contentHash, cachedHash } = opts;

  if (excludedFolders.some((folder) => path.startsWith(folder))) {
    return { shouldSync: false, reason: "path is in excluded folders" };
  }
  if (path.startsWith("_")) {
    return { shouldSync: false, reason: "path starts with underscore" };
  }
  if (!path.endsWith(".md")) {
    return { shouldSync: false, reason: "not a markdown file" };
  }
  if (contentWithoutFrontMatter !== undefined) {
    if (contentWithoutFrontMatter.trim().length < MIN_CONTENT_LENGTH) {
      return { shouldSync: false, reason: "content too short" };
    }
  }
  if (contentHash !== undefined && cachedHash !== undefined) {
    if (contentHash === cachedHash) {
      return { shouldSync: false, reason: "content unchanged" };
    }
  }
  return { shouldSync: true, reason: "file should be synced" };
}

export class FileSyncer {
  private vault: Vault;
  private cacheStore: PersistedCache;
  private settingsStore: KnowmeldSettingStore;
  private authenticator: IAuthenticator;



  constructor(app: App, vault: Vault, cacheStore: PersistedCache, settingStore: KnowmeldSettingStore, authenticator: IAuthenticator) {
    this.vault = vault;
    this.cacheStore = cacheStore;
    this.settingsStore = settingStore;
    this.authenticator = authenticator;
  }

  async shouldSyncFile(file: TFile): Promise<ShouldSyncFileResult> {
    const settings = this.settingsStore.get();
    const content = await this.vault.read(file);
    let { contentStart } = getFrontMatterInfo(content);
    contentStart = contentStart ?? 0;
    const contentWithoutFrontMatter = content.slice(contentStart);
    const contentHash = await hashContent(content);
    const cachedHash = this.cacheStore.get(file.path);
    return shouldSyncFile({
      path: file.path,
      excludedFolders: settings.excludedFolders,
      contentWithoutFrontMatter,
      contentHash,
      cachedHash,
    });
  }


  async uploadFile(file: TFile, sessionId: string): Promise<SyncDecision> {
    const content = await this.vault.read(file);
    const hash = await hashContent(content);

    try {
      const formData = new FormData();
      const blob = new Blob([content], { type: "text/markdown" });

      const metadata = { vault_name: this.vault.getName() };
      formData.append("metadata", JSON.stringify(metadata));
      formData.append("file", blob, file.name);
      formData.append("filePath", file.path);
      formData.append("metadata", JSON.stringify(metadata));

      const response = await this.authenticator.apiFetch("/files/upload/file", {
        method: "POST",
        headers: {
          "X-Correlation-ID": sessionId,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const responseData = await response.json();
      this.cacheStore.set(file.path, hash);
      if (responseData.details.document_id) {
        this.cacheStore.setDocumentId(file.path, responseData.details.document_id);
      }
      await this.cacheStore.save();

      return SyncDecision.SYNC;
    } catch (error) {
      new Notice(`Knowmeld: Failed to sync ${file.name}`);
      console.error("Sync error:", error);
      return SyncDecision.FAILED;
    }
  }

  async syncAll(): Promise<void> {
    const files = this.vault.getMarkdownFiles();
    const filesToSync: TFile[] = [];
    for (const file of files) {
      const { shouldSync, reason } = await this.shouldSyncFile(file);
      if (!shouldSync) {
        console.log(`Skipping because file should not be synced: ${reason}`, file.path);
        continue;
      }
      filesToSync.push(file);
    }

    if (filesToSync.length === 0) {
      new Notice("Knowmeld: No files to sync.");
      return;
    }
    await this.syncFiles(filesToSync);
  }

  async syncFiles(files: TFile[]): Promise<void> {
    let synced = 0;
    let skipped = 0;

    const sessionId = await this.startSync();
    if (!sessionId) {
      new Notice("Knowmeld: Unable to start sync session.");
      return;
    }

    new Notice(`Knowmeld: Syncing ${files.length} files...`);


    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const wasUploaded = await this.uploadFile(file, sessionId);
      if (wasUploaded === SyncDecision.SYNC) synced++;
      else if (wasUploaded === SyncDecision.SKIP) skipped++;
      else {
        new Notice(`Knowmeld: Stopping sync due to error.`);
        return;
      }
      await sleep(100); // brief pause to avoid overwhelming the server
    }
    if (synced) {
      new Notice(`Knowmeld: Synced ${synced} files, ${skipped} unchanged`);
    }

    await this.finishSync(sessionId);
  }

  async syncFile(file: TFile): Promise<void> {
    const { shouldSync, reason } = await this.shouldSyncFile(file);
    if (!shouldSync) {
      new Notice(`Knowmeld: File not synced: ${reason}`);
      console.log(`Skipping because file should not be synced: ${reason}`, file.path);
      return;
    }
    await this.syncFiles([file]);
  }


  async startSync(): Promise<string | void> {
    try {
      const resp = await this.authenticator.apiFetch("/files/upload/start", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": crypto.randomUUID(),
        },
      });
      if (!resp.ok) {
        throw new Error("Authentication failed");
      }

      const sessionId = resp.headers.get("X-Correlation-ID");
      if (!sessionId) {
        throw new Error("Knowmeld Error correlation ID missing in response");
      }
      return sessionId;
    } catch (error) {
      console.error("Sync start error:", error);
      new Notice("Knowmeld: Failed to start sync session");
      return;
    }
  }

  async finishSync(sessionId: string): Promise<void> {
    try {
      await this.authenticator.apiFetch("/files/upload/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": sessionId,
        },
      });
      new Notice("Knowmeld: Sync session completed successfully");
    } catch (error) {
      console.error("Sync finish error:", error);
      new Notice("Knowmeld: Failed to finish sync session");
    }
  }


  // TODO: Delete should do more than just remove from the cache
  async handleDelete(path: string): Promise<void> {
    this.cacheStore.remove(path);
  }

  // TODO: Rename could notify the server of the change
  async handleRename(oldPath: string, newPath: string): Promise<void> {
    this.cacheStore.rename(oldPath, newPath);
  }

  async flushDeletedDocuments(): Promise<void> {
    const settings = this.settingsStore.get();
    if (settings.deletedDocumentIds.length === 0) return;
    const success = await this.sendDeletedDocuments(settings.deletedDocumentIds);
    if (success) {
      this.settingsStore.set({ deletedDocumentIds: [] });
      await this.cacheStore.save();
    }
  }

  async sendDeletedDocuments(documentIds: string[]): Promise<boolean> {
    if (documentIds.length === 0) return true;

    try {
      const response = await this.authenticator.apiFetch("/files/documents", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document_ids: documentIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Failed to send deleted documents:", error);
      return false;
    }
  }
}


export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}




