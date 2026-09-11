import * as THREE from "three";

/**
 * Procedural body map (white-based) so material.color still drives character/tint.
 * Adds vertical jelly gradient + soft mottle + light character flavor.
 */
export function createBodyTexture(characterId: string, size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  // Base: near-white with vertical jelly gradient (top brighter, bottom denser).
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.42, "#f7f4fb");
  g.addColorStop(0.78, "#ebe6f2");
  g.addColorStop(1, "#ddd6e8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Soft top glow (specular bloom feel).
  const glow = ctx.createRadialGradient(size * 0.5, size * 0.22, size * 0.05, size * 0.5, size * 0.22, size * 0.55);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Bottom contact shade.
  const foot = ctx.createRadialGradient(size * 0.5, size * 0.92, size * 0.05, size * 0.5, size * 0.92, size * 0.45);
  foot.addColorStop(0, "rgba(90,70,110,0.10)");
  foot.addColorStop(1, "rgba(90,70,110,0)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, size, size);

  // Subtle mottle (jelly density).
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.03 + Math.random() * 0.08);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    rg.addColorStop(0, dark ? "rgba(40,20,60,0.9)" : "rgba(255,255,255,0.9)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Character flavor (still white-based so tint works).
  if (characterId === "pudding") {
    // Caramel drip band near top third.
    ctx.fillStyle = "rgba(180,110,40,0.18)";
    for (let i = 0; i < 7; i++) {
      const x = (i / 7) * size + (i % 2) * 8;
      const w = size * 0.08;
      const h = size * (0.12 + (i % 3) * 0.04);
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, size * 0.28, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (characterId === "cat") {
    // Very soft stripes.
    ctx.strokeStyle = "rgba(70,50,90,0.06)";
    ctx.lineWidth = size * 0.02;
    for (let i = 0; i < 4; i++) {
      const y = size * (0.35 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(size * 0.15, y);
      ctx.quadraticCurveTo(size * 0.5, y + size * 0.04, size * 0.85, y);
      ctx.stroke();
    }
  } else if (characterId === "nezha") {
    // Gold flecks.
    ctx.fillStyle = "rgba(255,200,60,0.22)";
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * size;
      const y = size * (0.15 + Math.random() * 0.55);
      const r = 1 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (characterId === "drop") {
    // Soft vertical sheen streak.
    const streak = ctx.createLinearGradient(size * 0.35, 0, size * 0.55, size);
    streak.addColorStop(0, "rgba(255,255,255,0)");
    streak.addColorStop(0.45, "rgba(255,255,255,0.22)");
    streak.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, size, size);
  } else if (characterId === "mochi") {
    // Soft center bloom.
    const mid = ctx.createRadialGradient(size * 0.5, size * 0.48, 0, size * 0.5, size * 0.48, size * 0.4);
    mid.addColorStop(0, "rgba(255,255,255,0.28)");
    mid.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mid;
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
