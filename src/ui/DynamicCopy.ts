/**
 * Dynamic badge copy — rate-limited, never flashy.
 * Priority: active interaction line > post-release flavor > sleepy > idle.
 */
export class DynamicCopy {
  static readonly LINES = {
    idle: "捏一下，今天就轻松一点。",
    gentle: "舒服吗？",
    combo: "还没解压完？",
    highCombo: "你今天手感不错。",
    frenzy: "你是不是压力有点大？",
    rest: "好多了吗？",
    sleepy: "它好像睡着了…",
  } as const;

  private lastKey = "";
  private lastAt = 0;
  private restUntil = 0;

  /** Called every frame with light state. Returns text to show, or null to keep. */
  sample(input: {
    pressing: boolean;
    pressure: number;
    combo: number;
    recentPressCount: number;
    sleepy: boolean;
  }): string | null {
    const now = performance.now();
    let key: keyof typeof DynamicCopy.LINES = "idle";

    if (input.sleepy) key = "sleepy";
    else if (input.pressing) {
      if (input.combo >= 12 || input.recentPressCount >= 8) key = "frenzy";
      else if (input.combo >= 5) key = "highCombo";
      else if (input.pressure < 0.35) key = "gentle";
      else key = "combo";
    } else if (now < this.restUntil) key = "rest";
    else key = "idle";

    // Don't thrash the badge.
    if (key === this.lastKey && now - this.lastAt < 1200) return null;
    // Hold "rest" for a beat after release.
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastAt = now;
      return DynamicCopy.LINES[key];
    }
    return null;
  }

  /** After a hard release, show "好多了吗？" briefly. */
  noteRelease(wasHard: boolean): void {
    this.lastKey = "pressing";
    this.lastAt = 0;
    if (wasHard) {
      this.restUntil = performance.now() + 2200;
    } else {
      this.restUntil = 0;
    }
  }

  /** Force idle line on next sample (character switch etc.). */
  pokeIdle(): void {
    this.lastKey = "release";
    this.lastAt = 0;
    this.restUntil = 0;
  }

  reset(): void {
    this.lastKey = "";
    this.lastAt = 0;
    this.restUntil = 0;
  }
}
