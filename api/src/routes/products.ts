import { Prisma, StockMovementType, TaxRate } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generateProductMiniImage } from "../services/aiImage.js";

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  barcode: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().min(1).max(16).default("UNI"),
  unitCodeSifen: z.coerce.number().int().positive().default(77),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
  taxRate: z.nativeEnum(TaxRate).default(TaxRate.IVA_10),
  stock: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().min(0).default(0),
});

const updateProductSchema = z.object({
  sku: z.string().trim().min(1).max(50).optional(),
  barcode: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().min(1).max(16).optional(),
  unitCodeSifen: z.coerce.number().int().positive().optional(),
  price: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  taxRate: z.nativeEnum(TaxRate).optional(),
  minStock: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
});

const uploadImageSchema = z.object({
  dataUrl: z.string().min(20),
});

const generateImageSchema = z.object({
  prompt: z.string().trim().max(300).optional(),
});

function serializeProduct(p: {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  unitCodeSifen: number;
  price: Prisma.Decimal;
  cost: Prisma.Decimal;
  taxRate: TaxRate;
  stock: Prisma.Decimal;
  minStock: Prisma.Decimal;
  active: boolean;
  image?: { updatedAt: Date; source: string; sizeBytes: number } | null;
}) {
  const hasImage = Boolean(p.image);
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode ?? undefined,
    name: p.name,
    description: p.description ?? undefined,
    unit: p.unit,
    unitCodeSifen: p.unitCodeSifen,
    price: Number(p.price),
    cost: Number(p.cost),
    taxRate: p.taxRate,
    stock: Number(p.stock),
    minStock: Number(p.minStock),
    active: p.active,
    hasImage,
    imageUrl:
      hasImage && p.image
        ? `/api/products/${p.id}/image?v=${p.image.updatedAt.getTime()}`
        : undefined,
    imageSource: p.image?.source,
    imageSizeBytes: p.image?.sizeBytes,
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  return { mimeType, buffer };
}

