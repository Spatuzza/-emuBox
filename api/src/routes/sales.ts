import fs from "node:fs/promises";
import path from "node:path";
import {
  PaymentCondition,
  PaymentMethod,
  SaleStatus,
  SifenDocumentStatus,
  SifenMode,
  StockMovementType,
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  atomicDeductExternalStock,
  atomicRestoreExternalStock,
  getBridgeConfig,
  isBridgeActive,
} from "../services/bridge/adapter.js";
import { generateSifenCDC } from "../services/sifen/cdc.js";
import { generateKudePdf } from "../services/sifen/kudePdf.js";
import {
  buildSifenXmlV150,
  computeItemIva,
  computeSaleTotals,
  type SifenLineItem,
} from "../services/sifen/xmlGenerator.js";

const createSaleSchema = z.object({
  customerId: z.string().min(1),
  paymentCondition: z.nativeEnum(PaymentCondition).default(PaymentCondition.CONTADO),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.EFECTIVO),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1, "Debe incluir al menos un producto"),
});

function serializeSifenDocument(doc: {
  id: string;
  cdc: string;
  establecimiento: string;
  puntoExpedicion: string;
  documentNumber: string;
  mode: SifenMode;
  status: SifenDocumentStatus;
  xmlGenerated: string | null;
  qrUrl: string | null;
  sifenResponseCode: string | null;
  sifenResponseMsg: string | null;
  createdAt: Date;
  sale: {
    saleNumber: number;
    paymentCondition: PaymentCondition;
    paymentMethod: PaymentMethod;
    subtotalExenta: unknown;
    subtotalIva5: unknown;
    subtotalIva10: unknown;
    totalIva5: unknown;
    totalIva10: unknown;
    totalAmount: unknown;
    customer: {
      id: string;
      documentType: string;
      documentNumber: string;
      dv: string | null;
      name: string;
      isTaxpayer: boolean;
      email: string | null;
      address: string | null;
    };
    items: Array<{
      productId: string;
      productSku: string;
      productName: string;
      quantity: unknown;
      unitPrice: unknown;
      taxRate: string;
      lineTotal: unknown;
      ivaAmount: unknown;
    }>;
  };
}) {
  return {
    id: doc.id,
    saleNumber: doc.sale.saleNumber,
    documentFullNumber: `${doc.establecimiento}-${doc.puntoExpedicion}-${doc.documentNumber}`,
    cdc: doc.cdc,
    mode: doc.mode.toLowerCase() as "mock" | "test" | "prod",
    status: doc.status,
    customer: {
      id: doc.sale.customer.id,
      documentType: doc.sale.customer.documentType,
      documentNumber: doc.sale.customer.documentNumber,
      dv: doc.sale.customer.dv ?? undefined,
      name: doc.sale.customer.name,
      isTaxpayer: doc.sale.customer.isTaxpayer,
      email: doc.sale.customer.email ?? undefined,
      address: doc.sale.customer.address ?? undefined,
    },
    paymentCondition: doc.sale.paymentCondition,
    paymentMethod: doc.sale.paymentMethod,
    items: doc.sale.items.map((it) => ({
      productId: it.productId,
      productSku: it.productSku,
      productName: it.productName,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      taxRate: it.taxRate,
      lineTotal: Number(it.lineTotal),
      ivaAmount: Number(it.ivaAmount),
    })),
    subtotalExenta: Number(doc.sale.subtotalExenta),
    subtotalIva5: Number(doc.sale.subtotalIva5),
    subtotalIva10: Number(doc.sale.subtotalIva10),
    totalIva5: Number(doc.sale.totalIva5),
    totalIva10: Number(doc.sale.totalIva10),
    totalAmount: Number(doc.sale.totalAmount),
    qrUrl: doc.qrUrl ?? "",
    qrImageUrl: `/api/sifen/documents/${doc.id}/qr`,
    kudeA4Url: `/api/sifen/documents/${doc.id}/kude?format=a4`,
    kude80mmUrl: `/api/sifen/documents/${doc.id}/kude?format=80mm`,
    xmlDownloadUrl: `/api/sifen/documents/${doc.id}/xml`,
    xmlPreview: doc.xmlGenerated ?? "",
    sifenResponseCode: doc.sifenResponseCode ?? "",
    sifenResponseMsg: doc.sifenResponseMsg ?? "",
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function salesRoutes(app: FastifyInstance) {
  // Emitir venta + descuento atómico de stock + Kardex + DE SIFEN v150 en una sola transacción
  app.post("/api/sales", async (request, reply) => {
    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de venta inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const issuedAt = new Date();
    const bridgeCfg = await getBridgeConfig();
    const bridged = isBridgeActive(bridgeCfg);

    // Agrupar cantidades si un producto se envió repetido
    const qtyMap = new Map<string, number>();
    for (const it of input.items) {
      qtyMap.set(it.productId, (qtyMap.get(it.productId) ?? 0) + it.quantity);
    }

    let externalDeductedItems: Array<{ externalRawId: string; quantity: number }> = [];
    let externalUpdatedStocks = new Map<string, number>();

    try {
      // Si Bridge está activo en modo escritura atómica, descontar primero en la BD externa
      // dentro de una transacción propia; si falla el Sidecar, compensamos automáticamente.
      if (bridged && !bridgeCfg.readOnly) {
        const preProducts = await prisma.product.findMany({
          where: { id: { in: Array.from(qtyMap.keys()) }, active: true },
        });
        const extDeductionPayload = preProducts
          .filter((p) => p.externalId?.startsWith("bridge:"))
          .map((p) => ({
            externalRawId: p.externalId!.slice("bridge:".length),
            productName: p.name,
            quantity: qtyMap.get(p.id) ?? 0,
          }))
          .filter((x) => x.quantity > 0);

        if (extDeductionPayload.length > 0) {
          const extRes = await atomicDeductExternalStock(bridgeCfg, extDeductionPayload);
          if (extRes.applied) {
            externalDeductedItems = extDeductionPayload.map((x) => ({
              externalRawId: x.externalRawId,
              quantity: x.quantity,
            }));
            externalUpdatedStocks = extRes.updatedStocks;
          }
        }
      }

      const createdDoc = await prisma.$transaction(async (tx) => {
        const [emitter, customer] = await Promise.all([
          tx.emitterConfig.findUnique({ where: { id: 1 } }),
          tx.customer.findUnique({ where: { id: input.customerId } }),
        ]);

        if (!emitter) {
          throw Object.assign(new Error("Emisor no configurado"), { statusCode: 400 });
        }
        if (!customer) {
          throw Object.assign(new Error("Cliente no encontrado"), { statusCode: 404 });
        }

        const productIds = Array.from(qtyMap.keys());
        const dbProducts = await tx.product.findMany({
          where: { id: { in: productIds }, active: true },
        });
        const productById = new Map(dbProducts.map((p) => [p.id, p]));

        const lineItems: SifenLineItem[] = [];
        for (const [productId, quantity] of qtyMap.entries()) {
          const prod = productById.get(productId);
          if (!prod) {
            throw Object.assign(new Error(`Producto ${productId} no encontrado`), {
              statusCode: 404,
            });
          }
          const currentStock = Number(prod.stock);
          // En Standalone exigimos stock suficiente local; en Bridge atómico ya se validó en la BD externa
          if (!bridged && currentStock < quantity) {
            throw Object.assign(
              new Error(
                `Stock insuficiente para "${prod.name}" (disponible: ${currentStock}, solicitado: ${quantity})`
              ),
              { statusCode: 409 }
            );
          }

          const unitPrice = Number(prod.price);
          const lineTotal = Math.round(unitPrice * quantity);
          lineItems.push({
            productSku: prod.sku,
            productName: prod.name,
            unitCodeSifen: prod.unitCodeSifen,
            quantity,
            unitPrice,
            taxRate: prod.taxRate,
            lineTotal,
            ivaAmount: computeItemIva(lineTotal, prod.taxRate),
          });
        }

        // Incrementar correlativo atómicamente para garantizar numeración única
        const updatedEmitter = await tx.emitterConfig.update({
          where: { id: 1 },
          data: { ultimoNumeroFactura: { increment: 1 } },
        });
        const nextDocNum = updatedEmitter.ultimoNumeroFactura;

        const { cdc, securityCode, documentNumberPadded } = generateSifenCDC({
          deType: 1,
          ruc: updatedEmitter.ruc,
          dv: updatedEmitter.dv,
          establecimiento: updatedEmitter.establecimiento,
          puntoExpedicion: updatedEmitter.puntoExpedicion,
          documentNumber: nextDocNum,
          issuedAt,
        });

        const fullNumber = `${updatedEmitter.establecimiento}-${updatedEmitter.puntoExpedicion}-${documentNumberPadded}`;
        const totals = computeSaleTotals(lineItems);

        const { xml, qrUrl } = buildSifenXmlV150({
          cdc,
          securityCode,
          documentNumberPadded,
          emitter: updatedEmitter,
          customer,
          paymentCondition: input.paymentCondition,
          paymentMethod: input.paymentMethod,
          items: lineItems,
          issuedAt,
        });

        // Crear Sale + SaleItems
        const sale = await tx.sale.create({
          data: {
            customerId: customer.id,
            status: SaleStatus.COMPLETED,
            paymentCondition: input.paymentCondition,
            paymentMethod: input.paymentMethod,
            currency: "PYG",
            subtotalExenta: totals.subtotalExenta,
            subtotalIva5: totals.subtotalIva5,
            subtotalIva10: totals.subtotalIva10,
            totalIva5: totals.totalIva5,
            totalIva10: totals.totalIva10,
            totalAmount: totals.totalAmount,
            notes: input.notes ?? null,
            items: {
              create: Array.from(qtyMap.entries()).map(([productId, quantity]) => {
                const prod = productById.get(productId)!;
                const unitPrice = Number(prod.price);
                const lineTotal = Math.round(unitPrice * quantity);
                return {
                  productId: prod.id,
                  productSku: prod.sku,
                  productName: prod.name,
                  quantity,
                  unitPrice,
                  taxRate: prod.taxRate,
                  lineTotal,
                  ivaAmount: computeItemIva(lineTotal, prod.taxRate),
                };
              }),
            },
          },
        });

        // Actualizar stock local/sombra y registrar Kardex SALE en Sidecar
        for (const [productId, quantity] of qtyMap.entries()) {
          const prod = productById.get(productId)!;
          const previousStock = Number(prod.stock);
          const extRawId = prod.externalId?.startsWith("bridge:")
            ? prod.externalId.slice("bridge:".length)
            : null;

          let newStock = previousStock;
          let kardexNote = `Venta #${sale.saleNumber} · DE ${fullNumber}`;

          if (bridged && bridgeCfg.readOnly) {
            newStock = previousStock; // Solo Lectura: BD externa sin modificar
            kardexNote = `Venta #${sale.saleNumber} · DE ${fullNumber} (Bridge Solo Lectura)`;
          } else if (bridged && extRawId && externalUpdatedStocks.has(extRawId)) {
            newStock = externalUpdatedStocks.get(extRawId)!;
            kardexNote = `Venta #${sale.saleNumber} · DE ${fullNumber} (Bridge Atómico)`;
            await tx.product.update({ where: { id: prod.id }, data: { stock: newStock } });
          } else {
            newStock = Math.max(0, previousStock - quantity);
            await tx.product.update({ where: { id: prod.id }, data: { stock: newStock } });
          }

          await tx.stockMovement.create({
            data: {
              productId: prod.id,
              type: StockMovementType.SALE,
              quantity: -quantity,
              previousStock,
              newStock,
              referenceType: bridged ? "BRIDGE_SALE" : "SALE",
              referenceId: fullNumber,
              notes: kardexNote,
            },
          });
        }

        const isMock = updatedEmitter.sifenMode === SifenMode.MOCK;

        const doc = await tx.sifenDocument.create({
          data: {
            saleId: sale.id,
            cdc,
            deType: 1,
            establecimiento: updatedEmitter.establecimiento,
            puntoExpedicion: updatedEmitter.puntoExpedicion,
            documentNumber: documentNumberPadded,
            mode: updatedEmitter.sifenMode,
            status: isMock ? SifenDocumentStatus.APPROVED : SifenDocumentStatus.QUEUED,
            xmlGenerated: xml,
            qrUrl,
            sifenProtocol: isMock ? `MOCK-${Date.now()}` : null,
            sifenResponseCode: isMock ? "0260" : "0300",
            sifenResponseMsg: isMock
              ? "Aprobado (Simulación SIFEN v150 en modo mock)"
              : "En cola de envío de lote SIFEN",
          },
          include: {
            sale: {
              include: {
                customer: true,
                items: true,
              },
            },
          },
        });

        return doc;
      });

      // Respaldo opcional del XML en volumen /app/storage/xml
      try {
        const xmlDir = path.resolve("/app/storage/xml");
        await fs.mkdir(xmlDir, { recursive: true });
        await fs.writeFile(
          path.join(xmlDir, `${createdDoc.cdc}.xml`),
          createdDoc.xmlGenerated ?? "",
          "utf-8"
        );
      } catch (storageErr) {
        app.log.warn(storageErr, "No se pudo guardar copia del XML en /app/storage/xml");
      }

      return reply.status(201).send(serializeSifenDocument(createdDoc));
    } catch (err) {
      // Compensación automática: si ya descontamos en la BD externa pero falló el Sidecar, restaurar
      if (externalDeductedItems.length > 0) {
        await atomicRestoreExternalStock(bridgeCfg, externalDeductedItems).catch((compErr) =>
          app.log.error(compErr, "Error compensando stock externo tras fallo de Sidecar")
        );
      }
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode && err instanceof Error) {
        return reply.status(statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // Listar Documentos Electrónicos SIFEN
  app.get("/api/sifen/documents", async (request) => {
    const query = request.query as { status?: string; q?: string; limit?: string };
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 100));
    const q = query.q?.trim();

    const rows = await prisma.sifenDocument.findMany({
      where: {
        ...(query.status &&
        Object.values(SifenDocumentStatus).includes(query.status as SifenDocumentStatus)
          ? { status: query.status as SifenDocumentStatus }
          : {}),
        ...(q
          ? {
              OR: [
                { cdc: { contains: q, mode: "insensitive" } },
                { documentNumber: { contains: q, mode: "insensitive" } },
                { sale: { customer: { name: { contains: q, mode: "insensitive" } } } },
                { sale: { customer: { documentNumber: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        sale: {
          include: {
            customer: true,
            items: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map(serializeSifenDocument);
  });

  // Descargar XML SIFEN v150
  app.get("/api/sifen/documents/:id/xml", async (request, reply) => {
    const { id } = request.params as { id: string };
    const doc = await prisma.sifenDocument.findUnique({ where: { id } });
    if (!doc || !doc.xmlGenerated) {
      return reply.status(404).send({ error: "Documento XML no encontrado" });
    }
    reply.header("Content-Type", "application/xml; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${doc.cdc}.xml"`);
    return reply.send(doc.xmlGenerated);
  });

  // Servir código QR escaneable (SVG) del documento
  app.get("/api/sifen/documents/:id/qr", async (request, reply) => {
    const { id } = request.params as { id: string };
    const doc = await prisma.sifenDocument.findUnique({
      where: { id },
      select: { qrUrl: true },
    });
    if (!doc || !doc.qrUrl) {
      return reply.status(404).send({ error: "QR no encontrado" });
    }
    const svg = await QRCode.toString(doc.qrUrl, {
      type: "svg",
      margin: 1,
      width: 200,
      errorCorrectionLevel: "M",
    });
    reply.header("Content-Type", "image/svg+xml; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(svg);
  });

  // Generar y descargar KuDE PDF real (A4 o Ticket Térmico 80mm)
  app.get("/api/sifen/documents/:id/kude", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { format?: string; download?: string };
    const format: "a4" | "80mm" = query.format === "80mm" ? "80mm" : "a4";

    const [doc, emitter] = await Promise.all([
      prisma.sifenDocument.findUnique({
        where: { id },
        include: {
          sale: {
            include: {
              customer: true,
              items: true,
            },
          },
        },
      }),
      prisma.emitterConfig.findUnique({ where: { id: 1 } }),
    ]);

    if (!doc || !emitter) {
      return reply.status(404).send({ error: "Documento o emisor no encontrado" });
    }

    const fullNumber = `${doc.establecimiento}-${doc.puntoExpedicion}-${doc.documentNumber}`;
    const pdfBuffer = await generateKudePdf({
      format,
      emitter: {
        ruc: emitter.ruc,
        dv: emitter.dv,
        razonSocial: emitter.razonSocial,
        timbrado: emitter.timbrado,
        direccion: emitter.direccion,
        telefono: emitter.telefono ?? "",
        actividadEconomicaDesc: emitter.actividadEconomicaDesc,
      },
      documentFullNumber: fullNumber,
      cdc: doc.cdc,
      mode: doc.mode,
      status: doc.status,
      issuedAt: doc.createdAt,
      customer: doc.sale.customer,
      paymentCondition: doc.sale.paymentCondition,
      paymentMethod: doc.sale.paymentMethod,
      items: doc.sale.items.map((it) => ({
        productSku: it.productSku,
        productName: it.productName,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        taxRate: it.taxRate,
        lineTotal: Number(it.lineTotal),
      })),
      subtotalExenta: Number(doc.sale.subtotalExenta),
      subtotalIva5: Number(doc.sale.subtotalIva5),
      subtotalIva10: Number(doc.sale.subtotalIva10),
      totalIva5: Number(doc.sale.totalIva5),
      totalIva10: Number(doc.sale.totalIva10),
      totalAmount: Number(doc.sale.totalAmount),
      qrUrl: doc.qrUrl ?? "",
    });

    const disposition = query.download === "1" ? "attachment" : "inline";
    reply.header("Content-Type", "application/pdf");
    reply.header(
      "Content-Disposition",
      `${disposition}; filename="KuDE-${fullNumber}-${format}.pdf"`
    );
    return reply.send(pdfBuffer);
  });

  // Cancelar DE (evento de cancelación hasta 48h + reposición atómica de stock en Kardex / BD externa)
  app.post("/api/sifen/documents/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const bridgeCfg = await getBridgeConfig();
    const bridged = isBridgeActive(bridgeCfg);

    try {
      const extRestoreItems: Array<{ externalRawId: string; quantity: number }> = [];

      const updated = await prisma.$transaction(async (tx) => {
        const doc = await tx.sifenDocument.findUnique({
          where: { id },
          include: {
            sale: {
              include: { items: true, customer: true },
            },
          },
        });

        if (!doc) {
          throw Object.assign(new Error("Documento no encontrado"), { statusCode: 404 });
        }
        if (doc.status === SifenDocumentStatus.CANCELLED) {
          throw Object.assign(new Error("El documento ya fue cancelado"), { statusCode: 409 });
        }

        const fullNumber = `${doc.establecimiento}-${doc.puntoExpedicion}-${doc.documentNumber}`;

        // Restaurar stock de cada ítem y registrar Kardex RETURN
        for (const item of doc.sale.items) {
          const prod = await tx.product.findUnique({ where: { id: item.productId } });
          if (!prod) continue;
          const qty = Number(item.quantity);
          const prevStock = Number(prod.stock);
          const isExternalItem = Boolean(prod.externalId?.startsWith("bridge:"));

          if (bridged && isExternalItem && !bridgeCfg.readOnly) {
            extRestoreItems.push({
              externalRawId: prod.externalId!.slice("bridge:".length),
              quantity: qty,
            });
          }

          const shouldUpdateLocal = !bridged || !bridgeCfg.readOnly;
          const newStock = shouldUpdateLocal ? prevStock + qty : prevStock;

          if (shouldUpdateLocal) {
            await tx.product.update({
              where: { id: prod.id },
              data: { stock: newStock },
            });
          }

          await tx.stockMovement.create({
            data: {
              productId: prod.id,
              type: StockMovementType.RETURN,
              quantity: qty,
              previousStock: prevStock,
              newStock,
              referenceType: "SIFEN_CANCEL",
              referenceId: fullNumber,
              notes:
                bridged && bridgeCfg.readOnly
                  ? `Cancelación DE ${fullNumber} (Bridge Solo Lectura)`
                  : `Cancelación DE ${fullNumber} (reposición de stock)`,
            },
          });
        }

        await tx.sale.update({
          where: { id: doc.saleId },
          data: { status: SaleStatus.CANCELLED },
        });

        return tx.sifenDocument.update({
          where: { id: doc.id },
          data: {
            status: SifenDocumentStatus.CANCELLED,
            sifenResponseCode: "0600",
            sifenResponseMsg:
              bridged && bridgeCfg.readOnly
                ? "Evento de cancelación registrado (Bridge Solo Lectura)"
                : "Evento de cancelación registrado (stock repuesto)",
          },
          include: {
            sale: {
              include: { customer: true, items: true },
            },
          },
        });
      });

      if (extRestoreItems.length > 0) {
        await atomicRestoreExternalStock(bridgeCfg, extRestoreItems);
      }

      return serializeSifenDocument(updated);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode && err instanceof Error) {
        return reply.status(statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
}
