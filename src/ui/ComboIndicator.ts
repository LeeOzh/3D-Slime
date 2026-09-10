const COMBO_WINDOW_MS = 2000;

/**
 * Floating COMBO × N indicator near the character.
 * Hidden when combo is 0. Soft pop-in, no flashy game UI.
 */
export class ComboIndicator {
  private readonly el: HTMLElement;
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "combo-indicator";
    this.el.setAttribute("aria-live", "polite");
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  show(combo: number, level: number): void {
    if (combo < 2) {
      this.hide();
      return;
    }
    this.el.hidden = false;
    this.el.textContent = `COMBO × ${combo}`;
    this.el.style.setProperty("--combo-level", String(level));
    // Restart pop animation.
    this.el.classList.remove("is-pop");
    // Force reflow so the animation can replay.
    void this.el.offsetWidth;
    this.el.classList.add("is-pop");
    window.clearTimeout(this.hideTimer);
    // Auto-fade if user stops (ComboManager will also emit 0).
    this.hideTimer = window.setTimeout(() => this.hide(), COMBO_WINDOW_MS + 400);
  }

  hide(): void {
    this.el.hidden = true;
    this.el.classList.remove("is-pop");
  }
}
