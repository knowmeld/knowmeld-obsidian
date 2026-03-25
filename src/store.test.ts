import { describe, it, expect, vi } from "vitest";
import { CacheStore } from "./store";

describe("CacheStore", () => {
  const save = vi.fn().mockResolvedValue(undefined);

  describe("fromRaw (migration)", () => {
    it("converts legacy string hash entries to CacheEntry objects", () => {
      const result = CacheStore.fromRaw({ "notes/a.md": "abc123" });
      expect(result["notes/a.md"]).toEqual({ hash: "abc123" });
    });

    it("preserves already-migrated CacheEntry objects", () => {
      const result = CacheStore.fromRaw({ "notes/b.md": { hash: "def456", documentId: "doc-1" } });
      expect(result["notes/b.md"]).toEqual({ hash: "def456", documentId: "doc-1" });
    });

    it("handles mixed legacy and migrated entries", () => {
      const result = CacheStore.fromRaw({
        "legacy.md": "oldhash",
        "modern.md": { hash: "newhash", documentId: "doc-2" },
      });
      expect(result["legacy.md"]).toEqual({ hash: "oldhash" });
      expect(result["modern.md"]).toEqual({ hash: "newhash", documentId: "doc-2" });
    });

    it("returns empty object for empty input", () => {
      expect(CacheStore.fromRaw({})).toEqual({});
    });
  });

  describe("get/set", () => {
    it("returns undefined for unknown paths", () => {
      const store = new CacheStore({}, save);
      expect(store.get("missing.md")).toBeUndefined();
    });

    it("sets and gets a hash", () => {
      const store = new CacheStore({}, save);
      store.set("notes.md", "hash1");
      expect(store.get("notes.md")).toBe("hash1");
    });

    it("preserves documentId when updating hash", () => {
      const store = new CacheStore({ "notes.md": { hash: "old", documentId: "doc-1" } }, save);
      store.set("notes.md", "new");
      expect(store.get("notes.md")).toBe("new");
      expect(store.getDocumentId("notes.md")).toBe("doc-1");
    });
  });

  describe("remove", () => {
    it("removes an entry", () => {
      const store = new CacheStore({ "notes.md": { hash: "h" } }, save);
      store.remove("notes.md");
      expect(store.get("notes.md")).toBeUndefined();
    });

    it("silently handles removing a non-existent entry", () => {
      const store = new CacheStore({}, save);
      expect(() => store.remove("ghost.md")).not.toThrow();
    });
  });

  describe("rename", () => {
    it("moves the entry to the new path", () => {
      const store = new CacheStore({ "old.md": { hash: "h", documentId: "d" } }, save);
      store.rename("old.md", "new.md");
      expect(store.get("old.md")).toBeUndefined();
      expect(store.get("new.md")).toBe("h");
      expect(store.getDocumentId("new.md")).toBe("d");
    });

    it("does nothing when renaming a non-existent entry", () => {
      const store = new CacheStore({}, save);
      store.rename("ghost.md", "real.md");
      expect(store.get("real.md")).toBeUndefined();
    });
  });

  describe("documentId", () => {
    it("sets and gets a documentId", () => {
      const store = new CacheStore({ "notes.md": { hash: "h" } }, save);
      store.setDocumentId("notes.md", "doc-42");
      expect(store.getDocumentId("notes.md")).toBe("doc-42");
    });

    it("does not set documentId for unknown paths", () => {
      const store = new CacheStore({}, save);
      store.setDocumentId("ghost.md", "doc-99");
      expect(store.getDocumentId("ghost.md")).toBeUndefined();
    });
  });
});
