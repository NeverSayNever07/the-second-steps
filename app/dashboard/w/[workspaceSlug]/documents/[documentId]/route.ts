import type { NextRequest } from "next/server";
import { getMfaVerifiedUser } from "@/core/auth/mfa";
import { downloadHeaders } from "@/core/documents/application/document-http";
import {
  downloadDocument,
  type DownloadDocumentError,
} from "@/core/documents/application/documents";
import { createSupabaseDocumentStore } from "@/core/documents/data/supabase-document-store";

// A verified, non-cacheable attachment. The proxy skips this route
// (proxy.ts), so it checks the session itself and its own security headers
// are the only ones on the response.

function refuse(status: number, error: string) {
  return Response.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const STATUS: Record<DownloadDocumentError, number> = {
  access_denied: 404,
  document_not_found: 404,
  integrity_mismatch: 502,
  storage_unavailable: 503,
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspaceSlug: string; documentId: string }> },
) {
  const { workspaceSlug, documentId } = await context.params;

  const user = await getMfaVerifiedUser({ workspaceSlug });
  if (!user) return refuse(401, "sign_in_required");

  const result = await downloadDocument({
    actor: { authSubject: user.id, workspaceSlug },
    documentId,
    store: createSupabaseDocumentStore(),
  });
  // Not found and not allowed look the same, so ids cannot be probed.
  if (!result.ok) {
    return refuse(
      STATUS[result.error],
      result.error === "access_denied" ? "document_not_found" : result.error,
    );
  }

  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: downloadHeaders(result.document),
  });
}
