import { DataSourceMode, DocumentIdType, StockMovementType, TaxRate } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  closeBridgePool,
  createLegacySandboxSchema,
  getBridgeConfig,
  getExternalPool,
  importExternalToStandalone,
  serializeBridgeConfig,
} from "../services/bridge/adapter.js";
import {
  formatBridgeConnectionError,
  introspectPostgresSchema,
  testExternalConnection,
  validateMappingAgainstSchema,
} from "../services/bridge/introspect.js";
import { schemaMappingSchema } from "../services/bridge/types.js";

const testConnectionSchema = z.object({
  connectionUrl: z.string().trim().min(10).optional(),
  useSavedConnection: z.boolean().optional(),
});

const saveBridgeConfigSchema = z.object({
  mode: z.nativeEnum(DataSourceMode),
  connectionUrl: z.string().trim().min(10).optional().nullable(),
  readOnly: z.boolean().default(true),
  mapping: schemaMappingSchema.optional().nullable(),
});

const importSchema = z.object({
  connectionUrl: z.string().trim().min(10).optional(),
  useSavedConnection: z.boolean().optional(),
  mapping: schemaMappingSchema,
  replaceDemoCatalog: z.boolean().default(false),
  confirmPhrase: z.string().optional(),
});

const resetDbSchema = z.object({
  mode: z.enum(["empty", "demo"]),
  confirmPhrase: z.string(),
});

