import { Plugin } from "obsidian";

import { FileSyncer, PersistedCache } from "./syncer";
import { KnowmeldSettings, KnowmeldSettingTab, DEFAULT_SETTINGS } from "./settings";

type PersistedData = {
  cache: CacheData;
  log?: string;
  settings: KnowmeldSettings;
}

interface CacheData {
  [path: string]: string;
}

export default class KnowmeldPlugin extends Plugin {
  private syncer!: FileSyncer;

  private data: PersistedData = {
    cache: {},
    log: "",
    settings: DEFAULT_SETTINGS,
  };

  async onload(): Promise<void> {
    const loadedData: Partial<PersistedData> = await this.loadData();
    this.data = {
      cache: loadedData?.cache || {},
      log: loadedData?.log || "",
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
      set: (setting: Record<string, string | boolean>): void => {
        this.data.settings = { ...this.data.settings, ...setting };
      }
    };

    this.syncer = new FileSyncer(this.app.vault, cacheStore, settingsStore);

    this.addSettingTab(new KnowmeldSettingTab(this.app, this, settingsStore));

    this.addRibbonIcon("refresh-cw", "Sync all to Knowmeld", async () => {
      await this.syncer.syncAll();
    });

    this.addCommand({
      id: "sync-all",
      name: "Sync all files to Knowmeld",
      callback: async () => {
        await this.syncer.syncAll();
      },
    });

    this.addCommand({
      id: "sync-current",
      name: "Sync current file to Knowmeld",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.path.endsWith(".md")) {
          if (!checking) {
            this.syncer.syncFile(file);
          }
          return true;
        }
        return false;
      },
    });

    // this.registerEvent(
    //   this.app.vault.on("modify", (file: TAbstractFile) => {
    //     if (file instanceof TFile && file.path.endsWith(".md")) {
    //       this.syncer.syncFile(file);
    //     }
    //   })
    // );

    // this.registerEvent(
    //   this.app.vault.on("create", (file: TAbstractFile) => {
    //     if (file instanceof TFile && file.path.endsWith(".md")) {
    //       this.syncer.syncFile(file);
    //     }
    //   })
    // );


    // // TODO: Delete should do more than just remove from the cache
    // this.registerEvent(
    //   this.app.vault.on("delete", (file: TAbstractFile) => {
    //     if (file.path.endsWith(".md")) {
    //       this.syncer.handleDelete(file.path);
    //     }
    //   })
    // );

    // // TODO: Rename should update the cache and possibly update the server
    // this.registerEvent(
    //   this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
    //     if (file.path.endsWith(".md")) {
    //       this.syncer.handleRename(oldPath, file.path);
    //     }
    //   })
    // );
  }

  async onunload(): Promise<void> {
    await this.persistData();
  }


  async persistData(): Promise<void> {
    await this.saveData(this.data);
  }
}


