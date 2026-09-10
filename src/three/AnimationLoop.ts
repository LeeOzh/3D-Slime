export class AnimationLoop {
  private running = false;
  private last = 0;
  private rafId = 0;

  constructor(private readonly onUpdate: (delta: number, time: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.033);
      this.last = now;
      this.onUpdate(dt, now / 1000);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
