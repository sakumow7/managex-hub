import { useEffect } from "react";
export function useDialog(dialogKey: string, onClose: () => void) {
  useEffect(() => {
    if (!dialogKey) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog
      ?.querySelector<HTMLElement>("input, button, select, textarea")
      ?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select:not(:disabled), textarea, a[href]",
        ),
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus();
    };
  }, [dialogKey, onClose]);
}