export async function productRoutes(app: FastifyInstance) {
  // Listar productos activos (sin traer el binario BYTEA en la grilla)
  app.get("/api/products", async (request) => {
    const query = request.query as { q?: string; taxRate?: string; lowStock?: string };
    const q = query.q?.trim();

    const rows = await prisma.product.findMany({
      where: {
        active: true,
        ...(query.taxRate && Object.values(TaxRate).includes(query.taxRate as TaxRate)
          ? { taxRate: query.taxRate as TaxRate }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { barcode: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        image: {
          select: { updatedAt: true, source: true, sizeBytes: true },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    const serialized = rows.map(serializeProduct);
    if (query.lowStock === "true") {
      return serialized.filter((p) => p.stock <= p.minStock);
    }
    return serialized;
  });

  // Crear producto + movimiento inicial de Kardex en transacción
  app.post("/api/products", async (request, reply) => {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de producto inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const sku = input.sku.toUpperCase();
    const barcode = input.barcode ? input.barcode.trim() || null : null;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            sku,
            barcode,
            name: input.name,
            description: input.description ?? null,
            unit: input.unit.toUpperCase(),
            unitCodeSifen: input.unitCodeSifen,
            price: input.price,
            cost: input.cost,
            taxRate: input.taxRate,
            stock: input.stock,
            minStock: input.minStock,
          },
          include: {
            image: { select: { updatedAt: true, source: true, sizeBytes: true } },
          },
        });

        if (input.stock > 0) {
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              type: StockMovementType.IN,
              quantity: input.stock,
              previousStock: 0,
              newStock: input.stock,
              unitCost: input.cost,
              referenceType: "PRODUCT_CREATE",
              notes: "Stock inicial al dar de alta el producto",
            },
          });
        }

        return product;
      });

      return reply.status(201).send(serializeProduct(created));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({
          error: "Ya existe un producto con ese SKU o código de barras",
        });
      }
      throw err;
    }
  });

  // Actualizar metadatos del producto (el stock se modifica vía Kardex)
  app.patch("/api/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de actualización inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    try {
      const updated = await prisma.product.update({
        where: { id },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku.toUpperCase() } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.unit !== undefined ? { unit: input.unit.toUpperCase() } : {}),
          ...(input.unitCodeSifen !== undefined ? { unitCodeSifen: input.unitCodeSifen } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
          ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        include: {
          image: { select: { updatedAt: true, source: true, sizeBytes: true } },
        },
      });
      return serializeProduct(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          return reply.status(404).send({ error: "Producto no encontrado" });
        }
        if (err.code === "P2002") {
          return reply.status(409).send({ error: "SKU o código de barras duplicado" });
        }
      }
      throw err;
    }
  });

  // Baja lógica del producto
  app.delete("/api/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.product.update({
        where: { id },
        data: { active: false },
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return reply.status(404).send({ error: "Producto no encontrado" });
      }
      throw err;
    }
  });

  // Servir foto del producto directamente desde PostgreSQL (BYTEA)
  app.get("/api/products/:id/image", async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = await prisma.productImage.findUnique({ where: { productId: id } });
    if (!image) {
      return reply.status(404).send({ error: "El producto no tiene imagen" });
    }

    reply.header("Content-Type", image.mimeType);
    reply.header("Cache-Control", "public, max-age=3600");
    reply.header("X-Content-Type-Options", "nosniff");
    if (image.mimeType === "image/svg+xml") {
      reply.header("Content-Security-Policy", "sandbox");
    }
    return reply.send(Buffer.from(image.data));
  });

  // Subir o reemplazar foto en PostgreSQL (recibe dataUrl base64 redimensionado)
  app.put("/api/products/:id/image", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = uploadImageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Imagen inválida" });
    }

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) {
      return reply.status(404).send({ error: "Producto no encontrado" });
    }

    const decoded = parseDataUrl(parsed.data.dataUrl);
    if (!decoded) {
      return reply.status(400).send({
        error: "Formato no permitido o tamaño excede 2 MB (use JPG, PNG o WebP)",
      });
    }

    const saved = await prisma.productImage.upsert({
      where: { productId: id },
      update: {
        mimeType: decoded.mimeType,
        data: new Uint8Array(decoded.buffer),
        source: "UPLOAD",
        sizeBytes: decoded.buffer.length,
      },
      create: {
        productId: id,
        mimeType: decoded.mimeType,
        data: new Uint8Array(decoded.buffer),
        source: "UPLOAD",
        sizeBytes: decoded.buffer.length,
      },
      select: { updatedAt: true, source: true, sizeBytes: true, mimeType: true },
    });

    return {
      hasImage: true,
      imageUrl: `/api/products/${id}/image?v=${saved.updatedAt.getTime()}`,
      imageSource: saved.source,
      imageSizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
    };
  });

  // Eliminar foto del producto
  app.delete("/api/products/:id/image", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.productImage.deleteMany({ where: { productId: id } });
    return { hasImage: false };
  });

  // Generar mini-imagen de producto con IA gratuita y guardarla en PostgreSQL
  app.post("/api/products/:id/image/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = generateImageSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Prompt inválido" });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true },
    });
    if (!product) {
      return reply.status(404).send({ error: "Producto no encontrado" });
    }

    const generated = await generateProductMiniImage({
      productName: product.name,
      sku: product.sku,
      customPrompt: parsed.data.prompt,
    });

    const saved = await prisma.productImage.upsert({
      where: { productId: id },
      update: {
        mimeType: generated.mimeType,
        data: new Uint8Array(generated.data),
        source: generated.source,
        sizeBytes: generated.data.length,
      },
      create: {
        productId: id,
        mimeType: generated.mimeType,
        data: new Uint8Array(generated.data),
        source: generated.source,
        sizeBytes: generated.data.length,
      },
      select: { updatedAt: true, source: true, sizeBytes: true, mimeType: true },
    });

    return {
      hasImage: true,
      imageUrl: `/api/products/${id}/image?v=${saved.updatedAt.getTime()}`,
      imageSource: saved.source,
      imageSizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
      iconName: generated.iconName,
      usedFallback: generated.usedFallback,
      message: generated.providerMessage,
    };
  });
}
