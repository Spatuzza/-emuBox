import { DocumentIdType, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateMod11DV } from "../lib/paraguay.js";
import { prisma } from "../lib/prisma.js";

const createCustomerSchema = z.object({
  documentType: z.nativeEnum(DocumentIdType).default(DocumentIdType.RUC),
  documentNumber: z.string().trim().min(1).max(20),
  dv: z.string().trim().max(2).optional().nullable(),
  name: z.string().trim().min(1).max(255),
  isTaxpayer: z.boolean().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(255).optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.get("/api/customers", async (request) => {
    const query = request.query as { q?: string };
    const q = query.q?.trim();

    const rows = await prisma.customer.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { documentNumber: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ isTaxpayer: "asc" }, { name: "asc" }],
    });

    return rows.map((c) => ({
      id: c.id,
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      dv: c.dv ?? undefined,
      name: c.name,
      isTaxpayer: c.isTaxpayer,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      address: c.address ?? undefined,
    }));
  });

  app.post("/api/customers", async (request, reply) => {
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de cliente inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const cleanDoc = input.documentNumber.replace(/\D/g, "") || input.documentNumber;
    const isRuc = input.documentType === DocumentIdType.RUC;
    const dv = isRuc ? input.dv || calculateMod11DV(cleanDoc) : null;

    try {
      const created = await prisma.customer.create({
        data: {
          documentType: input.documentType,
          documentNumber: cleanDoc,
          dv,
          name: input.name,
          isTaxpayer: input.isTaxpayer ?? isRuc,
          email: input.email || null,
          phone: input.phone || null,
          address: input.address || null,
        },
      });

      return reply.status(201).send({
        id: created.id,
        documentType: created.documentType,
        documentNumber: created.documentNumber,
        dv: created.dv ?? undefined,
        name: created.name,
        isTaxpayer: created.isTaxpayer,
        email: created.email ?? undefined,
        phone: created.phone ?? undefined,
        address: created.address ?? undefined,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({
          error: "Ya existe un cliente registrado con ese tipo y número de documento",
        });
      }
      throw err;
    }
  });
}
