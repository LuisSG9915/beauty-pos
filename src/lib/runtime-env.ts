import { getCloudflareContext } from "@opennextjs/cloudflare";

type RuntimeEnv = {
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  BREVO_FROM_NAME?: string;
  ALLOW_DEV_INVITATION_LINK?: string;
  /** Bearer que protege /api/cron/*; debe configurarse en el scheduler externo. */
  CRON_SECRET?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  try {
    return getCloudflareContext({ async: false }).env as RuntimeEnv;
  } catch {
    return process.env as RuntimeEnv;
  }
}
