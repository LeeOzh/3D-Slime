import * as THREE from "three";

/**
 * Procedural body map (white-based) so material.color still drives character/tint.
 * Clean jelly look: soft vertical gradient + top glow only (no mottle noise).
 */
export function createBodyTexture(characterId: string, size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#faf8fc");
  g.addColorStop(1, "#f0ecf5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(size * 0.5, size * 0.2, size * 0.04, size * 0.5, size * 0.2, size * 0.5);
  glow.addColorStop(0, "rgba(255,255,255,0.4)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const foot = ctx.createRadialGradient(size * 0.5, size * 0.95, size * 0.04, size * 0.5, size * 0.95, size * 0.4);
  foot.addColorStop(0, "rgba(100,80,120,0.05)");
  foot.addColorStop(1, "rgba(100,80,120,0)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, size, size);

  if (characterId === "pudding") {
    ctx.fillStyle = "rgba(180,110,40,0.10)";
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * size + 10;
      const w = size * 0.07;
      const h = size * 0.1;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, size * 0.3, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (characterId === "nezha") {
    ctx.fillStyle = "rgba(255,200,60,0.12)";
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * size;
      const y = size * (0.2 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (characterId === "drop") {
    const streak = ctx.createLinearGradient(size * 0.4, 0, size * 0.52, size);
    streak.addColorStop(0, "rgba(255,255,255,0)");
    streak.addColorStop(0.4, "rgba(255,255,255,0.12)");
    streak.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function disposeTexture(tex: THREE.Texture | null): void {
  if (tex) tex.dispose();
}
