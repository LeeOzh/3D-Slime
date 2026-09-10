import type { CharacterDef, ExpressionName, EyeStyle, GameState } from "../core/types";
import { clamp } from "../core/utils";

/** Continuous face openness targets — blend instead of hard-switching. */
interface FaceBlend {
  eyeOpen: number;
  mouthOpen: number;
  blush: number;
  eyeStyle: EyeStyle;
  mouthStyle: string;
}

/**
 * Canvas face system (P1): pressure-driven expressions with smooth blend.
 * Keeps character-specific base styles; overrides by expression.
 */
export class ExpressionSystem {
  private dirty = true;
  private blendEye = 1;
  private blendMouth = 0.45;

  markDirty(): void {
    this.dirty = true;
  }

  setExpression(state: GameState, name: ExpressionName, hold = 1.2): void {
    state.expr = name;
    state.exprUntil = performance.now() / 1000 + hold;
    state.faceDirty = true;
  }

  /**
   * Pick expression from unified pressure + combo while the user is pressing.
   * Called from SquishSystem / motion loop so face never hard-flips.
   */
  applyPressureExpression(state: GameState): void {
    // Sleepy overrides idle/pressure unless actively pressing hard.
    if (state.sleepy && !state.pressing) {
      if (state.expr !== "sleepy") this.setExpression(state, "sleepy", 99);
      return;
    }
    if (!state.pressing) return;
    const p = state.squish.pressure;
    const combo = state.combo;
    // High combo + mid pressure → excited; rapid presses → dizzy.
    if (combo >= 10 && p > 0.35) {
      if (state.expr !== "excited") this.setExpression(state, "excited", 99);
      return;
    }
    if (state.recentPressTimes.length >= 6 && p < 0.55) {
      if (state.expr !== "dizzy") this.setExpression(state, "dizzy", 99);
      return;
    }
    if (state.dragging) {
      if (state.expr !== "drag") this.setExpression(state, "drag", 99);
      return;
    }
    // Pressure ladder: idle-ish → surprised → pain → strong pain (press)
    let next: ExpressionName = "press";
    if (p < 0.2) next = "surprised";
    else if (p < 0.5) next = "surprised";
    else if (p < 0.8) next = "pain";
    else next = "press";
    if (state.expr !== next) this.setExpression(state, next, 99);
  }

  update(
    state: GameState,
    character: CharacterDef,
    faceCtx: CanvasRenderingContext2D,
    faceTex: { needsUpdate: boolean },
    onIdle?: () => void,
  ): void {
    const nowS = performance.now() / 1000;
    if (state.expr !== "idle" && nowS > state.exprUntil && !state.pressing) {
      this.setExpression(state, "idle", 0);
      if (!state.hovering) onIdle?.();
    }
    // Smooth blend of open amounts toward the expression target.
    const target = this.blendTargets(state, character);
    const lambda = 10;
    const dt = 1 / 60;
    this.blendEye += (target.eyeOpen - this.blendEye) * (1 - Math.exp(-lambda * dt));
    this.blendMouth += (target.mouthOpen - this.blendMouth) * (1 - Math.exp(-lambda * dt));
    // Redraw when dirty or while blending is still moving.
    const blending =
      Math.abs(target.eyeOpen - this.blendEye) > 0.01 ||
      Math.abs(target.mouthOpen - this.blendMouth) > 0.01;
    if (state.faceDirty || this.dirty || blending) {
      this.drawFace(state, character, faceCtx, target);
      faceTex.needsUpdate = true;
      state.faceDirty = false;
      this.dirty = false;
    }
  }

