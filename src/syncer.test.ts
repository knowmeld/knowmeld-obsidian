import { describe, it, expect } from "vitest";
import { hashContent, shouldSyncFile } from "./syncer";

describe("hashContent", () => {
  it("produces consistent SHA-256 hashes", async () => {
    const content = "Hello, World!";
    const hash1 = await hashContent(content);
    const hash2 = await hashContent(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it("produces different hashes for different content", async () => {
    const hash1 = await hashContent("Hello");
    const hash2 = await hashContent("World");

    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", async () => {
    const hash = await hashContent("");
    expect(hash).toHaveLength(64);
  });

  it("handles unicode content", async () => {
    const hash = await hashContent("Hello 世界 🌍");
    expect(hash).toHaveLength(64);
  });
});

describe("shouldSyncFile", () => {
  describe("excluded folders", () => {
    it("skips files in excluded folders", () => {
      const result = shouldSyncFile({
        path: "Private/notes.md",
        excludedFolders: ["Private", "Templates"],
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("path is in excluded folders");
    });

    it("skips files in nested excluded folders", () => {
      const result = shouldSyncFile({
        path: "Private/subfolder/notes.md",
        excludedFolders: ["Private"],
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("path is in excluded folders");
    });

    it("allows files not in excluded folders", () => {
      const result = shouldSyncFile({
        path: "Notes/important.md",
        excludedFolders: ["Private", "Templates"],
      });

      expect(result.shouldSync).toBe(true);
    });
  });

  describe("underscore prefix", () => {
    it("skips files starting with underscore", () => {
      const result = shouldSyncFile({
        path: "_drafts/note.md",
        excludedFolders: [],
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("path starts with underscore");
    });

    it("allows files not starting with underscore", () => {
      const result = shouldSyncFile({
        path: "drafts/note.md",
        excludedFolders: [],
      });

      expect(result.shouldSync).toBe(true);
    });
  });

  describe("non-markdown files", () => {
    it("skips non-markdown files", () => {
      const result = shouldSyncFile({
        path: "image.png",
        excludedFolders: [],
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("not a markdown file");
    });

    it("skips javascript files", () => {
      const result = shouldSyncFile({
        path: "script.js",
        excludedFolders: [],
      });

      expect(result.shouldSync).toBe(false);
    });

    it("allows markdown files", () => {
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
      });

      expect(result.shouldSync).toBe(true);
    });
  });

  describe("content length", () => {
    it("skips content shorter than 500 chars", () => {
      const shortContent = "a".repeat(499);
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentWithoutFrontMatter: shortContent,
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("content too short");
    });

    it("allows content with exactly 500 chars", () => {
      const content = "a".repeat(500);
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentWithoutFrontMatter: content,
      });

      expect(result.shouldSync).toBe(true);
    });

    it("allows content longer than 500 chars", () => {
      const content = "a".repeat(600);
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentWithoutFrontMatter: content,
      });

      expect(result.shouldSync).toBe(true);
    });

    it("trims whitespace when checking length", () => {
      const content = "   " + "a".repeat(400) + "   ";
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentWithoutFrontMatter: content,
      });

      expect(result.shouldSync).toBe(false);
    });
  });

  describe("unchanged content", () => {
    it("skips when content hash matches cached hash", () => {
      const hash = "abc123";
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentHash: hash,
        cachedHash: hash,
      });

      expect(result.shouldSync).toBe(false);
      expect(result.reason).toBe("content unchanged");
    });

    it("allows when content hash differs from cached hash", () => {
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentHash: "newhash",
        cachedHash: "oldhash",
      });

      expect(result.shouldSync).toBe(true);
    });

    it("allows when no cached hash exists", () => {
      const result = shouldSyncFile({
        path: "notes.md",
        excludedFolders: [],
        contentHash: "newhash",
        cachedHash: undefined,
      });

      expect(result.shouldSync).toBe(true);
    });
  });
});
