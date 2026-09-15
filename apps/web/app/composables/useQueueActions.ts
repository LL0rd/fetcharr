import { ref, type Ref } from 'vue'

/**
 * Sammelaktionen der Queue (Pause all, Clear queue, Clear finished) laufen alle
 * hierdurch. Sie teilen sich drei Eigenschaften, die einzeln schon einmal gefehlt
 * haben und die Seite als „hängt" erscheinen liessen:
 *
 * 1. Ein Deckel auf der Laufzeit. Ohne ihn bleibt ein nie beantworteter Request
 *    für immer offen, `busy` wird nie zurückgesetzt und die komplette Knopfleiste
 *    bleibt gesperrt.
 * 2. Sichtbare Fehler. Ein leeres catch schluckt den Fehlschlag, der Knopf wird
 *    wieder aktiv und nichts passiert — für den Benutzer nicht unterscheidbar von
 *    „Aktion hat nichts gefunden".
 * 3. Ein Abgleich danach, IMMER. Der Job-Stream meldet nur geänderte Zeilen und
 *    kann ein Fehlen gar nicht ausdrücken; gelöschte Jobs verschwinden aus der
 *    Liste erst durch das refresh() hier.
 */

/** Keine dieser Aktionen braucht 20 Sekunden — danach gilt der Server als stumm. */
export const ACTION_TIMEOUT_MS = 20_000

export const LOST_CONTACT = 'Lost contact with the server — reload the page.'

export interface QueueActions {
  busy: Ref<boolean>
  error: Ref<string>
  run: (label: string, action: () => Promise<unknown>) => Promise<void>
}

export function useQueueActions(refresh: () => Promise<unknown>): QueueActions {
  const busy = ref(false)
  const error = ref('')

  async function run(label: string, action: () => Promise<unknown>): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      await action()
    }
    catch (failure) {
      error.value = `${label} failed: ${actionMessage(failure)}`
    }
    finally {
      // Auch nach einem Fehlschlag: der Server ist die Wahrheit, nicht die Liste im Tab.
      try {
        await refresh()
      }
      catch {
        if (!error.value) error.value = LOST_CONTACT
      }
      busy.value = false
    }
  }

  return { busy, error, run }
}

/** Macht aus dem, was $fetch wirft, einen Satz, der jemandem etwas sagt. */
export function actionMessage(failure: unknown): string {
  const error = failure as {
    name?: string
    message?: string
    statusMessage?: string
    data?: { statusMessage?: string }
  }

  if (error?.name === 'TimeoutError' || /timeout|aborted/i.test(error?.message ?? '')) {
    return 'the server did not answer in time'
  }
  return error?.data?.statusMessage || error?.statusMessage || error?.message || 'unknown error'
}
