import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    console.error(
      `\nFailed to start: invalid environment configuration.\n${missing.map((m) => `  - ${m}`).join('\n')}\n\nCopy backend/.env.example to backend/.env and fill in the missing values.\n`,
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