  private blendTargets(state: GameState, character: CharacterDef): FaceBlend {
    const expr = state.expr;
    const isNezha = character.id === "nezha";
    let eyeOpen = 1;
    let mouthOpen = 0.45;
    let blush = 0.45;
    let eyeStyle: EyeStyle = character.face.eye;
    let mouthStyle: string = character.face.mouth;

    switch (expr) {
      case "happy":
        eyeOpen = 1.15;
        mouthOpen = 1.2;
        blush = 0.7;
        eyeStyle = isNezha ? "nezha" : "happy";
        mouthStyle = isNezha ? "smirk" : "big-smile";
        break;
      case "press":
        eyeOpen = 0.3;
        mouthOpen = 0.25;
        blush = 0.6;
        eyeStyle = isNezha ? "nezha" : "squint";
        mouthStyle = isNezha ? "grit" : "grit";
        break;
      case "pain":
        eyeOpen = 0.2;
        mouthOpen = 0.55;
        blush = 0.65;
        eyeStyle = isNezha ? "nezha" : "cat";
        mouthStyle = isNezha ? "grit" : "wavy";
        break;
      case "surprised":
        eyeOpen = 1.25;
        mouthOpen = 0.9;
        blush = 0.5;
        eyeStyle = isNezha ? "nezha" : "wide";
        mouthStyle = isNezha ? "smirk" : "o";
        break;
      case "drag":
        eyeOpen = 0.9;
        mouthOpen = 0.7;
        blush = 0.55;
        eyeStyle = isNezha ? "nezha" : "wide";
        mouthStyle = isNezha ? "smirk" : "o";
        break;
      case "angry":
        eyeOpen = 0.55;
        mouthOpen = 0.4;
        blush = 0.7;
        eyeStyle = "angry";
        mouthStyle = "frown";
        break;
      case "dizzy":
        eyeOpen = 0.7;
        mouthOpen = 0.5;
        blush = 0.5;
        eyeStyle = "dizzy";
        mouthStyle = "wavy";
        break;
      case "excited":
        eyeOpen = 1.2;
        mouthOpen = 1.15;
        blush = 0.75;
        eyeStyle = isNezha ? "nezha" : "sparkle";
        mouthStyle = isNezha ? "smirk" : "big-smile";
        break;
      case "sleepy":
        eyeOpen = 0.12;
        mouthOpen = 0.2;
        blush = 0.35;
        eyeStyle = "sleepy";
        mouthStyle = "flat";
        break;
      default:
        eyeOpen = 1;
        mouthOpen = 0.45;
        blush = 0.45;
        eyeStyle = character.face.eye;
        mouthStyle = character.face.mouth;
    }

    // Blink only softens the resting face; active expressions stay full open.
    if (character.face.blink && (expr === "idle" || expr === "sleepy")) {
      eyeOpen = eyeOpen * Math.max(state.blink, 0.08);
    }

    return {
      eyeOpen: clamp(eyeOpen, 0, 1.3),
      mouthOpen: clamp(mouthOpen, 0, 1.3),
      blush,
      eyeStyle,
      mouthStyle,
    };
  }

  private drawEye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    style: EyeStyle,
    open: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#2B2140";
    ctx.strokeStyle = "#2B2140";
    ctx.lineCap = "round";

