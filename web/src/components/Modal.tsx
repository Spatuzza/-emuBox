import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: ReactNode;
}

/**
 * Modal accesible basado en <dialog> nativo + showModal().
 * - El navegador provee inert, trampa de foco, tecla Esc y retorno del foco.
 * - Soporta light-dismiss via closedby="any" con fallback pointerdown/pointerup.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-xl",
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback de light-dismiss para navegadores sin closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        onClose();
      }}
      {...({ closedby: "any" } as Record<string, string>)}
      className={`nemubox-dialog w-[calc(100%-2rem)] ${maxWidthClass} rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h1 id={titleId} className="font-display text-lg font-bold text-slate-900">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar ventana"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  );
}
