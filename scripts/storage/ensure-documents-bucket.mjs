// Checks, and with --apply creates or corrects, the private documents bucket
// (ADR-008, .cursor/plans/c0-design-private-documents.md).
//
//   node scripts/storage/ensure-documents-bucket.mjs           report only
//   node scripts/storage/ensure-documents-bucket.mjs --apply   create or fix
//
// --apply changes the Supabase project in SUPABASE_URL: run it against the
// shared project only with the owner's approval. Keys are never printed.
//
// It also proves the lock-out: with the publishable key (what an anonymous
// caller has), listing, reading and writing the bucket must all fail. Run
// scripts/storage/check-storage-policies.sql in the Supabase SQL editor to
// confirm no policy lets signed-in users in either.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BUCKET = "zayto-documents";
const SETTINGS = {
  public: false,
  fileSizeLimit: 10_485_760,
  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
};

const isApply = process.argv.includes("--apply");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

const url = required("SUPABASE_URL");
const options = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};
const admin = createClient(url, required("SUPABASE_SECRET_KEY"), options);
const anonymous = createClient(
  url,
  required("SUPABASE_PUBLISHABLE_KEY"),
  options,
);

function differences(bucket) {
  const found = {
    public: bucket.public,
    fileSizeLimit: Number(bucket.file_size_limit),
    allowedMimeTypes: [...(bucket.allowed_mime_types ?? [])].sort(),
  };
  const wanted = {
    ...SETTINGS,
    allowedMimeTypes: [...SETTINGS.allowedMimeTypes].sort(),
  };
  return Object.keys(wanted).filter(
    (key) => JSON.stringify(found[key]) !== JSON.stringify(wanted[key]),
  );
}

async function ensureBucket() {
  const { data: bucket, error } = await admin.storage.getBucket(BUCKET);
  if (error || !bucket) {
    if (!isApply) return { ok: false, message: `${BUCKET} does not exist.` };
    const created = await admin.storage.createBucket(BUCKET, SETTINGS);
    if (created.error) {
      return {
        ok: false,
        message: `Could not create ${BUCKET}: ${created.error.message}`,
      };
    }
    return {
      ok: true,
      message: `Created ${BUCKET} (private, 10 MB, PDF/JPEG/PNG).`,
    };
  }

  const wrong = differences(bucket);
  if (wrong.length === 0)
    return { ok: true, message: `${BUCKET} has the expected settings.` };
  if (!isApply) {
    return {
      ok: false,
      message: `${BUCKET} settings differ: ${wrong.join(", ")}.`,
    };
  }
  const updated = await admin.storage.updateBucket(BUCKET, SETTINGS);
  if (updated.error) {
    return {
      ok: false,
      message: `Could not correct ${BUCKET}: ${updated.error.message}`,
    };
  }
  return { ok: true, message: `Corrected ${BUCKET}: ${wrong.join(", ")}.` };
}

async function checkAnonymousLockOut() {
  const probeKey = `lockout-probe/${crypto.randomUUID()}.pdf`;
  const failures = [];

  const listed = await anonymous.storage.from(BUCKET).list();
  if (!listed.error && (listed.data ?? []).length > 0) {
    failures.push("an anonymous caller can list objects");
  }

  const uploaded = await anonymous.storage
    .from(BUCKET)
    .upload(
      probeKey,
      new Blob(["%PDF-1.7\n%%EOF\n"], { type: "application/pdf" }),
    );
  if (!uploaded.error) {
    failures.push("an anonymous caller can upload");
    await admin.storage.from(BUCKET).remove([probeKey]);
  }

  const publicUrl = anonymous.storage.from(BUCKET).getPublicUrl(probeKey)
    .data.publicUrl;
  const response = await fetch(publicUrl).catch(() => null);
  if (response?.ok) failures.push("objects are served from a public URL");

  return failures.length === 0
    ? { ok: true, message: "Anonymous callers cannot list, upload or read." }
    : { ok: false, message: `Lock-out failed: ${failures.join("; ")}.` };
}

const results = [await ensureBucket()];
if (results[0].ok) results.push(await checkAnonymousLockOut());

for (const result of results) {
  console.log(`${result.ok ? "OK  " : "FAIL"} ${result.message}`);
}
if (results.some((result) => !result.ok)) process.exitCode = 1;
