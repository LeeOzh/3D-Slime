import { ACHIEVEMENTS, AREA_LABELS, EASTER_EGGS } from "../data/achievements";
import type { StorageManager } from "../storage/StorageManager";

function flavor(r: {
  squishCount: number;
  maxCombo: number;
  averagePressure: number;
  mostSquishedArea: string;
}): string {
  if (r.squishCount === 0) return "今天还没捏哦，来一下？";
  if (r.averagePressure < 0.3 && r.squishCount > 30) return "今天捏得很温柔。";
  if (r.averagePressure > 0.75) return "看来今天压力有一点点大。";
  if (r.maxCombo >= 20) return "你今天手感不错。";
  if (r.squishCount > 200) return "今天和小伙伴相处得不错。";
  return "捏一下，今天就轻松一点。";
}

/**
 * Light report + collection panel. Not a dashboard — a soft overlay card.
 */
export class ReportPanel {
  private readonly backdrop: HTMLElement;
  private readonly card: HTMLElement;
  private open = false;

  constructor(
    private readonly storage: StorageManager,
    parent: HTMLElement,
  ) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "report-backdrop";
    this.backdrop.hidden = true;

    this.card = document.createElement("div");
    this.card.className = "report-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-label", "今日捏捏报告");

    this.backdrop.appendChild(this.card);
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });
    parent.appendChild(this.backdrop);
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.render();
    this.backdrop.hidden = false;
    this.backdrop.classList.add("is-open");
    this.open = true;
  }

  hide(): void {
    this.backdrop.hidden = true;
    this.backdrop.classList.remove("is-open");
    this.open = false;
  }

  private render(): void {
    const r = this.storage.getTodayReport();
    const col = this.storage.getCollection();
    const stats = this.storage.getStats();
    const achDone = ACHIEVEMENTS.filter((a) => col.achievements[a.id]).length;
    const eggDone = EASTER_EGGS.filter((a) => col.easterEggs[a.id]).length;

    const achRows = ACHIEVEMENTS.map((a) => {
      const on = !!col.achievements[a.id];
      return `<li class="${on ? "is-done" : ""}"><span>${on ? "✓" : "○"}</span> ${a.name}<em>${a.desc}</em></li>`;
    }).join("");
    const eggRows = EASTER_EGGS.map((a) => {
      const on = !!col.easterEggs[a.id];
      return `<li class="${on ? "is-done" : ""}"><span>${on ? "✓" : "○"}</span> ${a.name}<em>${a.desc}</em></li>`;
    }).join("");

    this.card.innerHTML = `
      <button type="button" class="report-close" aria-label="关闭">✕</button>
      <h2>今日捏捏报告</h2>
      <p class="report-date">${r.date}</p>
      <div class="report-grid">
        <div><b>${r.squishCount}</b><span>今日次数</span></div>
        <div><b>×${r.maxCombo}</b><span>最高 Combo</span></div>
        <div><b>${Math.round(r.averagePressure * 100)}%</b><span>平均压力</span></div>
        <div><b>${AREA_LABELS[r.mostSquishedArea] ?? "身体"}</b><span>最常捏</span></div>
      </div>
      <p class="report-flavor">${flavor(r)}</p>
      <div class="report-sub">
        <h3>成就 ${achDone}/${ACHIEVEMENTS.length}</h3>
        <ul class="report-list">${achRows}</ul>
      </div>
      <div class="report-sub">
        <h3>彩蛋 ${eggDone}/${EASTER_EGGS.length}</h3>
        <ul class="report-list">${eggRows}</ul>
      </div>
      <p class="report-total">累计捏压 ${stats.totalSquishCount} 次 · 回弹 ${stats.totalReleaseCount} 次 · 最高 Combo ×${stats.maxCombo}</p>
    `;
    this.card.querySelector(".report-close")?.addEventListener("click", () => this.hide());
  }
}
