import crypto from "node:crypto";
import { calculateMod11DV } from "../../lib/paraguay.js";

export interface CdcInput {
  deType?: number; // 1 = Factura electrónica
  ruc: string;
  dv: string;
  establecimiento: string;
  puntoExpedicion: string;
  documentNumber: number;
  tipoContribuyente?: number; // 1 = Física, 2 = Jurídica
  issuedAt: Date;
  tipoEmision?: number; // 1 = Normal, 2 = Contingencia
  securityCode?: string;
}

/**
 * Genera el CDC (Código de Control) oficial de 44 dígitos según Manual Técnico SIFEN v150:
 * iTiDE(2) + dRucEm(8) + dDVEmi(1) + dEst(3) + dPunExp(3) + dNumDoc(7) +
 * iTipCont(1) + dFeEmiDE(8) + iTipEmi(1) + dCodSeg(9) + dDVId(1)
 */
export function generateSifenCDC(input: CdcInput): {
  cdc: string;
  securityCode: string;
  dv: string;
  documentNumberPadded: string;
} {
  const iTiDE = String(input.deType ?? 1).padStart(2, "0").slice(-2);
  const dRucEm = input.ruc.replace(/\D/g, "").padStart(8, "0").slice(-8);
  const dDVEmi = (input.dv.replace(/\D/g, "") || calculateMod11DV(dRucEm)).slice(0, 1);
  const dEst = input.establecimiento.replace(/\D/g, "").padStart(3, "0").slice(-3);
  const dPunExp = input.puntoExpedicion.replace(/\D/g, "").padStart(3, "0").slice(-3);
  const dNumDoc = String(input.documentNumber).padStart(7, "0").slice(-7);
  const iTipCont = String(input.tipoContribuyente ?? 2).slice(0, 1);

  const y = input.issuedAt.getFullYear();
  const m = String(input.issuedAt.getMonth() + 1).padStart(2, "0");
  const d = String(input.issuedAt.getDate()).padStart(2, "0");
  const dFeEmiDE = `${y}${m}${d}`;

  const iTipEmi = String(input.tipoEmision ?? 1).slice(0, 1);
  const dCodSeg =
    input.securityCode?.replace(/\D/g, "").padStart(9, "0").slice(-9) ??
    String(crypto.randomInt(100_000_000, 999_999_999));

  const base43 = `${iTiDE}${dRucEm}${dDVEmi}${dEst}${dPunExp}${dNumDoc}${iTipCont}${dFeEmiDE}${iTipEmi}${dCodSeg}`;
  const dv = calculateMod11DV(base43);
  const cdc = `${base43}${dv}`;

  return { cdc, securityCode: dCodSeg, dv, documentNumberPadded: dNumDoc };
}

export function formatCDC(cdc: string): string {
  return cdc.replace(/(.{4})/g, "$1 ").trim();
}

export function validateCDC(cdc: string): boolean {
  const clean = cdc.replace(/\s+/g, "");
  if (!/^\d{44}$/.test(clean)) return false;
  return calculateMod11DV(clean.slice(0, 43)) === clean.slice(43);
}
