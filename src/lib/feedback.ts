import { toast } from "sonner";

/**
 * Feedback uniforme per le azioni che salvano dati:
 * mostra "in corso", poi conferma o errore, sempre con tono rassicurante.
 */
export async function withSaveFeedback<T>(
  action: () => Promise<T>,
  messages?: {
    loading?: string;
    success?: string;
    error?: string;
  },
): Promise<T | undefined> {
  const id = toast.loading(messages?.loading ?? "Salvataggio in corso…");
  try {
    const result = await action();
    toast.success(messages?.success ?? "Salvato", { id, duration: 2200 });
    return result;
  } catch (e) {
    console.warn(e);
    toast.error(messages?.error ?? "Non è stato possibile salvare. Riprova tra poco.", {
      id,
      duration: 4000,
    });
    return undefined;
  }
}

/** Piccola vibrazione di conferma sui dispositivi che la supportano. */
export function hapticTap(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignora: feedback puramente opzionale */
    }
  }
}
