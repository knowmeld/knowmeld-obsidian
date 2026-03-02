import { TFile, Vault } from "obsidian";

interface IAuthenticator {
    isConnected(): boolean;
    ensureAuthenticated(): Promise<boolean>;
}

interface ISyncer {
    syncFiles(files: TFile[]): Promise<void>;
    flushDeletedDocuments(): Promise<void>;
}

export class RealtimeSyncQueue {
    private pendingFiles: Set<string> = new Set();
    private syncTimeout: ReturnType<typeof setTimeout> | null = null;
    private syncing = false;

    constructor(
        private authenticator: IAuthenticator,
        private syncer: ISyncer,
        private vault: Pick<Vault, "getAbstractFileByPath">,
        private getInterval: () => number,
    ) { }

    queue(path: string): void {
        if (!this.authenticator.isConnected()) return;
        this.pendingFiles.add(path);
        if (this.syncTimeout) clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => this.flush(), this.getInterval() * 1000);
    }

    async flush(): Promise<void> {
        if (this.syncing || this.pendingFiles.size === 0) return;
        this.syncing = true;
        try {
            if (!await this.authenticator.ensureAuthenticated()) return;
            const paths = Array.from(this.pendingFiles);
            this.pendingFiles.clear();
            this.syncTimeout = null;
            console.log(`Knowmeld: Syncing ${paths.length} pending files...`);
            const files: TFile[] = [];
            for (const path of paths) {
                const file = this.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) files.push(file);
            }
            if (files.length > 0) await this.syncer.syncFiles(files);
            await this.syncer.flushDeletedDocuments();
        } finally {
            this.syncing = false;
        }
    }
}
