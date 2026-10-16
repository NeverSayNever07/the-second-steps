import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Release check failed: ${name} is missing.`);
  return value;
}

function databaseUser(value) {
  return decodeURIComponent(new URL(value).username).split(".")[0];
}

const appUrl = new URL(required("APP_URL"));
if (appUrl.protocol !== "https:") {
  throw new Error("Release check failed: APP_URL must use HTTPS.");
}

if (required("APP_ENV") !== "production") {
  throw new Error(
    'Release check failed: APP_ENV must be "production" so sandbox sign-in stays off.',
  );
}

if (required("REQUIRE_STAFF_MFA") !== "true") {
  throw new Error('Release check failed: REQUIRE_STAFF_MFA must be "true".');
}

if ((process.env.DATABASE_SSL_MODE ?? "verify-full") !== "verify-full") {
  throw new Error(
    "Release check failed: database TLS verification is required.",
  );
}

const runtimeDatabaseUrl = required("DATABASE_URL");
const migrationDatabaseUrl = required("MIGRATION_DATABASE_URL");
if (databaseUser(runtimeDatabaseUrl) === databaseUser(migrationDatabaseUrl)) {
  throw new Error(
    "Release check failed: runtime and migration database users must differ.",
  );
}

const supabaseUrl = new URL(required("SUPABASE_URL"));
if (supabaseUrl.protocol !== "https:") {
  throw new Error("Release check failed: Supabase must use HTTPS.");
}

const response = await fetch(new URL("/auth/v1/settings", supabaseUrl), {
  headers: {
    apikey: required("SUPABASE_PUBLISHABLE_KEY"),
  },
});
if (!response.ok) {
  throw new Error(
    `Release check failed: Supabase Auth settings returned ${response.status}.`,
  );
}

const settings = await response.json();
const signupDisabled =
  settings.disable_signup === true || settings.disableSignup === true;
if (!signupDisabled) {
  throw new Error(
    "Release check failed: public Supabase Auth sign-up is still enabled.",
  );
}

console.log("Release security checks passed.");
