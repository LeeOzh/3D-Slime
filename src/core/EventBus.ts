type Handler = (payload?: unknown) => void;

/** Minimal event bus for decoupling UI and Three modules. */
export class EventBus {
  private listeners = new Map<string, Set<Handler>>();

  on(type: string, fn: Handler): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return () => this.off(type, fn);
  }

  off(type: string, fn: Handler): void {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, payload?: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.warn("[EventBus]", type, err);
      }
    }
  }
}

export const eventBus = new EventBus();
