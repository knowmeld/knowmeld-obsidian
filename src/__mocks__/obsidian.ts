// Mock implementations for Obsidian API used in syncer.ts

export class TFile {
  path: string;
  name: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() || path;
  }
}

export class Vault {
  getMarkdownFiles(): TFile[] {
    return [];
  }
  async read(): Promise<string> {
    return "";
  }
  getName(): string {
    return "test-vault";
  }
}

export class Notice {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(message: string, timeout?: number) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getFrontMatterInfo(content: string): { contentStart: number } {
  return { contentStart: 0 };
}
