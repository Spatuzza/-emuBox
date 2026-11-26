import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SIFEN_MODE: z.enum(["mock", "test", "prod"]).default("mock"),
  SIFEN_CSC_ID: z.string().default("0001"),
  SIFEN_CSC: z.string().default("ABCD0000000000000000000000000000"),
  SIFEN_CERT_PATH: z.string().default("/app/certs/certificado.p12"),
  SIFEN_CERT_PASSWORD: z.string().default(""),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);
