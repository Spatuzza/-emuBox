import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        service: "emubox-api",
        version: "0.1.0",
        database: "connected",
        sifenMode: env.SIFEN_MODE,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error(error, "Database healthcheck failed");
      return reply.status(503).send({
        status: "error",
        service: "emubox-api",
        database: "disconnected",
        sifenMode: env.SIFEN_MODE,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/api/system/status", async () => {
    const [emitter, productCount, customerCount, saleCount, sifenDocCount, products] =
      await Promise.all([
        prisma.emitterConfig.findUnique({ where: { id: 1 } }),
        prisma.product.count({ where: { active: true } }),
        prisma.customer.count({ where: { active: true } }),
        prisma.sale.count(),
        prisma.sifenDocument.count(),
        prisma.product.findMany({
          where: { active: true },
          select: { stock: true, minStock: true },
        }),
      ]);

    const lowStockCount = products.filter(
      (p) => Number(p.stock) <= Number(p.minStock)
    ).length;

    return {
      service: "emubox-api",
      version: "0.1.0",
      sifenMode: env.SIFEN_MODE,
      emitter: emitter
        ? {
            ruc: `${emitter.ruc}-${emitter.dv}`,
            razonSocial: emitter.razonSocial,
            timbrado: emitter.timbrado,
            puntoVenta: `${emitter.establecimiento}-${emitter.puntoExpedicion}`,
            ultimoNumeroFactura: emitter.ultimoNumeroFactura,
          }
        : null,
      counts: {
        products: productCount,
        lowStockProducts: lowStockCount,
        customers: customerCount,
        sales: saleCount,
        sifenDocuments: sifenDocCount,
      },
      modules: [
        { id: "infra", name: "Infraestructura y Base de Datos", status: "ready" },
        { id: "stock", name: "Productos, IVA PY y Kardex", status: "planned" },
        { id: "pos-sifen-mock", name: "POS + SIFEN v150 (Modo Mock + KuDE)", status: "planned" },
        { id: "sifen-lotes", name: "Conector SIFEN Test/Prod (.p12 + Lotes)", status: "planned" },
        { id: "network", name: "Red segura (Caddy HTTPS / Cloudflare Tunnel)", status: "planned" },
      ],
      timestamp: new Date().toISOString(),
    };
  });
}
