import { Notice } from "obsidian";

import { KnowmeldSettingStore } from "./settings.store";



export interface PersistedCache {
    get(path: string): string | undefined;
    set(path: string, hash: string): void;
    save(): Promise<void>;
}
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
            formData.append("refresh_token", settings.authDetails.refreshToken);
            const response = await fetch(`${settings.apiUrl}/auth/token/refresh`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const { token_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at } = data;

            this.persistAuthDetails(
                token_id,
                access_token,
                access_token_expires_at,
                refresh_token,
                refresh_token_expires_at
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
        window.open(
            `${settings.dashboardUrl}/dashboard/connect?connector=obsidian`,
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

    async disconnect(): Promise<void> {
        const settings = this.settingsStore.get();
        if (!settings.authDetails) return;
        if (!await this.ensureAuthenticated()) return;
        const formData = new FormData();
        formData.append("token_id", settings.authDetails.tokenID);
        try {
            const response = await fetch(`${settings.apiUrl}/auth/revoke`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.getAccessToken()}`,
                },
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
        formData.append("pairing_code", pairingCode);
        const resp = await fetch(`${settings.apiUrl}/auth/token/pair`, {
            method: "POST",
            body: formData,
            headers: {
                "X-Knowmeld-Correlation-ID": correlationId,
            },
        });
        if (!resp.ok) {
            new Notice("Knowmeld: Failed to connect device.");
            return false;
        }
        const data = await resp.json();
        if (data.access_token && data.refresh_token) {
            // Python sends timestamp seconds, convert to ms
            this.persistAuthDetails(
                data.token_id,
                data.access_token,
                data.access_token_expires_at,
                data.refresh_token,
                data.refresh_token_expires_at
            );
        }
        return true;
    }
}