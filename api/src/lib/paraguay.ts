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
