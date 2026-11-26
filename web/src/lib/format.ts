import type { EmitterProfile, SaleItem, TaxRate } from "../types/domain";

const pygFormatter = new Intl.NumberFormat("es-PY", {
  maximumFractionDigits: 0,
});

export function formatPYG(amount: number): string {
  return `Gs. ${pygFormatter.format(Math.round(amount))}`;
}

export function formatDateTimePY(iso: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function taxRateLabel(rate: TaxRate): string {
  switch (rate) {
    case "IVA_10":
      return "IVA 10%";
    case "IVA_5":
      return "IVA 5%";
    case "EXENTA":
      return "Exenta";
  }
}

export function taxRateBadgeClass(rate: TaxRate): string {
  switch (rate) {
    case "IVA_10":
      return "bg-blue-50 text-[#0038A8] border-blue-200";
    case "IVA_5":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "EXENTA":
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

/**
 * Cálculo de IVA incluido en precio (estándar comercial Paraguay / SIFEN):
 * - IVA 10%: total / 11
 * - IVA 5%:  total / 21
 * - Exenta:  0
 */
export function computeItemIva(lineTotal: number, rate: TaxRate): number {
  if (rate === "IVA_10") return Math.round(lineTotal / 11);
  if (rate === "IVA_5") return Math.round(lineTotal / 21);
  return 0;
}

export function computeSaleTotals(items: SaleItem[]) {
  let subtotalExenta = 0;
  let subtotalIva5 = 0;
  let subtotalIva10 = 0;
  let totalIva5 = 0;
  let totalIva10 = 0;

  for (const item of items) {
    if (item.taxRate === "EXENTA") {
      subtotalExenta += item.lineTotal;
    } else if (item.taxRate === "IVA_5") {
      subtotalIva5 += item.lineTotal;
      totalIva5 += item.ivaAmount;
    } else {
      subtotalIva10 += item.lineTotal;
      totalIva10 += item.ivaAmount;
    }
  }

  return {
    subtotalExenta,
    subtotalIva5,
    subtotalIva10,
    totalIva5,
    totalIva10,
    totalIva: totalIva5 + totalIva10,
    totalAmount: subtotalExenta + subtotalIva5 + subtotalIva10,
  };
}

/**
 * Algoritmo oficial Módulo 11 (base máx 11) de la DNIT/SET para DV de RUC y CDC.
 */
export function calculateMod11DV(numericString: string): string {
  const digits = numericString.replace(/\D/g, "");
  let factor = 2;
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * factor;
    factor = factor === 11 ? 2 : factor + 1;
  }
  const remainder = sum % 11;
  const dv = remainder > 1 ? 11 - remainder : 0;
  return String(dv);
}

/**
 * Genera un CDC válido de 44 dígitos según estructura del Manual Técnico SIFEN v150.
 */
export function generateSifenCDC(params: {
  emitter: EmitterProfile;
  documentNumber: number;
  issuedAt: Date;
}): string {
  const deType = "01"; // Factura electrónica
  const ruc = params.emitter.ruc.replace(/\D/g, "").padStart(8, "0").slice(-8);
  const dv = (params.emitter.dv.replace(/\D/g, "") || "0").slice(0, 1);
  const est = params.emitter.establecimiento.padStart(3, "0").slice(-3);
  const pexp = params.emitter.puntoExpedicion.padStart(3, "0").slice(-3);
  const num = String(params.documentNumber).padStart(7, "0").slice(-7);
  const tipoContrib = "2"; // Persona Jurídica
  const y = params.issuedAt.getFullYear();
  const m = String(params.issuedAt.getMonth() + 1).padStart(2, "0");
  const d = String(params.issuedAt.getDate()).padStart(2, "0");
  const fecha = `${y}${m}${d}`;
  const tipoEmision = "1"; // Normal
  const securityCode = String(Math.floor(100000000 + Math.random() * 899999999));

  const base43 = `${deType}${ruc}${dv}${est}${pexp}${num}${tipoContrib}${fecha}${tipoEmision}${securityCode}`;
  const checkDigit = calculateMod11DV(base43);
  return `${base43}${checkDigit}`;
}

export function formatCDC(cdc: string): string {
  return cdc.replace(/(.{4})/g, "$1 ").trim();
}

export function buildSifenXmlPreview(params: {
  cdc: string;
  emitter: EmitterProfile;
  documentNumber: string;
  customerName: string;
  customerDoc: string;
  totalAmount: number;
  totalIva10: number;
  totalIva5: number;
  items: SaleItem[];
  issuedAtIso: string;
}): string {
  const itemsXml = params.items
    .map(
      (it) => `      <gCamItem>
        <dCodInt>${it.productSku}</dCodInt>
        <dDesProSer>${it.productName}</dDesProSer>
        <cUniMed>77</cUniMed>
        <dCantProSer>${it.quantity}</dCantProSer>
        <gValorItem>
          <dPUniProSer>${it.unitPrice}</dPUniProSer>
          <dTotBruOpeItem>${it.lineTotal}</dTotBruOpeItem>
        </gValorItem>
        <gCamIVA>
          <iAfecIVA>${it.taxRate === "EXENTA" ? "3" : "1"}</iAfecIVA>
          <dTasaIVA>${it.taxRate === "IVA_10" ? "10" : it.taxRate === "IVA_5" ? "5" : "0"}</dTasaIVA>
          <dLiqIVAItem>${it.ivaAmount}</dLiqIVAItem>
        </gCamIVA>
      </gCamItem>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd">
  <dVerFor>150</dVerFor>
  <DE Id="${params.cdc}">
    <dDVId>${params.cdc.slice(-1)}</dDVId>
    <dFecFirma>${params.issuedAtIso}</dFecFirma>
    <gTimb>
      <iTiDE>1</iTiDE>
      <dDesTiDE>Factura electrónica</dDesTiDE>
      <dNumTim>${params.emitter.timbrado}</dNumTim>
      <dEst>${params.emitter.establecimiento}</dEst>
      <dPunExp>${params.emitter.puntoExpedicion}</dPunExp>
      <dNumDoc>${params.documentNumber}</dNumDoc>
    </gTimb>
    <gDatGralOpe>
      <gEmis>
        <dRucEm>${params.emitter.ruc}</dRucEm>
        <dDVEmi>${params.emitter.dv}</dDVEmi>
        <dNomEmi>${params.emitter.razonSocial}</dNomEmi>
      </gEmis>
      <gDatRec>
        <dNomRec>${params.customerName}</dNomRec>
        <dNumIDRec>${params.customerDoc}</dNumIDRec>
      </gDatRec>
    </gDatGralOpe>
    <gDtipDE>
${itemsXml}
    </gDtipDE>
    <gTotSub>
      <dTotGralOpe>${params.totalAmount}</dTotGralOpe>
      <dIVA5>${params.totalIva5}</dIVA5>
      <dIVA10>${params.totalIva10}</dIVA10>
      <dTotIVA>${params.totalIva5 + params.totalIva10}</dTotIVA>
    </gTotSub>
  </DE>
</rDE>`;
}
