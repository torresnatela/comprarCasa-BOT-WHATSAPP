import { describe, expect, it } from "vitest";
import { canAccessLead, leadScope } from "./access";

const seller = (messageAccess: "TODAS" | "PROPRIAS" | "NENHUMA") => ({
  id: "vendedor",
  role: "VENDEDOR" as const,
  messageAccess,
});

describe("leadScope", () => {
  it("gestor sempre alcança todos os leads", () => {
    expect(leadScope({ role: "GESTOR", messageAccess: "NENHUMA" })).toBe("ALL");
  });

  it("vendedor segue o nível configurado", () => {
    expect(leadScope(seller("TODAS"))).toBe("ALL");
    expect(leadScope(seller("PROPRIAS"))).toBe("OWN");
    expect(leadScope(seller("NENHUMA"))).toBe("NONE");
  });
});

describe("canAccessLead", () => {
  const own = { assignedTo: "vendedor" };
  const other = { assignedTo: "outro" };
  const unassigned = { assignedTo: null };

  it("TODAS alcança qualquer lead, inclusive sem vendedor", () => {
    for (const lead of [own, other, unassigned]) {
      expect(canAccessLead(seller("TODAS"), lead)).toBe(true);
    }
  });

  it("PROPRIAS alcança só os leads entregues a ele", () => {
    expect(canAccessLead(seller("PROPRIAS"), own)).toBe(true);
    expect(canAccessLead(seller("PROPRIAS"), other)).toBe(false);
    expect(canAccessLead(seller("PROPRIAS"), unassigned)).toBe(false);
  });

  it("NENHUMA não alcança nada, nem os próprios", () => {
    expect(canAccessLead(seller("NENHUMA"), own)).toBe(false);
  });

  it("gestor alcança tudo", () => {
    const manager = { id: "g", role: "GESTOR" as const, messageAccess: "NENHUMA" as const };
    expect(canAccessLead(manager, other)).toBe(true);
  });
});
