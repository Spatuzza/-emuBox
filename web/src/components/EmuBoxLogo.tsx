import { useId } from "react";

interface EmuBoxLogoProps {
  className?: string;
  animated?: boolean;
}

export function EmuBoxLogo({ className = "h-10 w-10", animated = false }: EmuBoxLogoProps) {
  const topGradId = useId();
  const leftGradId = useId();
  const rightGradId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Cara superior con matiz rojo paraguayo */}
      <path
        d="M32 7L54 19.5L32 32L10 19.5L32 7Z"
        className={animated ? "emubox-core" : ""}
        fill={`url(#${topGradId})`}
      />

      {/* Cara lateral izquierda (luz blanca sutil) */}
      <path
        d="M10 19.5L32 32V57L10 44.5V19.5Z"
        className={animated ? "emubox-core" : ""}
        fill={`url(#${leftGradId})`}
      />

      {/* Cara lateral derecha (azul paraguayo) */}
      <path
        d="M54 19.5L32 32V57L54 44.5V19.5Z"
        className={animated ? "emubox-core" : ""}
        fill={`url(#${rightGradId})`}
      />

      {/* Contorno hexagonal del cubo */}
      <path
        d="M32 7L54 19.5V44.5L32 57L10 44.5V19.5L32 7Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "emubox-draw-outer" : ""}
      />

      {/* Aristas internas */}
      <path
        d="M10 19.5L32 32M54 19.5L32 32M32 32V57"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.72"
        className={animated ? "emubox-draw-inner" : ""}
      />

      {/* Estrella de Mayo (5 puntas dorada en el centro del cubo) */}
      <path
        d="M32 24.4L33.95 29.2L39.1 29.55L35.12 32.85L36.38 37.9L32 35.12L27.62 37.9L28.88 32.85L24.9 29.55L30.05 29.2L32 24.4Z"
        fill="#FBBF24"
        stroke="#FEF3C7"
        strokeWidth="0.6"
        strokeLinejoin="round"
        className={animated ? "emubox-star" : ""}
      />

      <defs>
        <linearGradient
          id={topGradId}
          x1="10"
          y1="7"
          x2="54"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D52B1E" stopOpacity="0.52" />
          <stop offset="1" stopColor="#EF4444" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient
          id={leftGradId}
          x1="10"
          y1="19.5"
          x2="32"
          y2="57"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient
          id={rightGradId}
          x1="54"
          y1="19.5"
          x2="32"
          y2="57"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0038A8" stopOpacity="0.58" />
          <stop offset="1" stopColor="#1D4ED8" stopOpacity="0.24" />
        </linearGradient>
      </defs>
    </svg>
  );
}
