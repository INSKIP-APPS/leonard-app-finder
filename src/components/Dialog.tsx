import { useEffect, useRef } from "react";

// ──────────────────────────────────────────────────────────────────────
// Dialog accessible partagé (A11Y-001 / A11Y-002).
// Fournit : role="dialog" + aria-modal, fermeture Échap, verrou de scroll
// du body, focus initial + piège de focus (Tab cyclique), et fermeture au
// clic overlay UNIQUEMENT si le mousedown ET le mouseup ont lieu sur
// l'overlay (UX-016 : ne pas fermer sur une sélection de texte relâchée
// hors carte). `confirmClose` permet un garde-fou anti-perte de saisie.
// ──────────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  onClose,
  labelledBy,
  className,
  panelClassName,
  confirmClose,
  children,
}: {
  onClose: () => void;
  /** id du titre pour aria-labelledby */
  labelledBy?: string;
  /** classes de l'overlay (positionnement, fond) */
  className?: string;
  /** classes du panneau (carte) */
  panelClassName?: string;
  /** Retourne false pour bloquer la fermeture (ex: formulaire modifié). */
  confirmClose?: () => boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const downOnOverlay = useRef(false);

  function attemptClose() {
    if (confirmClose && !confirmClose()) return;
    onClose();
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus initial sur le premier élément focusable, sinon le panneau.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        attemptClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null,
        );
        if (nodes.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const firstEl = nodes[0];
        const lastEl = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={className ?? "fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"}
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) attemptClose();
        downOnOverlay.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClassName}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
