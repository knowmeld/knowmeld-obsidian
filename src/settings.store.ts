export interface KnowmeldSettings {
    apiUrl: string;
    deviceId: string;
    accessToken?: string;
    refreshToken?: string;
    excludedFolders: string[];
}

export interface KnowmeldSettingStore {
    get(): KnowmeldSettings;
    set(setting: Record<string, string | boolean | string[]>): void;
}

export const DEFAULT_SETTINGS: KnowmeldSettings = {
    apiUrl: "http://localhost:8000",
    deviceId: crypto.randomUUID(),
    // realtimeSync: false,
    excludedFolders: [],
};