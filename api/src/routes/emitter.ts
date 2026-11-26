import { SifenMode } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calculateMod11DV } from "../lib/paraguay.js";
import { prisma } from "../lib/prisma.js";

const updateEmitterSchema = z.object({
  ruc: z.string().trim().min(4).max(12).optional(),
  razonSocial: z.string().trim().min(1).max(255).optional(),
  nombreFantasia: z.string().trim().max(255).optional(),
  timbrado: z.string().trim().min(4).max(16).optional(),
  establecimiento: z.string().trim().min(1).max(3).optional(),
  puntoExpedicion: z.string().trim().min(1).max(3).optional(),
  actividadEconomicaDesc: z.string().trim().max(255).optional(),
  direccion: z.string().trim().max(255).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  sifenMode: z.enum(["mock", "test", "prod"]).optional(),
});

function serializeEmitter(e: {
  ruc: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string | null;
  timbrado: string;
  establecimiento: string;
  puntoExpedicion: string;
  ultimoNumeroFactura: number;
  actividadEconomicaDesc: string;
  direccion: string;
  telefono: string | null;
  email: string | null;
  sifenMode: SifenMode;
  cscId: string;
}) {
  return {
    ruc: e.ruc,
    dv: e.dv,
    razonSocial: e.razonSocial,
    nombreFantasia: e.nombreFantasia ?? "",
    timbrado: e.timbrado,
    establecimiento: e.establecimiento,
    puntoExpedicion: e.puntoExpedicion,
    ultimoNumeroFactura: e.ultimoNumeroFactura,
    actividadEconomicaDesc: e.actividadEconomicaDesc,
    direccion: e.direccion,
    telefono: e.telefono ?? "",
    email: e.email ?? "",
    sifenMode: e.sifenMode.toLowerCase() as "mock" | "test" | "prod",
    cscId: e.cscId,
  };
}

export async function emitterRoutes(app: FastifyInstance) {
  app.get("/api/emitter", async (_request, reply) => {
    const emitter = await prisma.emitterConfig.findUnique({ where: { id: 1 } });
    if (!emitter) {
      return reply.status(404).send({ error: "Emisor no configurado" });
    }
    return serializeEmitter(emitter);
  });

  app.patch("/api/emitter", async (request, reply) => {
    const parsed = updateEmitterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de emisor inválidos",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const cleanRuc = input.ruc ? input.ruc.replace(/\D/g, "") : undefined;
    const modeMap: Record<"mock" | "test" | "prod", SifenMode> = {
      mock: SifenMode.MOCK,
      test: SifenMode.TEST,
      prod: SifenMode.PROD,
    };

    const updated = await prisma.emitterConfig.update({
      where: { id: 1 },
      data: {
        ...(cleanRuc ? { ruc: cleanRuc, dv: calculateMod11DV(cleanRuc) } : {}),
        ...(input.razonSocial !== undefined ? { razonSocial: input.razonSocial } : {}),
        ...(input.nombreFantasia !== undefined ? { nombreFantasia: input.nombreFantasia } : {}),
        ...(input.timbrado !== undefined ? { timbrado: input.timbrado.replace(/\D/g, "") } : {}),
        ...(input.establecimiento !== undefined
          ? { establecimiento: input.establecimiento.padStart(3, "0").slice(-3) }
          : {}),
        ...(input.puntoExpedicion !== undefined
          ? { puntoExpedicion: input.puntoExpedicion.padStart(3, "0").slice(-3) }
          : {}),
        ...(input.actividadEconomicaDesc !== undefined
          ? { actividadEconomicaDesc: input.actividadEconomicaDesc }
          : {}),
        ...(input.direccion !== undefined ? { direccion: input.direccion } : {}),
        ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.sifenMode !== undefined ? { sifenMode: modeMap[input.sifenMode] } : {}),
      },
    });

    return serializeEmitter(updated);
  });
}
