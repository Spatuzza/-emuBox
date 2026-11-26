import { useEffect, useState } from "react";
import { EmuBoxLogo } from "./EmuBoxLogo";

interface IntroSplashProps {
  onFinish: () => void;
}

const EXIT_START_MS = 900;
const TOTAL_DURATION_MS = 1280;

export function IntroSplash({ onFinish }: IntroSplashProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onFinish();
      return;
    }

    const exitTimer = window.setTimeout(() => setExiting(true), EXIT_START_MS);
    const doneTimer = window.setTimeout(() => onFinish(), TOTAL_DURATION_MS);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onFinish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onFinish]);

  return (
    <div
      role="status"
      aria-label="Iniciando Ñemubox — Hecho en Paraguay"
      onClick={onFinish}
      className={`fixed inset-0 z-50 flex cursor-pointer items-center justify-center overflow-hidden bg-[#060E24] text-white select-none ${
        exiting ? "emubox-curtain-exit pointer-events-none" : ""
      }`}
    >
      {/* Aura tricolor paraguaya: Rojo arriba, Azul abajo, destello dorado al centro */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 26% 18%, rgba(213, 43, 30, 0.28), transparent 46%), radial-gradient(circle at 74% 82%, rgba(0, 56, 168, 0.38), transparent 50%), radial-gradient(circle at 50% 48%, rgba(251, 191, 36, 0.12), transparent 36%)",
        }}
      />

      {/* Patrón geométrico radial inspirado en el Ñandutí paraguayo */}
      <svg
        viewBox="0 0 600 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="emubox-nanduti pointer-events-none absolute h-[640px] w-[640px] opacity-[0.11]"
        aria-hidden="true"
      >
        <g stroke="#FFFFFF" strokeWidth="1">
          <circle cx="300" cy="300" r="85" strokeDasharray="4 6" />
          <circle cx="300" cy="300" r="140" strokeOpacity="0.7" />
          <circle cx="300" cy="300" r="195" strokeDasharray="8 8" strokeOpacity="0.6" />
          <circle cx="300" cy="300" r="255" strokeOpacity="0.4" />
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 22.5 * Math.PI) / 180;
            const x1 = 300 + Math.cos(angle) * 70;
            const y1 = 300 + Math.sin(angle) * 70;
            const x2 = 300 + Math.cos(angle) * 265;
            const y2 = 300 + Math.sin(angle) * 265;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.45" />;
          })}
          {/* Pétalos geométricos tipo telaraña Ñandutí */}
          {Array.from({ length: 8 }).map((_, i) => {
            const rot = i * 45;
            return (
              <ellipse
                key={i}
                cx="300"
                cy="300"
                rx="170"
                ry="46"
                transform={`rotate(${rot} 300 300)`}
                strokeOpacity="0.32"
              />
            );
          })}
        </g>
      </svg>

      {/* Franjas tricolor de barrido (Rojo · Blanco · Azul) */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col gap-1.5 opacity-80">
        <div className="emubox-ribbon-red h-[2px] w-full bg-gradient-to-r from-transparent via-[#D52B1E] to-transparent" />
        <div className="emubox-ribbon-white h-[2px] w-full bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        <div className="emubox-ribbon-blue h-[2px] w-full bg-gradient-to-r from-transparent via-[#2563EB] to-transparent" />
      </div>

      {/* Núcleo central */}
      <div className="relative flex flex-col items-center gap-5 px-6">
        {/* Emblema: Arcos dorados tipo escudo + Cubo Ñemubox con Estrella de Mayo */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <svg
            viewBox="0 0 112 112"
            fill="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {/* Arco izquierdo dorado (palma / olivo estilizado) */}
            <path
              d="M44 100C22 94 10 75 10 56C10 34 25 16 46 11"
              stroke="#FBBF24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeOpacity="0.85"
              className="emubox-arc"
            />
            {/* Arco derecho dorado */}
            <path
              d="M68 100C90 94 102 75 102 56C102 34 87 16 66 11"
              stroke="#FBBF24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeOpacity="0.85"
              className="emubox-arc"
            />
            {/* Punto superior dorado */}
            <circle cx="56" cy="9" r="2.2" fill="#FBBF24" className="emubox-star" />
          </svg>

          <EmuBoxLogo className="h-[74px] w-[74px] text-white drop-shadow-[0_0_24px_rgba(251,191,36,0.22)]" animated />
        </div>

        {/* Wordmark + cinta tricolor paraguaya */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="overflow-hidden">
            <div className="emubox-wordmark font-display text-4xl font-bold tracking-tight text-white">
              Ñemu<span className="text-[#FBBF24]">box</span>
            </div>
          </div>

          {/* Bandera paraguaya minimalista (Rojo · Blanco · Azul) */}
          <div className="emubox-flag flex h-[4px] w-36 overflow-hidden rounded-full shadow-[0_0_16px_rgba(255,255,255,0.22)]">
            <span className="h-full flex-1 bg-[#D52B1E]" />
            <span className="h-full flex-1 bg-white" />
            <span className="h-full flex-1 bg-[#0038A8]" />
          </div>

          <p className="emubox-sub font-mono text-[11px] uppercase tracking-[0.26em] text-slate-300">
            Hecho en Paraguay · Stock · POS · SIFEN
          </p>
        </div>
      </div>

      {/* Borde inferior tricolor del telón (deja rastro patrio al levantarse) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[4px]">
        <span className="h-full flex-1 bg-[#D52B1E]" />
        <span className="h-full flex-1 bg-white" />
        <span className="h-full flex-1 bg-[#0038A8]" />
      </div>
    </div>
  );
}
