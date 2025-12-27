import { App, PluginSettingTab, Setting } from "obsidian";
import type KnowmeldPlugin from "./main";

export interface KnowmeldSettings {
  apiUrl: string;
  apiKey: string;
  // realtimeSync: boolean;
  excludedFolders: string[];
}

export interface KnowmeldSettingStore {
  get(): KnowmeldSettings;
  set(setting: Record<string, string | boolean | string[]>): void;
}

export const DEFAULT_SETTINGS: KnowmeldSettings = {
  apiUrl: "http://localhost:8000/upload/obsidian",
  apiKey: "",
  // realtimeSync: false,
  excludedFolders: [],
};

export class KnowmeldSettingTab extends PluginSettingTab {
  plugin: KnowmeldPlugin;
  settingsStore: KnowmeldSettingStore;

  constructor(app: App, plugin: KnowmeldPlugin, settingsStore: KnowmeldSettingStore) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsStore = settingsStore;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Authentication key for the API")
      .addText((text) => {
        text
          .setPlaceholder("Enter your API key")
          .setValue(this.settingsStore.get().apiKey)
          .onChange(async (value) => {
            this.settingsStore.set({ apiKey: value });
            await this.plugin.persistData();
          });
        text.inputEl.type = "password";
      });

    // new Setting(containerEl)
    //   .setName("Real-time sync")
    //   .setDesc("Automatically sync files when they are modified")
    //   .addToggle((toggle) =>
    //     toggle
    //       .setValue(this.settingsStore.get().realtimeSync)
    //       .onChange(async (value) => {
    //         this.settingsStore.set({ realtimeSync: value });
    //         await this.plugin.persistData();
    //       })
    //   );


    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Folders to exclude from syncing, separated by commas")
      .addText((text) => {
        text
          .setPlaceholder("e.g. Private,Templates")
          .setValue(this.settingsStore.get().excludedFolders.join(","))
          .onChange(async (value) => {
            const folders = value.split(",").map((folder) => folder.trim());
            this.settingsStore.set({ excludedFolders: folders });
            await this.plugin.persistData();
          });
      });
  }
}


