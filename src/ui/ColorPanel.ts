import * as THREE from "three";
import { TINTS } from "../core/constants";
import type { CharacterDef, GameState, TintDef } from "../core/types";

export class ColorPanel {
  constructor(
    private readonly root: HTMLElement,
    state: GameState,
    character: CharacterDef,
    onPick: (index: number, tint: TintDef) => void,
  ) {
    TINTS.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.className = "swatch" + (i === state.tintIndex ? " is-active" : "");
      const preview = this.previewColor(character, t);
      btn.style.background = `radial-gradient(circle at 35% 30%, #fff8, #${preview.getHexString()} 50%, #${preview.getHexString()})`;
      btn.title = t.name;
      btn.setAttribute("aria-label", t.name);
      btn.addEventListener("click", () => {
        root.querySelectorAll(".swatch").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        onPick(i, t);
      });
      root.appendChild(btn);
    });
  }

  refresh(character: CharacterDef): void {
    const btns = this.root.querySelectorAll<HTMLElement>(".swatch");
    TINTS.forEach((t, i) => {
      const preview = this.previewColor(character, t);
      if (btns[i]) {
        btns[i].style.background = `radial-gradient(circle at 35% 30%, #fff8, #${preview.getHexString()} 50%, #${preview.getHexString()})`;
      }
    });
  }

  private previewColor(character: CharacterDef, t: TintDef): THREE.Color {
    const preview = new THREE.Color(character.color);
    if (t.hueShift !== undefined) {
      const hsl = { h: 0, s: 0, l: 0 };
      preview.getHSL(hsl);
      preview.setHSL((hsl.h + t.hueShift + 1) % 1, hsl.s, hsl.l);
    }
    if (t.sat !== undefined) {
      const hsl = { h: 0, s: 0, l: 0 };
      preview.getHSL(hsl);
      preview.setHSL(hsl.h, Math.min(1, hsl.s * t.sat), hsl.l);
    }
    preview.multiplyScalar(t.mul);
    return preview;
  }
}
