export interface KnowmeldSettings {
    dashboardUrl?: string;
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
    apiUrl: process.env.NODE_ENV === "production"
        ? "https://api.knowmeld.io/v1"
        : "http://localhost:8000/v1",
    dashboardUrl: process.env.NODE_ENV === "production"
        ? "https://dashboard.knowmeld.io"
        : "http://localhost:8000",
    deviceId: crypto.randomUUID(),
    // realtimeSync: false,
    excludedFolders: [],
};