    if (style === "happy") {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 8, 22, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (style === "cat" || style === "squint") {
      ctx.lineWidth = style === "squint" ? 11 : 9;
      ctx.beginPath();
      ctx.moveTo(-18, style === "squint" ? 4 : 2);
      ctx.lineTo(18, style === "squint" ? -4 : -2);
      ctx.stroke();
    } else if (style === "angry") {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-18, -6);
      ctx.lineTo(18, 6);
      ctx.stroke();
    } else if (style === "dizzy") {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(8, 8);
      ctx.moveTo(8, -8);
      ctx.lineTo(-8, 8);
      ctx.stroke();
    } else if (style === "sleepy") {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-16, 2);
      ctx.quadraticCurveTo(0, 8, 16, 2);
      ctx.stroke();
    } else if (style === "nezha") {
      ctx.rotate(x < 256 ? -0.22 : 0.22);
      if (open < 0.15) {
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(-18, 4);
        ctx.lineTo(18, -2);
        ctx.stroke();
      } else {
        const scale = Math.max(open, 0.35);
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 14 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(-5, -4 * scale, 6, 5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7F1D1D";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-20, -10);
        ctx.quadraticCurveTo(0, -18 * scale, 20, -8);
        ctx.stroke();
      }
    } else if (open < 0.15) {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.quadraticCurveTo(0, 10, 16, 0);
      ctx.stroke();
    } else {
      const rx = style === "sparkle" ? 22 : style === "wide" ? 20 : 18;
      const ry = style === "sparkle" ? 28 : style === "round" ? 22 : style === "wide" ? 26 : 24;
      const scale = Math.max(open, 0.2);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-6, -8 * scale, 7, 9 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      if (style === "sparkle" || style === "wide") {
        ctx.beginPath();
        ctx.ellipse(8, 6 * scale, 4, 5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawMouth(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    style: string,
    open: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#2B2140";
    ctx.fillStyle = "#2B2140";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (style === "smile") {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, -6, 22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (style === "smirk") {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-24, 2);
      ctx.quadraticCurveTo(4, 22 + open * 8, 28, -2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(18, 2);
      ctx.lineTo(28, -2);
      ctx.stroke();
    } else if (style === "open-smile") {
      ctx.beginPath();
      ctx.ellipse(0, 4, 20 + open * 6, 14 + open * 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FF8FB8";
      ctx.beginPath();
      ctx.ellipse(0, 10, 12, 7, 0, 0, Math.PI);
      ctx.fill();
    } else if (style === "big-smile") {
      ctx.beginPath();
      ctx.ellipse(0, 2, 26 + open * 8, 18 + open * 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FF8FB8";
      ctx.beginPath();
      ctx.ellipse(0, 10, 14, 8, 0, 0, Math.PI);
      ctx.fill();
    } else if (style === "small-o" || style === "o") {
      const r = style === "o" ? 14 + open * 8 : 10 + open * 6;
      ctx.beginPath();
      ctx.ellipse(0, 2, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === "cat") {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-10, -2, 8, 0.2 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(10, -2, 8, 0.1 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else if (style === "flat") {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-18, 2);
      ctx.lineTo(18, 2);
      ctx.stroke();
    } else if (style === "wavy") {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-20, 2);
      ctx.quadraticCurveTo(-10, 2 - 10 * open, 0, 2);
      ctx.quadraticCurveTo(10, 2 + 10 * open, 20, 2);
      ctx.stroke();
    } else if (style === "frown") {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 16, 18, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else if (style === "grit") {
      ctx.lineWidth = 5;
      const w = 22 + open * 4;
      const h = 10 + open * 6;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * (w / 3), -h / 2);
        ctx.lineTo(i * (w / 3), h / 2);
      }
      ctx.stroke();
    } else {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, -4, 14, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFace(
    state: GameState,
    character: CharacterDef,
    ctx: CanvasRenderingContext2D,
    blend: FaceBlend,
  ): void {
    const S = 512;
    ctx.clearRect(0, 0, S, S);

    ctx.globalAlpha = blend.blush;
    ctx.fillStyle = character.blush;
    for (const bx of [150, 362]) {
      ctx.beginPath();
      ctx.ellipse(bx, 292, 42, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (character.id === "nezha") {
      ctx.save();
      ctx.translate(256, 145);
      ctx.fillStyle = "#F5C542";
      ctx.beginPath();
      ctx.moveTo(0, 28);
      ctx.quadraticCurveTo(-18, 8, -8, -6);
      ctx.quadraticCurveTo(-2, 4, 0, -18);
      ctx.quadraticCurveTo(4, 2, 12, -4);
      ctx.quadraticCurveTo(18, 10, 0, 28);
      ctx.fill();
      ctx.restore();
    }

    // Sleepy Zzz
    if (state.expr === "sleepy") {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#2B2140";
      ctx.font = "bold 36px system-ui,sans-serif";
      ctx.fillText("z", 380, 150);
      ctx.font = "bold 28px system-ui,sans-serif";
      ctx.fillText("z", 410, 120);
      ctx.restore();
    }
    // Dizzy swirls
    if (state.expr === "dizzy") {
      ctx.save();
      ctx.strokeStyle = "rgba(43,33,64,0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(90, 120, 18, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(420, 130, 14, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }

    this.drawEye(ctx, 175, 220, blend.eyeStyle, blend.eyeOpen);
    this.drawEye(ctx, 337, 220, blend.eyeStyle, blend.eyeOpen);
    this.drawMouth(ctx, 256, 310, blend.mouthStyle, blend.mouthOpen);
  }
}
