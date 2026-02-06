import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";

import { FileSyncer } from "./syncer";
import { KnowmeldSettingTab } from "./settings";
import { DEFAULT_SETTINGS, KnowmeldSettings } from "./settings.store";
import { Authenticator } from "./authenticator";

type PersistedData = {
  cache: CacheData;
  log?: string;
  settings: KnowmeldSettings;
}

interface CacheData {
  [path: string]: string;
}

interface PersistedCache {
  get(path: string): string | undefined;
  set(path: string, hash: string): void;
  remove(path: string): void;
  rename(oldPath: string, newPath: string): void;
  save(): Promise<void>;
}

export default class KnowmeldPlugin extends Plugin {
  private syncer!: FileSyncer;
  private settingTab!: KnowmeldSettingTab;
  private pendingFiles: Set<string> = new Set();
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private authenticator!: Authenticator;
  private syncing: boolean = false;

  private data: PersistedData = {
    cache: {},
    settings: DEFAULT_SETTINGS,
  };

  async onload(): Promise<void> {
    const loadedData: Partial<PersistedData> = await this.loadData();
    this.data = {
      cache: loadedData?.cache || {},
      settings: { ...DEFAULT_SETTINGS, ...loadedData?.settings },
    }
    const cacheStore: PersistedCache = {
      get: (path: string) => this.data.cache[path],
      set: (path: string, hash: string) => {
        this.data.cache[path] = hash;
      },
      remove: (path: string) => {
        delete this.data.cache[path];
      },
      rename: (oldPath: string, newPath: string) => {
        if (this.data.cache[oldPath]) {
          this.data.cache[newPath] = this.data.cache[oldPath];
          delete this.data.cache[oldPath];
        }
      },
      save: async () => {
        await this.persistData();
      }
    }
    const settingsStore = {
      get: (): KnowmeldSettings => this.data.settings,
      set: (setting: Record<string, string | boolean | number | string[]>): void => {
        this.data.settings = { ...this.data.settings, ...setting };
      }
    };
    this.authenticator = new Authenticator(settingsStore, cacheStore);
    this.settingTab = new KnowmeldSettingTab(this.app, this, settingsStore, this.authenticator);
    this.syncer = new FileSyncer(this.app, this.app.vault, cacheStore, settingsStore, this.authenticator);
    this.addSettingTab(this.settingTab);
    this.registerObsidianProtocolHandler("knowmeld-auth", async (params) => {
      const { pairingCode, correlationId } = params;
      if (!pairingCode || !correlationId) {
        new Notice("Knowmeld: Could not get connection parameters. Please try again.");
        return;
      }
      this.authenticator.finishPairing(pairingCode, correlationId).then(async (success) => {
        if (success) {
          new Notice("Knowmeld: Device successfully connected!");
          this.settingTab.display();
        } else {
          new Notice("Knowmeld: Failed to connect device. Could not retrieve code from server. Please try again.");
        }
      });
    });

    this.addRibbonIcon("refresh-cw", "Sync all to Knowmeld", async () => {
      await this.syncer.syncAll();
    });

    this.addCommand({
      id: "sync-all",
      name: "Sync all files to Knowmeld",
      checkCallback: (checking: boolean) => {
        const connected = this.authenticator.isConnected();

        if (checking) return connected;

        if (!connected) {
          new Notice("Knowmeld: Your device has not been connected. Please connect in the settings.");
          return false;
        }

        this.syncer.syncAll();
        return true;
      },
    });

    this.addCommand({
      id: "sync-current",
      name: "Sync current file to Knowmeld",
      checkCallback: (checking: boolean) => {
        const connected = this.authenticator.isConnected();
        const file = this.app.workspace.getActiveFile();
        const ok = !!(connected && file && file.path.endsWith(".md"));

        if (checking) return ok;

        if (!connected) {
          new Notice("Knowmeld: Your device has not been connected. Please connect in the settings.");
          return false;
        }
        if (file && file.path.endsWith(".md")) {
          this.syncer.syncFile(file);
          return true;
        }
        return false;
      },
    });


    let ready = false;
    this.app.workspace.onLayoutReady(() => {
      if (ready) return;
      ready = true;
    });

    // Real-time sync: queue files on modify/create
    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (!ready) return;
        if (file instanceof TFile && file.path.endsWith(".md")) {
          this.queueFileForSync(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (!ready) return;
        if (file instanceof TFile && file.path.endsWith(".md")) {
          console.log(`Knowmeld: Queuing created file ${file.path}`);
          this.queueFileForSync(file.path);
        }
      })
    );

    // Track deleted files for batch notification
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (!ready) return;
        if (file.path.endsWith(".md")) {
          console.log(`Knowmeld: Queuing deleted file ${file.path}`);
          this.data.settings.deletedFiles.push(file.path);
          this.persistData();
          this.syncer.handleDelete(file.path);
        }
      })
    );

    // Handle renames: remove old path from cache, queue new path for sync
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        if (!ready) return;
        if (file.path.endsWith(".md")) {
          console.log(`Knowmeld: Handling renamed file ${oldPath} -> ${file.path}`);
          this.syncer.handleRename(oldPath, file.path);
          this.queueFileForSync(file.path);
        }
      })
    );

    // Flush deleted files every 10 minutes
    this.registerInterval(
      window.setInterval(() => this.flushDeletedFiles(), 10 * 60 * 1000)
    );
  }


  private queueFileForSync(path: string): void {
    if (!this.authenticator.isConnected()) return;
    this.pendingFiles.add(path);

    // Clear existing timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Set new timeout based on configured interval
    const intervalMs = this.data.settings.realtimeSyncInterval * 1000;
    this.syncTimeout = setTimeout(() => {
      this.syncPendingFiles();
    }, intervalMs);
  }

  private async syncPendingFiles(): Promise<void> {
    if (this.syncing) return;
    if (this.pendingFiles.size === 0) return;
    this.syncing = true;
    try {
      if (!await this.authenticator.ensureAuthenticated()) return;

      const filesToSync = Array.from(this.pendingFiles);
      this.pendingFiles.clear();
      this.syncTimeout = null;
      console.log(`Knowmeld: Syncing ${filesToSync.length} pending files...`);

      // Get TFile objects for pending paths
      const files: TFile[] = [];
      for (const path of filesToSync) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          files.push(file);
        }
      }

      if (files.length === 0) return;

      // Sync pending files
      await this.syncer.syncFiles(files);

    } finally {
      this.syncing = false;
    }
  }

  private async flushDeletedFiles(): Promise<void> {
    const deletedFiles = this.data.settings.deletedFiles;
    if (deletedFiles.length === 0) return;
    if (!await this.authenticator.ensureAuthenticated()) return;

    const success = await this.syncer.sendDeletedFiles(deletedFiles);
    if (success) {
      this.data.settings.deletedFiles = [];
      await this.persistData();
    }
  }

  async onunload(): Promise<void> {
    await this.persistData();
  }


  async persistData(): Promise<void> {
    await this.saveData(this.data);
  }
}


