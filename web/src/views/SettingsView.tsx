import {
  Building2,
  CheckCircle2,
  Globe,
  RotateCcw,
  Save,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { calculateMod11DV } from "../lib/format";
import type { EmitterProfile, SifenMode } from "../types/domain";

interface SettingsViewProps {
  emitter: EmitterProfile;
  onSaveEmitter: (emitter: EmitterProfile) => Promise<void>;
  onResetDemo: () => void;
}

export function SettingsView({ emitter, onSaveEmitter, onResetDemo }: SettingsViewProps) {
  const [form, setForm] = useState<EmitterProfile>(emitter);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    setForm(emitter);
  }, [emitter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSaveEmitter({
      ...form,
      dv: calculateMod11DV(form.ruc),
      establecimiento: form.establecimiento.padStart(3, "0").slice(-3),
      puntoExpedicion: form.puntoExpedicion.padStart(3, "0").slice(-3),
    });
    setSavedBanner(true);
    window.setTimeout(() => setSavedBanner(false), 2400);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Configuración del Emisor, SIFEN y Red
          </h2>
          <p className="text-xs text-slate-500">
            Parámetros fiscales DNIT/e-Kuatia y opciones de exposición segura a Internet para
            Paraguay.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetDemo}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar datos demo
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Formulario del Emisor */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Building2 className="h-4 w-4 text-[#0038A8]" />
              Datos del Contribuyente Emisor
            </h3>
            {savedBanner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Guardado
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                RUC (sin DV)
              </label>
              <input
                required
                value={form.ruc}
                onChange={(e) => {
                  const ruc = e.target.value.replace(/\D/g, "");
                  setForm({ ...form, ruc, dv: ruc ? calculateMod11DV(ruc) : "" });
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                DV (Auto Mod 11)
              </label>
              <input
                readOnly
                value={form.dv}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-bold text-[#0038A8]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Razón Social</label>
            <input
              required
              value={form.razonSocial}
              onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Timbrado N°</label>
              <input
                required
                value={form.timbrado}
                onChange={(e) => setForm({ ...form, timbrado: e.target.value.replace(/\D/g, "") })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Establecimiento
              </label>
              <input
                required
                maxLength={3}
                value={form.establecimiento}
                onChange={(e) =>
                  setForm({ ...form, establecimiento: e.target.value.replace(/\D/g, "") })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Punto Expedición
              </label>
              <input
                required
                maxLength={3}
                value={form.puntoExpedicion}
                onChange={(e) =>
                  setForm({ ...form, puntoExpedicion: e.target.value.replace(/\D/g, "") })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Dirección comercial
            </label>
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Teléfono</label>
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Ambiente SIFEN
              </label>
              <select
                value={form.sifenMode}
                onChange={(e) => setForm({ ...form, sifenMode: e.target.value as SifenMode })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
              >
                <option value="mock">MOCK — Demo local sin .p12</option>
                <option value="test">TEST — sifen-test.set.gov.py</option>
                <option value="prod">PROD — sifen.set.gov.py</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0038A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002d87]"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar configuración
            </button>
          </div>
        </form>

        {/* Tarjetas laterales: Certificado SIFEN + Acceso de Red (CGNAT Paraguay) */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Certificado Digital X.509 (.p12)
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              En modo <code className="rounded bg-slate-100 px-1 py-0.5">mock</code> podés emitir
              facturas, CDC de 44 dígitos y KuDE inmediatamente. Para pasar a{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">test</code> o{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">prod</code>, colocá tu certificado
              emitido por un PSC autorizado por el MIC en{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">./certs/certificado.p12</code>.
            </p>
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Seguridad:</strong> la carpeta <code>certs/</code> está bloqueada en{" "}
              <code>.gitignore</code> y montada en solo lectura (<code>:ro</code>) dentro del
              contenedor API.
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Globe className="h-4 w-4 text-[#0038A8]" />
              Red y salida a Internet (ISPs Paraguay)
            </h3>
            <div className="mt-3 space-y-2.5 text-xs text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  Opción 1 (Recomendada bajo CGNAT): Cloudflare Tunnel
                </p>
                <p className="mt-1">
                  Funciona con Tigo, Personal o Claro sin abrir puertos en el router ni depender de
                  IP pública fija.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">
                  Opción 2 (IP pública real): Caddy HTTPS + DDNS
                </p>
                <p className="mt-1">
                  Expone únicamente puerto <code>443</code> con TLS automático; PostgreSQL permanece
                  siempre aislado en <code>127.0.0.1:5432</code>.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
