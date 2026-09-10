export class BadgePanel {
  constructor(
    private readonly elBadge: HTMLElement,
    private readonly elHint: HTMLElement,
  ) {}

  say(text: string): void {
    this.elBadge.textContent = text;
  }

  hideHint(): void {
    this.elHint.classList.add("is-hidden");
  }
}
