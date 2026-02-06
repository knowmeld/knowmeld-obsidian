export interface AuthDetails {
    tokenID: string;
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
}

export interface KnowmeldSettings {
    apiUrl: string;
    dashboardUrl?: string;
    authDetails?: AuthDetails;
    excludedFolders: string[];
    realtimeSyncInterval: number;  // seconds, default 120 (2 min)
    deletedFiles: string[];        // paths pending deletion notification
}

export interface KnowmeldSettingStore {
    get(): KnowmeldSettings;
    set(setting: Record<string, string | boolean | number | string[] | AuthDetails | null>): void;
}

export const DEFAULT_SETTINGS: KnowmeldSettings = {
    apiUrl: process.env.NODE_ENV === "production"
        ? "https://api.knowmeld.io/v1"
        : "http://localhost:8000/v1",
    dashboardUrl: process.env.NODE_ENV === "production"
        ? "https://dashboard.knowmeld.io"
        : "http://localhost:8000/dashboard",
    authDetails: undefined,
    excludedFolders: [],
    realtimeSyncInterval: 120,
    deletedFiles: [],
};