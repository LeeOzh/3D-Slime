export class StatsPanel {
  constructor(
    private readonly elPress: HTMLElement,
    private readonly elWobble: HTMLElement,
    private readonly elCount: HTMLElement,
  ) {}

  setCount(count: number): void {
    this.elCount.textContent = String(count);
  }

  setPress(pressStrength: number): void {
    this.elPress.textContent = Math.round(Math.min(pressStrength, 1) * 100) + "%";
  }

  setWobble(wobbleVel: number): void {
    this.elWobble.textContent = String(Math.round(Math.abs(wobbleVel) * 10) / 10);
  }
}
