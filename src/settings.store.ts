export interface AuthDetails {
    tokenID: string;
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
}

export interface KnowmeldSettings {
    appUrl: string;
    apiUrl: string;
    authDetails?: AuthDetails;
    excludedFolders: string[];
    realtimeSyncInterval: number;  // seconds, default 120 (2 min)
    deletedDocumentIds: string[];   // document UUIDs pending deletion
    vaultId: string;                // stable UUID generated on first install
    vaultName: string;              // current vault name, updated on each load
}

export interface KnowmeldSettingStore {
    get(): KnowmeldSettings;
    set(setting: Record<string, string | boolean | number | string[] | AuthDetails | null>): void;
}

export const DEFAULT_SETTINGS: KnowmeldSettings = {
    appUrl: process.env.NODE_ENV === "production"
        ? "https://app.knowmeld.io"
        : "http://localhost:5173",
    apiUrl: process.env.NODE_ENV === "production"
        ? "https://app.knowmeld.io/api/v1"
        : "http://localhost:8000/api/v1",
    authDetails: undefined,
    excludedFolders: [],
    realtimeSyncInterval: 120,
    deletedDocumentIds: [],
    vaultId: "",
    vaultName: "",
};