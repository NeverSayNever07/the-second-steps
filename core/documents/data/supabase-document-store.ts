import "server-only";

import { createSupabaseAdminClient } from "@/core/auth/supabase-admin";
import type { DocumentStore } from "../application/document-store";

/** The one private bucket for every workspace (ADR-008). */
export const DOCUMENTS_BUCKET = "zayto-documents";

/**
 * The private bucket, reached with the server-only secret key, which bypasses
 * Storage's own rules (owner decision 2026-10-20). Zayto's database records
 * and services decide access before any call here. Failures return false or
 * null without logging, so no file content or key reaches the logs.
 */
export function createSupabaseDocumentStore(): DocumentStore {
  const bucket = () =>
    createSupabaseAdminClient().storage.from(DOCUMENTS_BUCKET);

  return {
    async put(key, bytes, contentType) {
      try {
        const { error } = await bucket().upload(key, bytes, {
          contentType,
          upsert: false,
          cacheControl: "0",
        });
        return !error;
      } catch {
        return false;
      }
    },
    async get(key) {
      try {
        const { data, error } = await bucket().download(key);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      } catch {
        return null;
      }
    },
    async remove(keys) {
      if (keys.length === 0) return true;
      try {
        const { error } = await bucket().remove([...keys]);
        return !error;
      } catch {
        return false;
      }
    },
  };
}
