// TODO: remove once every env file uses the server-only names.
const PREVIOUS_NAMES: Readonly<Record<string, string>> = {
  SUPABASE_URL: "NEXT_PUBLIC_SUPABASE_URL",
  SUPABASE_PUBLISHABLE_KEY: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  APP_URL: "NEXT_PUBLIC_APP_URL",
};

function rejectPreviousName(name: string) {
  const previousName = PREVIOUS_NAMES[name];
  if (previousName && process.env[previousName]) {
    throw new Error(
      `Rename ${previousName} to ${name} in your env file. It is server-only now, so it no longer has the NEXT_PUBLIC_ prefix.`,
    );
  }
}

function requireEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (value) return value;

  rejectPreviousName(name);
  throw new Error(`Missing required environment variable: ${name}`);
}

export function getSupabasePublicEnvironment() {
  return {
    url: requireEnvironmentVariable("SUPABASE_URL"),
    publishableKey: requireEnvironmentVariable("SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getSupabaseSecretKey() {
  return requireEnvironmentVariable("SUPABASE_SECRET_KEY");
}

export function getAppUrl() {
  const appUrl = process.env.APP_URL;
  if (appUrl) return appUrl;

  rejectPreviousName("APP_URL");
  return "http://localhost:3000";
}

export function getMailpitApiUrl() {
  return process.env.MAILPIT_API_URL ?? "http://127.0.0.1:8025";
}