export async function bridgeRoutes(app: FastifyInstance) {
  // Leer configuración actual del Bridge (con password SIEMPRE enmascarado)
  app.get("/api/bridge/config", async () => {
    const cfg = await getBridgeConfig();
    return serializeBridgeConfig(cfg);
  });

  // Probar conexión a una BD PostgreSQL externa (solo lectura)
  app.post("/api/bridge/test", async (request, reply) => {
    const parsed = testConnectionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "URL de conexión inválida" });
    }

    const cfg = await getBridgeConfig();
    const targetUrl =
      parsed.data.connectionUrl || (parsed.data.useSavedConnection ? cfg.connectionUrl : null);
    if (!targetUrl) {
      return reply.status(400).send({ error: "Ingresá una URL de conexión PostgreSQL" });
    }

    const result = await testExternalConnection(targetUrl);
    await prisma.bridgeConfig.update({
      where: { id: 1 },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        lastTestMessage: result.message,
      },
    });

    return reply.status(result.ok ? 200 : 400).send(result);
  });

  // Introspección segura de information_schema + sugerencia automática Paraguay/Español
  app.post("/api/bridge/introspect", async (request, reply) => {
    const parsed = testConnectionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "URL de conexión inválida" });
    }

    const cfg = await getBridgeConfig();
    const targetUrl =
      parsed.data.connectionUrl || (parsed.data.useSavedConnection ? cfg.connectionUrl : null);
    if (!targetUrl) {
      return reply.status(400).send({ error: "Ingresá una URL de conexión PostgreSQL" });
    }

    try {
      const introspection = await introspectPostgresSchema(targetUrl);
      await prisma.bridgeConfig.update({
        where: { id: 1 },
        data: {
          lastTestedAt: new Date(),
          lastTestOk: true,
          lastTestMessage: `Introspección exitosa (${introspection.tables.length} tablas detectadas en "${introspection.database}")`,
        },
      });
      return introspection;
    } catch (err) {
      const message = formatBridgeConnectionError(err, targetUrl);
      return reply.status(400).send({ error: message });
    }
  });

  // Guardar configuración / cambiar entre STANDALONE y BRIDGE
  app.put("/api/bridge/config", async (request, reply) => {
    const parsed = saveBridgeConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Configuración de Bridge inválida",
        details: parsed.error.flatten(),
      });
    }

    const current = await getBridgeConfig();
    const effectiveUrl = parsed.data.connectionUrl ?? current.connectionUrl ?? null;

    if (parsed.data.mode === DataSourceMode.BRIDGE) {
      if (!effectiveUrl) {
        return reply.status(400).send({
          error: "Se requiere una URL de conexión PostgreSQL para activar Modo Bridge",
        });
      }
      if (!parsed.data.mapping) {
        return reply.status(400).send({
          error: "Se requiere un mapeo de tablas/columnas confirmado para activar Modo Bridge",
        });
      }

      // Validar conexión y lista blanca real de information_schema ANTES de activar
      try {
        const pool = await getExternalPool(effectiveUrl);
        await validateMappingAgainstSchema(pool, parsed.data.mapping);
      } catch (err) {
        return reply.status(400).send({
          error:
            err instanceof Error
              ? err.message
              : "No se pudo validar el mapeo contra la BD externa",
        });
      }
    } else {
      await closeBridgePool();
    }

    const saved = await prisma.bridgeConfig.update({
      where: { id: 1 },
      data: {
        mode: parsed.data.mode,
        connectionUrl: effectiveUrl,
        readOnly: parsed.data.readOnly,
        ...(parsed.data.mapping !== undefined
          ? { mappingJson: parsed.data.mapping ?? undefined }
          : {}),
        lastTestedAt: new Date(),
        lastTestOk: true,
        lastTestMessage:
          parsed.data.mode === DataSourceMode.BRIDGE
            ? `Modo Bridge activo (${parsed.data.readOnly ? "Solo Lectura" : "Descuento Atómico"})`
            : "Modo Standalone activo (PostgreSQL propio)",
      },
    });

    return serializeBridgeConfig(saved);
  });

  // Importación única desde BD externa -> Ñemubox Standalone
  app.post("/api/bridge/import", async (request, reply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Parámetros de importación inválidos",
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.replaceDemoCatalog && parsed.data.confirmPhrase !== "REEMPLAZAR") {
      return reply.status(400).send({
        error: 'Para reemplazar el catálogo existente debés confirmar escribiendo "REEMPLAZAR".',
      });
    }

    const current = await getBridgeConfig();
    const targetUrl =
      parsed.data.connectionUrl || (parsed.data.useSavedConnection ? current.connectionUrl : null);
    if (!targetUrl) {
      return reply.status(400).send({ error: "Falta URL de conexión de la BD origen" });
    }

    try {
      const summary = await importExternalToStandalone(
        targetUrl,
        parsed.data.mapping,
        parsed.data.replaceDemoCatalog
      );
      return {
        ok: true,
        ...summary,
        message: `Importados ${summary.importedProducts} productos y ${summary.importedCustomers} clientes a Ñemubox Standalone.`,
      };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Error durante la importación",
      });
    }
  });

  // Helper seguro de prueba: crea esquema aislado `legacy_erp` (articulos + personas) e introspecciona
  app.post("/api/bridge/sandbox-legacy", async (_request, reply) => {
    const sandbox = await createLegacySandboxSchema();
    // Guardamos la URL internamente SIN activar Bridge todavía (sigue en STANDALONE hasta confirmar)
    await prisma.bridgeConfig.upsert({
      where: { id: 1 },
      update: {
        connectionUrl: sandbox.connectionUrl,
      },
      create: {
        id: 1,
        mode: DataSourceMode.STANDALONE,
        connectionUrl: sandbox.connectionUrl,
        readOnly: true,
      },
    });

    const introspection = await introspectPostgresSchema(sandbox.connectionUrl);
    return reply.status(200).send({
      schema: sandbox.schema,
      maskedConnectionUrl: sandbox.maskedConnectionUrl,
      introspection,
    });
  });

  // Reinicio seguro de la BD INTERNA de Ñemubox (NUNCA toca una BD externa)
  app.post("/api/system/reset-db", async (request, reply) => {
    const parsed = resetDbSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.confirmPhrase.trim().toUpperCase() !== "REINICIAR") {
      return reply.status(400).send({
        error: 'Confirmación requerida: escribí exactamente "REINICIAR" para ejecutar esta acción.',
      });
    }

    await closeBridgePool();

    await prisma.$transaction(async (tx) => {
      await tx.sifenDocument.deleteMany();
      await tx.sifenBatch.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.productImage.deleteMany();
      await tx.product.deleteMany();
      await tx.customer.deleteMany();

      await tx.emitterConfig.update({
        where: { id: 1 },
        data: { ultimoNumeroFactura: 0 },
      });

      await tx.bridgeConfig.upsert({
        where: { id: 1 },
        update: { mode: DataSourceMode.STANDALONE, readOnly: true },
        create: { id: 1, mode: DataSourceMode.STANDALONE, readOnly: true },
      });

      // Siempre conservar Consumidor Final para poder facturar desde el minuto 1
      await tx.customer.create({
        data: {
          documentType: DocumentIdType.SIN_DOCUMENTO,
          documentNumber: "0",
          name: "Sin Nombre (Consumidor Final)",
          isTaxpayer: false,
        },
      });

      if (parsed.data.mode === "demo") {
        await tx.customer.create({
          data: {
            documentType: DocumentIdType.RUC,
            documentNumber: "80054321",
            dv: "9",
            name: "Cliente Contribuyente Demo S.A.",
            isTaxpayer: true,
            email: "facturacion@ejemplo.com.py",
            address: "Av. Mariscal López 1234, Asunción",
          },
        });

        const demoProducts = [
          {
            sku: "YERBA-500",
            barcode: "7840001000011",
            name: "Yerba Mate Tradicional 500g",
            price: 12500,
            cost: 8500,
            taxRate: TaxRate.IVA_10,
            stock: 40,
            minStock: 10,
          },
          {
            sku: "ARROZ-1KG",
            barcode: "7840001000028",
            name: "Arroz Tipo 1 Bolsa 1kg",
            price: 7500,
            cost: 5200,
            taxRate: TaxRate.IVA_5,
            stock: 25,
            minStock: 10,
          },
          {
            sku: "ACEITE-900",
            barcode: "7840001000035",
            name: "Aceite de Girasol 900ml",
            price: 16000,
            cost: 12000,
            taxRate: TaxRate.IVA_5,
            stock: 6,
            minStock: 8,
          },
          {
            sku: "AGUA-2L",
            barcode: "7840001000042",
            name: "Agua Mineral Sin Gas 2L",
            price: 5000,
            cost: 3000,
            taxRate: TaxRate.IVA_10,
            stock: 60,
            minStock: 15,
          },
          {
            sku: "LIBRO-PY",
            barcode: "7840001000059",
            name: "Cuaderno Escolar Educativo (Exento IVA)",
            price: 18000,
            cost: 11000,
            taxRate: TaxRate.EXENTA,
            stock: 15,
            minStock: 5,
          },
        ];

        for (const p of demoProducts) {
          const created = await tx.product.create({
            data: { ...p, unit: "UNI", unitCodeSifen: 77 },
          });
          await tx.stockMovement.create({
            data: {
              productId: created.id,
              type: StockMovementType.IN,
              quantity: p.stock,
              previousStock: 0,
              newStock: p.stock,
              unitCost: p.cost,
              referenceType: "DEMO_RESET",
              notes: "Stock inicial de demostración",
            },
          });
        }
      }
    });

    return {
      ok: true,
      mode: parsed.data.mode,
      message:
        parsed.data.mode === "empty"
          ? "Base de datos interna vaciada para producción (Emisor y Consumidor Final conservados)."
          : "Base de datos interna restaurada con datos de demostración de Paraguay.",
    };
  });
}
