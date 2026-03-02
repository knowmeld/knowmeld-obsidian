import { describe, it, expect, vi } from "vitest";
import { Authenticator } from "./authenticator";
import type { KnowmeldSettingStore, AuthDetails } from "./settings.store";
import type { PersistedCache } from "./types";

function makeSettingsStore(authDetails?: AuthDetails): KnowmeldSettingStore {
    return {
        get: () => ({
            appUrl: "http://localhost:8000",
            apiUrl: "http://localhost:8000/api/v1",
            excludedFolders: [],
            realtimeSyncInterval: 120,
            deletedDocumentIds: [],
            vaultId: "test-vault-id",
            vaultName: "Test Vault",
            authDetails,
        }),
        set: vi.fn(),
    };
}

const stubCache: PersistedCache = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    getDocumentId: vi.fn(),
    setDocumentId: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
};

describe("Authenticator", () => {
    describe("isConnected", () => {
        it("returns false when no authDetails", () => {
            const auth = new Authenticator(makeSettingsStore(undefined), stubCache);
            expect(auth.isConnected()).toBe(false);
        });

        it("returns true when authDetails are present", () => {
            const auth = new Authenticator(
                makeSettingsStore({ tokenID: "t", accessToken: "a", accessTokenExpiresAt: Date.now() + 100_000, refreshToken: "r", refreshTokenExpiresAt: Date.now() + 200_000 }),
                stubCache,
            );
            expect(auth.isConnected()).toBe(true);
        });
    });

    describe("isAuthenticated", () => {
        it("returns false when not connected", () => {
            const auth = new Authenticator(makeSettingsStore(undefined), stubCache);
            expect(auth.isAuthenticated()).toBe(false);
        });

        it("returns true when access token is valid with plenty of time remaining", () => {
            const auth = new Authenticator(
                makeSettingsStore({ tokenID: "t", accessToken: "a", accessTokenExpiresAt: Date.now() + 5 * 60 * 1000, refreshToken: "r", refreshTokenExpiresAt: Date.now() + 10 * 60 * 1000 }),
                stubCache,
            );
            expect(auth.isAuthenticated()).toBe(true);
        });

        it("returns false when access token is expired", () => {
            const auth = new Authenticator(
                makeSettingsStore({ tokenID: "t", accessToken: "a", accessTokenExpiresAt: Date.now() - 1000, refreshToken: "r", refreshTokenExpiresAt: Date.now() + 10 * 60 * 1000 }),
                stubCache,
            );
            expect(auth.isAuthenticated()).toBe(false);
        });

        it("returns false when token expires within the 1-minute buffer", () => {
            const auth = new Authenticator(
                makeSettingsStore({ tokenID: "t", accessToken: "a", accessTokenExpiresAt: Date.now() + 30 * 1000, refreshToken: "r", refreshTokenExpiresAt: Date.now() + 10 * 60 * 1000 }),
                stubCache,
            );
            expect(auth.isAuthenticated()).toBe(false);
        });
    });
});
