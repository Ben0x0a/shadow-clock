/**
 * heatmap.ts — day-of-year × time-of-day confidence map (time mode).
 *
 * Defines: Heatmap view (mount, render, selection callback).
 * Used by: ui/results/timeResults.ts.
 * Depends on: core/models.ts, core/zone.ts, ui/dom.ts, ui/format.ts, ui/results/colours.ts.
 *
 * HOW: the misfit grid is painted 1 cell = 1 pixel into an offscreen canvas and scaled to
 * the display canvas (nearest-neighbour), so a whole year redraws in a few milliseconds.
 * Axes, cluster labels and the crosshair are drawn on the display canvas. Dragging a
 * rectangle zooms in; double-click or "Reset zoom" zooms out. Hover shows a tooltip;
 * click selects that instant (the sun-path chart follows).
 * WHY a heatmap: it shows the whole year at once, so the twin solutions, their
 * width and how they merge near a solstice are visible at a glance.
 */

import type { Cluster, Heatmap, Zone } from "../../core/models";
import { h } from "../dom";
import { fmtDate, fmtTime, MONTH_NAMES } from "../format";
import { wallToUtc, zoneOffsetMin } from "../../core/zone";
import { cssVar, heatPalette, type Levels } from "./colours";

interface View {
  d0: number;
  d1: number;
  s0: number;
  s1: number;
}

const PAD = { l: 44, r: 12, t: 10, b: 26 };

export class HeatmapView {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private tooltip: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private data: Heatmap | null = null;
  private clusters: Cluster[] = [];
  private levels: Levels = { l68: 1, l95: 1, l997: 1 };
  private zone: Zone = { kind: "utc" };
  private lon = 0;
  private view: View = { d0: 0, d1: 365, s0: 0, s1: 288 };
  private hover: { x: number; y: number } | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private selectedMs: number | null = null;
  private offscreen = document.createElement("canvas");
  onSelect: (ms: number) => void = () => {};

  constructor() {
    this.canvas = h("canvas", { class: "heatmap", role: "img", "aria-label": "Confidence map: day of year horizontally, time of day vertically" });
    this.tooltip = h("div", { class: "tooltip", role: "status", hidden: true });
    this.resetBtn = h("button", { type: "button", class: "btn ghost small", hidden: true, onclick: () => this.resetZoom() }, "Reset zoom");
    this.el = h("div", { class: "heatmap-wrap" }, this.canvas, this.tooltip);
    this.bind();
    new ResizeObserver(() => this.draw()).observe(this.el);
  }

  get resetButton(): HTMLButtonElement {
    return this.resetBtn;
  }

  render(data: Heatmap, clusters: Cluster[], levels: Levels, zone: Zone, lon: number): void {
    const sameShape = this.data && this.data.days === data.days && this.data.slots === data.slots;
    this.data = data;
    this.clusters = clusters.filter((c) => c.year === data.year);
    this.levels = levels;
    this.zone = zone;
    this.lon = lon;
    if (!sameShape) this.view = { d0: 0, d1: data.days, s0: 0, s1: data.slots };
    this.paintOffscreen();
    this.draw();
  }

  select(ms: number | null): void {
    this.selectedMs = ms;
    this.draw();
  }

  private resetZoom(): void {
    if (!this.data) return;
    this.view = { d0: 0, d1: this.data.days, s0: 0, s1: this.data.slots };
    this.draw();
  }

  zoomTo(c: Cluster): void {
    if (!this.data) return;
    const d = this.data;
    const day = (ms: number) => this.dayOf(ms);
    const a = Math.max(0, Math.floor(day(c.firstMs)) - 5);
    const b = Math.min(d.days, Math.ceil(day(c.lastMs)) + 6);
    const tods = c.windows.flatMap((w) => [w.startMs, w.endMs]).map((ms) => ((day(ms) % 1) + 1) % 1);
    const lo = Math.max(0, Math.floor(Math.min(...tods) * d.slots) - 12);
    const hi = Math.min(d.slots, Math.ceil(Math.max(...tods) * d.slots) + 12);
    if (hi - lo < d.slots * 0.8) this.view = { d0: a, d1: b, s0: lo, s1: hi };
    else this.view = { d0: a, d1: b, s0: 0, s1: d.slots };
    this.draw();
  }

