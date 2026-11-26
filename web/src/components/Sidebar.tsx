import {
  Box,
  FileCheck2,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import type { AppSection, SifenMode } from "../types/domain";
import { EmuBoxLogo } from "./EmuBoxLogo";

interface SidebarProps {
  activeSection: AppSection;
  onSelect: (section: AppSection) => void;
  lowStockCount: number;
  invoiceCount: number;
  sifenMode: SifenMode;
  onReplayIntro: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  shortcut?: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
  { id: "pos", label: "Caja POS", shortcut: "F2", icon: ShoppingCart },
  { id: "stock", label: "Stock y Kardex", shortcut: "F3", icon: Box },
  { id: "sifen", label: "Facturas SIFEN", icon: FileCheck2 },
  { id: "settings", label: "Configuración", icon: Settings },
];

export function Sidebar({
  activeSection,
  onSelect,
  lowStockCount,
  invoiceCount,
  sifenMode,
  onReplayIntro,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const content = (
    <div className="flex h-full flex-col bg-[#060E24] text-slate-200">
      {/* Franja superior Tricolor */}
      <div className="flex h-[3px] w-full shrink-0">
        <span className="h-full flex-1 bg-[#D52B1E]" />
        <span className="h-full flex-1 bg-white" />
        <span className="h-full flex-1 bg-[#0038A8]" />
      </div>

      {/* Marca */}
      <div className="flex items-center justify-between px-5 py-5">
        <button
          type="button"
          onClick={() => {
            onSelect("dashboard");
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ring-amber-400/25">
            <EmuBoxLogo className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-tight tracking-tight text-white">
              Ñemu<span className="text-[#FBBF24]">box</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Paraguay · SIFEN
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Cerrar menú"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navegación */}
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? "page" : undefined}
              className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={`h-[18px] w-[18px] ${
                    isActive ? "text-[#FBBF24]" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                {item.label}
              </span>

              <span className="flex items-center gap-1.5">
                {item.id === "stock" && lowStockCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    {lowStockCount}
                  </span>
                )}
                {item.id === "sifen" && invoiceCount > 0 && (
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                    {invoiceCount}
                  </span>
                )}
                {item.shortcut && (
                  <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 xl:inline-block">
                    {item.shortcut}
                  </kbd>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Pie del sidebar */}
      <div className="space-y-3 border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Ambiente SIFEN</span>
            <span className="font-mono uppercase text-amber-300">{sifenMode}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {sifenMode === "mock"
              ? "Simulación local activa (XML v150 + CDC real + KuDE)."
              : sifenMode === "test"
                ? "Conectado a sifen-test.set.gov.py (DNIT Pruebas)."
                : "Emisión real en producción DNIT."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onReplayIntro();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#FBBF24]" />
          Ver intro paraguaya
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar fijo en desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block">{content}</aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#060E24]/60 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[82vw] shadow-2xl">{content}</aside>
        </div>
      )}
    </>
  );
}
