import { eventBus } from "../core/EventBus";
import { ACHIEVEMENTS, EASTER_EGGS, REQUIRED_AREAS } from "../data/achievements";
import type { StorageManager } from "../storage/StorageManager";

export interface UnlockToast {
  kind: "achievement" | "egg";
  name: string;
  desc: string;
}

/**
 * Watches squish/combo events and unlocks achievements + easter eggs once.
 * Emits achievement:unlock / easterEgg:trigger.
 */
export class AchievementManager {
  private gentleStreak = 0;
  private midnightChecked = false;

  constructor(private readonly storage: StorageManager) {
    // Midnight check on boot
    this.checkMidnight();
    eventBus.on("squish:start", (payload) => {
      const s = payload as { pressure: number; area: string };
      // pressure may still be low at start; use area
      this.onSquish(s.area);
    });
    eventBus.on("squish:end", (payload) => {
      const s = payload as { pressure: number; area: string };
      this.onSquishEnd(s.pressure, s.area);
    });
    eventBus.on("combo:milestone", (payload) => {
      const c = payload as { combo: number };
      this.onCombo(c.combo);
    });
    eventBus.on("combo:update", (payload) => {
      const c = payload as { combo: number };
      if (c.combo >= 50) this.onCombo(c.combo);
    });
  }

  private checkMidnight(): void {
    if (this.midnightChecked) return;
    const h = new Date().getHours();
    if (h >= 0 && h < 5) {
      this.unlockAch("MIDNIGHT_PLAYER");
    }
    this.midnightChecked = true;
  }

  private onSquish(_area: string): void {
    this.unlockAch("FIRST_SQUISH");
    const total = this.storage.getStats().totalSquishCount;
    if (total >= 100) this.unlockAch("SQUISH_100");
    if (total >= 1000) this.unlockAch("SQUISH_1000");
    this.checkEggs(total);
  }

  private onSquishEnd(pressure: number, area: string): void {
    if (pressure >= 0.95) {
      this.unlockAch("MAX_PRESSURE");
      this.gentleStreak = 0;
    } else if (pressure < 0.35) {
      this.gentleStreak += 1;
      if (this.gentleStreak >= 20) this.unlockAch("GENTLE");
    } else {
      this.gentleStreak = 0;
    }

    // Area coverage
    if (area && area !== "unknown") {
      const counts = this.storage.getStats().areaCounts;
      let ok = true;
      for (const a of REQUIRED_AREAS) {
        if (!counts[a]) {
          ok = false;
          break;
        }
      }
      if (ok) this.unlockAch("ALL_AREAS");
    }
  }

  private onCombo(combo: number): void {
    if (combo >= 10) this.unlockAch("COMBO_10");
    if (combo >= 20) this.unlockAch("COMBO_20");
    if (combo >= 50) this.unlockEgg("EGG_COMBO_50");
  }

  private checkEggs(total: number): void {
    if (total >= 66) this.unlockEgg("EGG_66");
    if (total >= 100) this.unlockEgg("EGG_100");
    if (total >= 666) this.unlockEgg("EGG_666");
    if (total >= 888) this.unlockEgg("EGG_888");
    if (total >= 1000) this.unlockEgg("EGG_1000");
  }

  /** Used when waking from sleepy. */
  notifySleepWake(): void {
    this.unlockEgg("EGG_SLEEP");
  }

  private unlockAch(id: string): void {
    if (!this.storage.unlockAchievement(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    const toast: UnlockToast = { kind: "achievement", name: def.name, desc: def.desc };
    eventBus.emit("achievement:unlock", toast);
    eventBus.emit("toast:show", toast);
  }

  private unlockEgg(id: string): void {
    if (!this.storage.unlockEgg(id)) return;
    const def = EASTER_EGGS.find((a) => a.id === id);
    if (!def) return;
    const toast: UnlockToast = { kind: "egg", name: def.name, desc: def.desc };
    eventBus.emit("easterEgg:trigger", toast);
    eventBus.emit("toast:show", toast);
  }
}
