import { Notice } from "obsidian";

import { KnowmeldSettingStore } from "./settings.store";
import { PersistedCache } from "./types";

export class Authenticator {
    private settingsStore: KnowmeldSettingStore;
    private cacheStore: PersistedCache;
    constructor(settingsStore: KnowmeldSettingStore, cacheStore: PersistedCache) {
        this.settingsStore = settingsStore;
        this.cacheStore = cacheStore;
    }
    static getAuthHeader(accessToken: string): Record<string, string> {
        return {
            Authorization: `Bearer ${accessToken}`,
        };
    }

    async authenticate(): Promise<boolean> {
        const settings = this.settingsStore.get();
        if (!settings.authDetails) {
            return false;
        }

        try {
            const formData = new FormData();
            formData.append("refreshToken", settings.authDetails.refreshToken);
            const response = await fetch(`${settings.apiUrl}/auth/token/refresh`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const { tokenId, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt } = data.details;

            this.persistAuthDetails(
                tokenId,
                accessToken,
                accessTokenExpiresAt,
                refreshToken,
                refreshTokenExpiresAt
            );
            await
                this.cacheStore.save();
            return true;
        } catch (error) {
            console.error("Authentication error:", error);
            new Notice("Knowmeld: Authentication failed. Please reconnect your device in the settings.");
            return false;
        }
    }

    persistAuthDetails(tokenID: string, accessToken: string, accessTokenExpiresAt: number, refreshToken: string, refreshTokenExpiresAt: number): void {
        this.settingsStore.set({
            authDetails: {
                tokenID,
                accessToken,
                accessTokenExpiresAt: accessTokenExpiresAt * 1000,
                refreshToken,
                refreshTokenExpiresAt: refreshTokenExpiresAt * 1000,
            },
        });
        this.cacheStore.save();
    }

    async connect(): Promise<void> {
        const settings = this.settingsStore.get();
        const params = new URLSearchParams({
            connector: "obsidian",
            instanceId: settings.vaultId,
            instanceName: settings.vaultName,
        });
        window.open(
            `${settings.appUrl}/connect?${params.toString()}`,
        );
    }

    isConnected(): boolean {
        const settings = this.settingsStore.get();
        return !!settings.authDetails;
    }

    isAuthenticated(): boolean {
        if (!this.isConnected()) return false;
        const settings = this.settingsStore.get();
        const bufferMs = 60 * 1000;  // 1min early refresh
        const now = Date.now();
        return settings.authDetails!.accessTokenExpiresAt - bufferMs > now;
    }

    async ensureAuthenticated(): Promise<boolean> {
        if (this.isAuthenticated()) return true;
        return await this.authenticate();
    }

    async apiFetch(path: string, init?: RequestInit): Promise<Response> {
        const authenticated = await this.ensureAuthenticated();
        if (!authenticated) {
            throw new Error("Knowmeld: Authentication required");
        }
        const settings = this.settingsStore.get();
        return fetch(`${settings.apiUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.getAccessToken()}`,
                ...init?.headers,
            },
        });
    }

    async disconnect(): Promise<void> {
        const settings = this.settingsStore.get();
        if (!settings.authDetails) return;
        const formData = new FormData();
        formData.append("token_id", settings.authDetails.tokenID);
        try {
            const response = await this.apiFetch("/auth/token/revoke", {
                method: "POST",
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.settingsStore.set({ authDetails: null });
            await this.cacheStore.save();
        } catch (error) {
            console.error("Disconnect error:", error);
            new Notice("Knowmeld: Failed to disconnect from Knowmeld.");
        }
    }

    getAccessToken(): string {
        const settings = this.settingsStore.get();
        return settings.authDetails?.accessToken || "";
    }

    async finishPairing(pairingCode: string, correlationId: string): Promise<boolean> {
        const settings = this.settingsStore.get();
        const formData = new FormData();
        formData.append("pairingCode", pairingCode);
        const resp = await fetch(`${settings.apiUrl}/auth/token/pair`, {
            method: "POST",
            body: formData,
            headers: {
                "X-Correlation-ID": correlationId,
            },
        });
        if (!resp.ok) {
            new Notice("Knowmeld: Failed to connect device.");
            console.error("Pairing error:", await resp.text());
            return false;
        }
        const data = await resp.json();
        if (!data.details?.accessToken || !data.details?.refreshToken) {
            new Notice("Knowmeld: Failed to connect device.");
            console.error("Pairing error: Missing tokens in response", data);
            return false;
        }
        // Python sends timestamp seconds, convert to ms
        this.persistAuthDetails(
            data.details.tokenId,
            data.details.accessToken,
            data.details.accessTokenExpiresAt,
            data.details.refreshToken,
            data.details.refreshTokenExpiresAt
        );
        return true;
    }
}