import { StockMovementType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const createMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.nativeEnum(StockMovementType),
  quantity: z.coerce.number().min(0),
  notes: z.string().trim().max(300).optional(),
  referenceType: z.string().trim().max(40).optional(),
  referenceId: z.string().trim().max(64).optional(),
});

export async function kardexRoutes(app: FastifyInstance) {
  app.get("/api/stock/movements", async (request) => {
    const query = request.query as { productId?: string; limit?: string };
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 100));

    const rows = await prisma.stockMovement.findMany({
      where: query.productId ? { productId: query.productId } : undefined,
      include: {
        product: { select: { name: true, sku: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      productSku: m.product.sku,
      type: m.type,
      quantity: Number(m.quantity),
      previousStock: Number(m.previousStock),
      newStock: Number(m.newStock),
      notes: m.notes ?? "",
      createdAt: m.createdAt.toISOString(),
    }));
  });

  app.post("/api/stock/movements", async (request, reply) => {
    const parsed = createMovementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de movimiento Kardex inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    if (input.type !== StockMovementType.ADJUSTMENT && input.quantity <= 0) {
      return reply.status(400).send({ error: "La cantidad debe ser mayor a 0" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) return null;

      const prevStock = Number(product.stock);
      let newStock = prevStock;
      let delta = input.quantity;

      if (input.type === StockMovementType.IN || input.type === StockMovementType.RETURN) {
        newStock = prevStock + input.quantity;
        delta = input.quantity;
      } else if (input.type === StockMovementType.OUT || input.type === StockMovementType.SALE) {
        newStock = Math.max(0, prevStock - input.quantity);
        delta = -(prevStock - newStock);
      } else {
        // ADJUSTMENT fija el stock exacto
        newStock = Math.max(0, input.quantity);
        delta = newStock - prevStock;
      }

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: { stock: newStock },
        include: { image: { select: { updatedAt: true, source: true, sizeBytes: true } } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: input.type,
          quantity: delta,
          previousStock: prevStock,
          newStock,
          referenceType: input.referenceType ?? "MANUAL",
          referenceId: input.referenceId ?? null,
          notes: input.notes ?? "Movimiento registrado desde panel",
        },
      });

      return { updatedProduct, movement };
    });

    if (!result) {
      return reply.status(404).send({ error: "Producto no encontrado" });
    }

    return reply.status(201).send({
      movement: {
        id: result.movement.id,
        productId: result.movement.productId,
        productName: result.updatedProduct.name,
        productSku: result.updatedProduct.sku,
        type: result.movement.type,
        quantity: Number(result.movement.quantity),
        previousStock: Number(result.movement.previousStock),
        newStock: Number(result.movement.newStock),
        notes: result.movement.notes ?? "",
        createdAt: result.movement.createdAt.toISOString(),
      },
      newStock: Number(result.updatedProduct.stock),
    });
  });
}
