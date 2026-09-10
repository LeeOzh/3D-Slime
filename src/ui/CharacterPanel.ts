import { CHARACTERS } from "../core/constants";
import type { CharacterDef } from "../core/types";

export class CharacterPanel {
  constructor(
    private readonly root: HTMLElement,
    onSelect: (ch: CharacterDef) => void,
    initialId: string,
  ) {
    CHARACTERS.forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "char-btn" + (ch.id === initialId ? " is-active" : "");
      btn.dataset.id = ch.id;
      btn.title = ch.name;
      btn.setAttribute("aria-label", ch.name);
      btn.innerHTML = `
        <div class="char-face" style="background: radial-gradient(circle at 35% 30%, #fff9, ${ch.color} 50%, ${ch.color})">
          <span class="eye l"></span><span class="eye r"></span>
          <span class="blush l"></span><span class="blush r"></span>
          <span class="mouth"></span>
        </div>
        <span class="char-name">${ch.name}</span>
      `;
      btn.addEventListener("click", () => onSelect(ch));
      root.appendChild(btn);
    });
  }

  setActive(id: string): void {
    this.root.querySelectorAll(".char-btn").forEach((el) => {
      el.classList.toggle("is-active", (el as HTMLElement).dataset.id === id);
    });
  }
}
