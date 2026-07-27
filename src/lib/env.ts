import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Auth secrets (required in production)
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  // Sentry (optional)
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // Redis (optional — in-memory fallback)
  REDIS_URL: z.string().optional(),

  // Payment providers (all optional — sandbox/mock mode)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  MONNIFY_API_KEY: z.string().optional(),
  MONNIFY_SECRET_KEY: z.string().optional(),
  MONNIFY_CONTRACT_CODE: z.string().optional(),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  MTN_MOMO_USER_ID: z.string().optional(),
  MTN_MOMO_API_KEY: z.string().optional(),
  AIRTEL_MONEY_CLIENT_ID: z.string().optional(),
  AIRTEL_MONEY_CLIENT_SECRET: z.string().optional(),
  SMARTCASH_API_KEY: z.string().optional(),
  SMARTCASH_MERCHANT_ID: z.string().optional(),
  PAGA_API_KEY: z.string().optional(),
  PAGA_PUBLIC_KEY: z.string().optional(),
  PAGA_SECRET_KEY: z.string().optional(),
  BAXI_API_KEY: z.string().optional(),
  REMITA_MERCHANT_ID: z.string().optional(),
  REMITA_API_KEY: z.string().optional(),
  REMITA_API_TOKEN: z.string().optional(),
  QUICKTELLER_CLIENT_ID: z.string().optional(),
  QUICKTELLER_SECRET_KEY: z.string().optional(),

  // KYC
  DOJAH_APP_ID: z.string().optional(),
  DOJAH_PRIVATE_KEY: z.string().optional(),

  // Notifications
  TERMII_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // International transfers
  WISE_API_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  // Treasury (Celo / blockchain — dormant)
  TURBOPAY_TREASURY_PRIVATE_KEY: z.string().optional(),
  TURBOPAY_TREASURY_ADDRESS: z.string().optional(),

  // WebAuthn (passkeys)
  WEBAUTHN_RP_ID: z.string().optional(),
  WEBAUTHN_RP_NAME: z.string().optional(),

  // Sentry build-time
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Docker Compose (Postgres)
  POSTGRES_DB: z.string().optional(),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),

  // Caddy
  DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    if (process.env.NODE_ENV === "production") {
      throw new Error("Invalid environment variables");
    }
    // In dev, return with defaults
    return envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./db/custom.db",
    });
  }
  return parsed.data;
}

export const env = validateEnv();

// Helper checks
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
