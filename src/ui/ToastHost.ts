/** Lightweight unlock toast — soft pill, no game modal. */
export class ToastHost {
  private readonly root: HTMLElement;
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "toast-host";
    this.root.setAttribute("aria-live", "polite");
    parent.appendChild(this.root);
  }

  show(title: string, subtitle?: string, kind: "achievement" | "egg" | "info" = "achievement"): void {
    const el = document.createElement("div");
    el.className = `toast toast--${kind}`;
    const icon = kind === "egg" ? "✨" : kind === "info" ? "📋" : "🏆";
    el.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-text">
        <strong>${escapeHtml(title)}</strong>
        ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
      </span>
    `;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    window.setTimeout(() => {
      el.classList.remove("is-in");
      window.setTimeout(() => el.remove(), 280);
    }, 2600);
    // Cap stack
    while (this.root.children.length > 3) {
      this.root.firstElementChild?.remove();
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
