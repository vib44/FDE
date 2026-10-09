import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { normalize } from "../lib/data/normalize.ts";
import { buildAlerts, overviewInsights, overviewInsightIds, rankAlerts, roundImpact } from "../lib/insights/index.ts";
import type { Rankable } from "../lib/insights/types.ts";
import { itemCopy } from "../lib/insights/present.ts";

const ds = normalize(JSON.parse(readFileSync("data/dealership_data.json", "utf8")));
const L = 100_000;
const item = (id: string, impact: number, effort: Rankable["effort"]): Rankable => ({ id, impact, effort });

describe("rankAlerts", () => {
  it("ranks a long, high-impact alert above a quick, lower-impact one", () => {
    const ranked = rankAlerts([item("quick", 30 * L, "quick"), item("long", 80 * L, "long")]);
    expect(ranked.map((r) => r.alerts[0]!.id)).toEqual(["long", "quick"]);
  });

  it("breaks equal rounded impact by quicker effort", () => {
    const ranked = rankAlerts([item("long", 52 * L, "long"), item("medium", 48 * L, "medium"), item("quick", 51 * L, "quick")].slice(0, 2));
    expect(ranked.map((r) => r.alerts[0]!.id)).toEqual(["medium", "long"]);
    const three = rankAlerts([item("m", 50 * L, "medium"), item("q", 54 * L, "quick")]);
    expect(three.map((r) => r.alerts[0]!.id)).toEqual(["q", "m"]);
  });

  it("groups equal rounded impact and equal effort", () => {
    const ranked = rankAlerts([item("a", 52 * L, "quick"), item("b", 48 * L, "quick"), item("c", 10 * L, "quick")]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.equalPriority).toBe(true);
    expect(ranked[0]!.alerts.map((a) => a.id).sort()).toEqual(["a", "b"]);
    expect(ranked[0]!.impact).toBe(100 * L);
  });

  it("rounds to the configured step for comparison only", () => {
    expect(roundImpact(1_400_000, 1_000_000)).toBe(1_000_000);
    expect(roundImpact(1_600_000, 1_000_000)).toBe(2_000_000);
  });
});

describe("insights engine", () => {
  const alerts = buildAlerts(ds, EMPTY_FILTERS);

  it("names an owner on every alert and has positive impact", () => {
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.owner).toBeTruthy();
      expect(alert.impact).toBeGreaterThan(0);
    }
  });

  it("counts each lead in at most one client-level alert", () => {
    const seen = new Set<string>();
    for (const alert of alerts.filter((a) => a.claimsLeads)) {
      for (const id of alert.leadIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("keeps strategic insights out of the ranked list", () => {
    const rankedKinds = overviewInsights(ds, EMPTY_FILTERS).todo.flatMap((r) => r.alerts.map((a) => a.kind));
    for (const kind of ["lead_volume", "target_gap", "no_unordered", "lost_before_contact"]) {
      expect(rankedKinds).not.toContain(kind);
    }
  });

  it("respects the branch filter", () => {
    const branch = ds.branches[0]!;
    const scoped = buildAlerts(ds, { ...EMPTY_FILTERS, branch: branch.id });
    for (const alert of scoped.filter((a) => a.claimsLeads)) {
      for (const id of alert.leadIds) expect(ds.leadById[id]!.branchId).toBe(branch.id);
    }
  });
});

describe("overview composition", () => {
  const overview = overviewInsights(ds, EMPTY_FILTERS);

  it("shows no insight id twice", () => {
    const ids = overviewInsightIds(overview);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the target gap and lead-volume ceiling out of Watch", () => {
    expect(overview.keyInsight?.kind).toBe("lead_volume");
    expect(overview.watch.map((i) => i.kind)).not.toContain("target_gap");
    expect(overview.watch.map((i) => i.kind)).not.toContain("lead_volume");
  });

  it("names owners and the issue for equal-priority groups", () => {
    for (const item of overview.todo.filter((r) => r.equalPriority)) {
      const copy = itemCopy(item);
      expect(copy.headline).not.toMatch(/equal priority/i);
      expect(copy.headline).toContain(": ");
      expect(copy.recoverable).toMatch(/each$/);
    }
  });
});