  private paintOffscreen(): void {
    const d = this.data as Heatmap;
    const pal = heatPalette(this.levels);
    this.offscreen.width = d.days;
    this.offscreen.height = d.slots;
    const ctx = this.offscreen.getContext("2d") as CanvasRenderingContext2D;
    const img = ctx.createImageData(d.days, d.slots);
    const excluded = cssVar("--heat-excluded");
    const ex = excluded.startsWith("#") ? parseInt(excluded.slice(1), 16) : 0x888888;
    for (let day = 0; day < d.days; day++) {
      for (let s = 0; s < d.slots; s++) {
        const v = d.values[day * d.slots + s];
        const o = (s * d.days + day) * 4;
        if (Number.isNaN(v)) {
          // Excluded by a constraint: faint diagonal hatch.
          const on = (day + s) % 6 < 2;
          img.data[o] = (ex >> 16) & 255;
          img.data[o + 1] = (ex >> 8) & 255;
          img.data[o + 2] = ex & 255;
          img.data[o + 3] = on ? 90 : 25;
          continue;
        }
        const [r, g, b, a] = pal.rgb(v);
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private geom() {
    const w = this.el.clientWidth;
    const hgt = Math.max(220, Math.min(360, w * 0.5));
    return { w, h: hgt, pw: w - PAD.l - PAD.r, ph: hgt - PAD.t - PAD.b };
  }

  private toData(x: number, y: number): { day: number; slot: number } | null {
    const g = this.geom();
    const v = this.view;
    const fx = (x - PAD.l) / g.pw;
    const fy = (y - PAD.t) / g.ph;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { day: v.d0 + fx * (v.d1 - v.d0), slot: v.s0 + fy * (v.s1 - v.s0) };
  }

  /** Grid cell (wall-clock day, slot) → instant, exactly as the solver built the grid. */
  private msAt(day: number, slot: number): number {
    const d = this.data as Heatmap;
    const wall = Date.UTC(d.year, 0, 1) + Math.floor(day) * 86_400_000 + slot * d.slotMin * 60_000;
    return wallToUtc(this.zone, wall, this.lon);
  }

  /** Instant → fractional wall-clock day of year (integer part) and time of day (fraction). */
  private dayOf(ms: number): number {
    const d = this.data as Heatmap;
    const wall = ms + zoneOffsetMin(this.zone, ms, this.lon) * 60_000;
    return (wall - Date.UTC(d.year, 0, 1)) / 86_400_000;
  }

  private draw(): void {
    const d = this.data;
    const g = this.geom();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = `${g.h}px`;
    this.canvas.width = Math.round(g.w * dpr);
    this.canvas.height = Math.round(g.h * dpr);
    const ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    if (!d) return;
    const v = this.view;
    const zoomed = v.d0 !== 0 || v.d1 !== d.days || v.s0 !== 0 || v.s1 !== d.slots;
    this.resetBtn.hidden = !zoomed;

    ctx.fillStyle = cssVar("--chart-surface");
    ctx.fillRect(PAD.l, PAD.t, g.pw, g.ph);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen, v.d0, v.s0, v.d1 - v.d0, v.s1 - v.s0, PAD.l, PAD.t, g.pw, g.ph);

    const X = (day: number) => PAD.l + ((day - v.d0) / (v.d1 - v.d0)) * g.pw;
    const Y = (slot: number) => PAD.t + ((slot - v.s0) / (v.s1 - v.s0)) * g.ph;
    const muted = cssVar("--text-muted");
    const grid = cssVar("--grid");
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = muted;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;

    // Hour ticks (left).
    const hoursSpan = ((v.s1 - v.s0) * d.slotMin) / 60;
    const hStep = hoursSpan > 12 ? 6 : hoursSpan > 6 ? 2 : hoursSpan > 2 ? 1 : 0.25;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let hr = Math.ceil(((v.s0 * d.slotMin) / 60) / hStep) * hStep; hr <= (v.s1 * d.slotMin) / 60 + 1e-9; hr += hStep) {
      const y = Y((hr * 60) / d.slotMin);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y + 0.5);
      ctx.lineTo(PAD.l + g.pw, y + 0.5);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const hh = Math.floor(hr);
      const mm = Math.round((hr - hh) * 60);
      ctx.fillText(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, PAD.l - 6, y);
    }
    // Month / day ticks (bottom).
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const daysSpan = v.d1 - v.d0;
    if (daysSpan > 60) {
      for (let m = 0; m < 12; m++) {
        const day = (Date.UTC(d.year, m, 1) - Date.UTC(d.year, 0, 1)) / 86_400_000;
        const next = (Date.UTC(d.year, m + 1, 1) - Date.UTC(d.year, 0, 1)) / 86_400_000;
        if (next < v.d0 || day > v.d1) continue;
        ctx.beginPath();
        ctx.moveTo(X(day) + 0.5, PAD.t);
        ctx.lineTo(X(day) + 0.5, PAD.t + g.ph);
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const mid = (Math.max(day, v.d0) + Math.min(next, v.d1)) / 2;
        if (X(Math.min(next, v.d1)) - X(Math.max(day, v.d0)) > 22) ctx.fillText(MONTH_NAMES[m], X(mid), PAD.t + g.ph + 6);
      }
    } else {
      const step = daysSpan > 20 ? 5 : daysSpan > 8 ? 2 : 1;
      for (let day = Math.ceil(v.d0); day <= v.d1; day += 1) {
        const date = new Date(Date.UTC(d.year, 0, 1) + day * 86_400_000);
        if ((date.getUTCDate() - 1) % step !== 0) continue;
        ctx.fillText(`${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`, X(day + 0.5), PAD.t + g.ph + 6);
      }
    }

    // Cluster labels (direct labels; the list below is the table view).
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const c of this.clusters) {
      const day = this.dayOf(c.bestMs);
      const slot = ((day % 1) + 1) % 1 * d.slots;
      const x = X(Math.floor(day) + 0.5);
      const y = Y(slot);
      if (x < PAD.l || x > PAD.l + g.pw || y < PAD.t || y > PAD.t + g.ph) continue;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = cssVar("--chart-surface");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = cssVar("--text-primary");
      ctx.stroke();
      ctx.fillStyle = cssVar("--text-primary");
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(c.id + 1), x, y + 0.5);
      ctx.textAlign = "left";
      ctx.font = "11px system-ui, sans-serif";
    }

    // Selection marker: a ring with short ticks, so the data under it stays visible.
    if (this.selectedMs !== null) {
      const day = this.dayOf(this.selectedMs);
      if (day >= v.d0 && day <= v.d1) {
        const slot = (((day % 1) + 1) % 1) * d.slots;
        const x = X(Math.floor(day) + 0.5);
        const y = Y(slot);
        ctx.strokeStyle = cssVar("--accent");
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(x + dx * 11, y + dy * 11);
          ctx.lineTo(x + dx * 18, y + dy * 18);
        }
        ctx.stroke();
      }
    }

    // Hover crosshair.
    if (this.hover && !this.drag) {
      ctx.strokeStyle = cssVar("--text-secondary");
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.hover.x + 0.5, PAD.t);
      ctx.lineTo(this.hover.x + 0.5, PAD.t + g.ph);
      ctx.moveTo(PAD.l, this.hover.y + 0.5);
      ctx.lineTo(PAD.l + g.pw, this.hover.y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.drag) {
      const { x0, y0, x1, y1 } = this.drag;
      ctx.fillStyle = cssVar("--accent-wash");
      ctx.strokeStyle = cssVar("--accent");
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  private describe(day: number, slot: number): string {
    const d = this.data as Heatmap;
    const di = Math.floor(day);
    const si = Math.floor(slot);
    const v = d.values[di * d.slots + si];
    const ms = this.msAt(di, si + 0.5);
    const when = `${fmtDate(ms, this.zone, this.lon)} ${fmtTime(ms, this.zone, this.lon)}`;
    let what: string;
    if (Number.isNaN(v)) what = "excluded by your constraints";
    else if (v <= this.levels.l68) what = "inside the 68 % region";
    else if (v <= this.levels.l95) what = "inside the 95 % region";
    else if (v <= this.levels.l997) what = "inside the 99.7 % region";
    else what = `outside (misfit ${v.toFixed(1)}× the 95 % limit)`;
    return `${when} — ${what}`;
  }

  private bind(): void {
    const c = this.canvas;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("pointermove", (e) => {
      const p = pos(e);
      if (this.drag) {
        this.drag.x1 = p.x;
        this.drag.y1 = p.y;
        this.draw();
        return;
      }
      const dp = this.data ? this.toData(p.x, p.y) : null;
      if (!dp) {
        this.hover = null;
        this.tooltip.hidden = true;
        this.draw();
        return;
      }
      this.hover = p;
      this.tooltip.hidden = false;
      this.tooltip.textContent = this.describe(dp.day, dp.slot);
      const w = this.el.clientWidth;
      this.tooltip.style.left = `${Math.min(p.x + 12, w - 240)}px`;
      this.tooltip.style.top = `${p.y + 14}px`;
      this.draw();
    });
    c.addEventListener("pointerleave", () => {
      this.hover = null;
      this.tooltip.hidden = true;
      this.draw();
    });
    c.addEventListener("pointerdown", (e) => {
      if (!this.data) return;
      const p = pos(e);
      if (!this.toData(p.x, p.y)) return;
      c.setPointerCapture(e.pointerId);
      this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    });
    c.addEventListener("pointerup", (e) => {
      const dr = this.drag;
      this.drag = null;
      if (!dr || !this.data) return;
      const moved = Math.abs(dr.x1 - dr.x0) > 6 && Math.abs(dr.y1 - dr.y0) > 6;
      if (!moved) {
        const dp = this.toData(dr.x0, dr.y0);
        if (dp) this.onSelect(this.msAt(dp.day, Math.floor(dp.slot) + 0.5));
        this.draw();
        return;
      }
      const a = this.toData(Math.min(dr.x0, dr.x1), Math.min(dr.y0, dr.y1)) ?? { day: this.view.d0, slot: this.view.s0 };
      const b = this.toData(Math.max(dr.x0, dr.x1), Math.max(dr.y0, dr.y1)) ?? { day: this.view.d1, slot: this.view.s1 };
      this.view = {
        d0: Math.max(0, Math.floor(a.day)),
        d1: Math.min(this.data.days, Math.max(Math.floor(a.day) + 2, Math.ceil(b.day))),
        s0: Math.max(0, Math.floor(a.slot)),
        s1: Math.min(this.data.slots, Math.max(Math.floor(a.slot) + 3, Math.ceil(b.slot))),
      };
      e.preventDefault();
      this.draw();
    });
    c.addEventListener("dblclick", () => this.resetZoom());
  }
}
