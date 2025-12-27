import { TFile, Vault, Notice, getFrontMatterInfo } from "obsidian";
import { KnowmeldSettings } from "./settings";

const MIN_CONTENT_LENGTH = 500;

export interface SyncerSettings {
  get(): KnowmeldSettings;
}

export interface PersistedCache {
  get(path: string): string | undefined;
  set(path: string, hash: string): void;
  remove(path: string): void;
  rename(oldPath: string, newPath: string): void;
  save(): Promise<void>;
}


export class FileSyncer {
  private vault: Vault;
  private cacheStore: PersistedCache;
  private settingsStore: SyncerSettings;


  constructor(vault: Vault, cacheStore: PersistedCache, settingStore: SyncerSettings) {
    this.vault = vault;
    this.cacheStore = cacheStore;
    this.settingsStore = settingStore;
  }


  async syncFile(file: TFile): Promise<boolean> {
    const settings = this.settingsStore.get();
    if (settings.excludedFolders.some(folder => file.path.startsWith(folder))) {
      console.log("Skipping because path is in excluded folders:", file.path);
      return false;
    }
    if (file.path.startsWith("_")) {
      console.log("Skipping because path starts with underscore:", file.path);
      return false;
    }
    if (!file.path.endsWith(".md")) {
      console.log("Skipping because not a markdown file:", file.path);
      return false;
    }


    if (!settings.apiKey) {
      new Notice("Knowmeld: API Key required");
      return false;
    }

    const content = await this.vault.read(file);
    let { contentStart } = getFrontMatterInfo(content);
    contentStart = contentStart ?? 0;
    const contentWithoutFrontMatter = content.slice(contentStart);

    if (contentWithoutFrontMatter.trim().length < MIN_CONTENT_LENGTH) {
      console.log("Skipping because content too short:", file.path);
      return false;
    }

    const hash = await hashContent(content);
    const cachedHash = this.cacheStore.get(file.path);

    if (cachedHash === hash) {
      return false;
    }

    try {
      const formData = new FormData();
      const blob = new Blob([content], { type: "text/markdown" });
      formData.append("file", blob, file.name);
      formData.append("file_path", file.path);
      formData.append("vault_path", this.vault.getRoot().path);

      const response = await fetch(settings.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.cacheStore.set(file.path, hash);
      await this.cacheStore.save();

      return true;
    } catch (error) {
      new Notice(`Knowmeld: Failed to sync ${file.name}`);
      console.error("Sync error:", error);
      return false;
    }
  }

  async syncAll(): Promise<void> {
    const files = this.vault.getMarkdownFiles();
    let synced = 0;
    let skipped = 0;

    for (const file of files) {
      const wasUploaded = await this.syncFile(file);
      if (wasUploaded) synced++;
      else skipped++;
    }

    new Notice(`Knowmeld: Synced ${synced} files, ${skipped} unchanged`);
  }

  // TODO: Delete should do more than just remove from the cache
  async handleDelete(path: string): Promise<void> {
    this.cacheStore.remove(path);
  }

  // TODO: Rename could notify the server of the change
  async handleRename(oldPath: string, newPath: string): Promise<void> {
    this.cacheStore.rename(oldPath, newPath);
  }
}


export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}