import { WALK_SCENES, type WalkSceneId } from "../game/walkTypes";

export class ScenePanel {
  constructor(
    private readonly root: HTMLElement,
    onSelect: (id: WalkSceneId) => void,
    initialId: WalkSceneId,
  ) {
    WALK_SCENES.forEach((sc) => {
      const btn = document.createElement("button");
      btn.className = "scene-btn" + (sc.id === initialId ? " is-active" : "");
      btn.dataset.id = sc.id;
      btn.title = sc.name;
      btn.setAttribute("aria-label", sc.name);
      btn.innerHTML = `
        <span class="scene-dot" style="background:${sc.accent}"></span>
        <span class="scene-name">${sc.name}</span>
      `;
      btn.addEventListener("click", () => onSelect(sc.id));
      root.appendChild(btn);
    });
  }

  setActive(id: WalkSceneId): void {
    this.root.querySelectorAll(".scene-btn").forEach((el) => {
      el.classList.toggle("is-active", (el as HTMLElement).dataset.id === id);
    });
  }
}
