import type { DocumentStore } from "@/core/documents/application/document-store";

/** An in-memory private bucket for tests, with switches to make it fail. */
export function createMemoryDocumentStore() {
  const objects = new Map<string, Uint8Array>();
  const switches = { failPut: false, failGet: false };

  const store: DocumentStore = {
    async put(key, bytes) {
      if (switches.failPut || objects.has(key)) return false;
      objects.set(key, new Uint8Array(bytes));
      return true;
    },
    async get(key) {
      if (switches.failGet) return null;
      const bytes = objects.get(key);
      return bytes ? new Uint8Array(bytes) : null;
    },
    async remove(keys) {
      for (const key of keys) objects.delete(key);
      return true;
    },
  };

  return { store, objects, switches };
}
