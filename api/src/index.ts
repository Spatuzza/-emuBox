import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { customerRoutes } from "./routes/customers.js";
import { emitterRoutes } from "./routes/emitter.js";
import { healthRoutes } from "./routes/health.js";
import { kardexRoutes } from "./routes/kardex.js";
import { productRoutes } from "./routes/products.js";

const app = Fastify({
  bodyLimit: 4 * 1024 * 1024, // 4 MB para permitir carga de fotos en base64 (hasta 2 MB binarios)
  logger:
    env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
          },
        }
      : true,
});

await app.register(cors, {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
});

await app.register(healthRoutes);
await app.register(emitterRoutes);
await app.register(productRoutes);
await app.register(kardexRoutes);
await app.register(customerRoutes);

const shutdown = async (signal: string) => {
  app.log.info(`Recibida señal ${signal}, cerrando servidor...`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(
    `Ñemubox API escuchando en http://0.0.0.0:${env.PORT} (SIFEN_MODE=${env.SIFEN_MODE}, AI_IMAGE_PROVIDER=${env.AI_IMAGE_PROVIDER})`
  );
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
