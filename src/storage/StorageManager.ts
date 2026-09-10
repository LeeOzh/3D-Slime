const STATS_KEY = "squishy_stats";
const COLLECTION_KEY = "squishy_collection";
const SETTINGS_KEY = "squishy_settings";

export interface AppSettings {
  soundEnabled: boolean;
  particleEnabled: boolean;
}

export interface DailyStat {
  date: string;
  squishCount: number;
  maxCombo: number;
  maxPressure: number;
  pressureSum: number;
  pressureCount: number;
  areaCounts: Record<string, number>;
}

export interface StatsSnapshot {
  totalSquishCount: number;
  totalReleaseCount: number;
  maxCombo: number;
  maxPressure: number;
  pressureSum: number;
  pressureCount: number;
  areaCounts: Record<string, number>;
  lastDate: string;
  today: DailyStat;
  dailyStats: Record<string, DailyStat>;
}

export interface CollectionSnapshot {
  characters: Record<string, boolean>;
  achievements: Record<string, number>;
  easterEggs: Record<string, number>;
}

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyDaily(date: string): DailyStat {
  return {
    date,
    squishCount: 0,
    maxCombo: 0,
    maxPressure: 0,
    pressureSum: 0,
    pressureCount: 0,
    areaCounts: {},
  };
}

function defaultSettings(): AppSettings {
  return { soundEnabled: true, particleEnabled: true };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return structuredClone(fallback);
  try {
    const obj = JSON.parse(raw) as T;
    if (!obj || typeof obj !== "object") return structuredClone(fallback);
    return obj;
  } catch {
    return structuredClone(fallback);
  }
}

function defaultStats(): StatsSnapshot {
  const date = todayKey();
  return {
    totalSquishCount: 0,
    totalReleaseCount: 0,
    maxCombo: 0,
    maxPressure: 0,
    pressureSum: 0,
    pressureCount: 0,
    areaCounts: {},
    lastDate: date,
    today: emptyDaily(date),
    dailyStats: {},
  };
}

function defaultCollection(): CollectionSnapshot {
  return {
    characters: { mochi: true, pudding: true, drop: true, cat: true, nezha: true },
    achievements: {},
    easterEggs: {},
  };
}

export function mostArea(counts: Record<string, number>): string {
  let best = "unknown";
  let n = 0;
  for (const k in counts) {
    if (counts[k] > n) {
      n = counts[k];
      best = k;
    }
  }
  return best;
}

/**
 * Central localStorage. Safe against corrupt JSON / private mode.
 * Stats + collection + settings.
 */
export class StorageManager {
  pressCount = 0;
  private settings: AppSettings;
  private stats: StatsSnapshot;
  private collection: CollectionSnapshot;

  constructor() {
    this.settings = { ...defaultSettings(), ...safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {}) };
    this.stats = safeParse<StatsSnapshot>(localStorage.getItem(STATS_KEY), defaultStats());
    this.collection = safeParse<CollectionSnapshot>(localStorage.getItem(COLLECTION_KEY), defaultCollection());
    this.rollDay();
  }

  private rollDay(): void {
    const t = todayKey();
    if (this.stats.lastDate === t) return;
    const prev = this.stats.lastDate;
    if (prev && this.stats.today && this.stats.today.squishCount > 0) {
      this.stats.dailyStats[prev] = this.stats.today;
    }
    this.stats.lastDate = t;
    this.stats.today = emptyDaily(t);
    this.saveStats();
  }

  incrementPress(): number {
    this.pressCount += 1;
    return this.pressCount;
  }

  getPressCount(): number {
    return this.pressCount;
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  setSoundEnabled(v: boolean): void {
    this.settings.soundEnabled = v;
    this.saveSettings();
  }

  setParticleEnabled(v: boolean): void {
    this.settings.particleEnabled = v;
    this.saveSettings();
  }

  getStats(): StatsSnapshot {
    return this.stats;
  }

  getCollection(): CollectionSnapshot {
    return this.collection;
  }

  recordSquish(pressure: number, area: string, combo: number): void {
    this.rollDay();
    this.stats.totalSquishCount += 1;
    this.stats.today.squishCount += 1;
    this.stats.pressureSum += pressure;
    this.stats.today.pressureSum += pressure;
    this.stats.pressureCount += 1;
    this.stats.today.pressureCount += 1;
    this.stats.maxPressure = Math.max(this.stats.maxPressure, pressure);
    this.stats.today.maxPressure = Math.max(this.stats.today.maxPressure, pressure);
    this.stats.maxCombo = Math.max(this.stats.maxCombo, combo);
    this.stats.today.maxCombo = Math.max(this.stats.today.maxCombo, combo);
    if (area && area !== "unknown") {
      this.stats.areaCounts[area] = (this.stats.areaCounts[area] || 0) + 1;
      this.stats.today.areaCounts[area] = (this.stats.today.areaCounts[area] || 0) + 1;
    }
    this.saveStats();
  }

  recordRelease(): void {
    this.stats.totalReleaseCount += 1;
    this.saveStats();
  }

  hasAchievement(id: string): boolean {
    return !!this.collection.achievements[id];
  }

  unlockAchievement(id: string): boolean {
    if (this.collection.achievements[id]) return false;
    this.collection.achievements[id] = Date.now();
    this.saveCollection();
    return true;
  }

  hasEgg(id: string): boolean {
    return !!this.collection.easterEggs[id];
  }

  unlockEgg(id: string): boolean {
    if (this.collection.easterEggs[id]) return false;
    this.collection.easterEggs[id] = Date.now();
    this.saveCollection();
    return true;
  }

  getTodayReport(): {
    date: string;
    squishCount: number;
    maxCombo: number;
    maxPressure: number;
    averagePressure: number;
    mostSquishedArea: string;
  } {
    this.rollDay();
    const t = this.stats.today;
    const avg = t.pressureCount ? t.pressureSum / t.pressureCount : 0;
    return {
      date: t.date,
      squishCount: t.squishCount,
      maxCombo: t.maxCombo,
      maxPressure: t.maxPressure,
      averagePressure: avg,
      mostSquishedArea: mostArea(t.areaCounts),
    };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch { /* ignore */ }
  }

  private saveStats(): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
    } catch { /* ignore */ }
  }

  private saveCollection(): void {
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(this.collection));
    } catch { /* ignore */ }
  }
}
