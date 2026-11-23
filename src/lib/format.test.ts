import { describe, expect, it } from "vitest";
import {
  dueStatus,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  leadTitle,
  todayISO,
  ROLE_LABELS,
  STATUS_LABELS,
} from "./format";

describe("formatPhone", () => {
  it.each([
    ["5511988887777", "+55 (11) 98888-7777"],
    ["551133334444", "+55 (11) 3333-4444"],
    ["351912345678", "+351 912 345 678"],
    ["", "—"],
    [null, "—"],
    ["447911123456", "+447911123456"],
  ])("formata %j como %j", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});

describe("rótulos", () => {
  it("traduz papéis e status para o português da interface", () => {
    expect(ROLE_LABELS).toEqual({ GESTOR: "Gestor", VENDEDOR: "Vendedor" });
    expect(STATUS_LABELS).toEqual({
      PENDENTE: "Convite pendente",
      ATIVO: "Ativo",
      INATIVO: "Inativo",
    });
  });
});

describe("formatDateTime", () => {
  it("mostra data e hora no padrão brasileiro", () => {
    expect(formatDateTime("2026-11-24T15:30:00Z", "America/Sao_Paulo")).toBe(
      "24/11/2026 às 12:30",
    );
  });
});

describe("leadTitle", () => {
  it("usa o nome do WhatsApp, depois o telefone, depois um texto neutro", () => {
    expect(leadTitle({ name: "Maria Silva", phone: "351912345678" })).toBe("Maria Silva");
    expect(leadTitle({ name: null, phone: "351912345678" })).toBe("+351 912 345 678");
    expect(leadTitle({ name: null, phone: null })).toBe("Contato sem número");
  });
});

describe("funil", () => {
  it("formata dinheiro e data", () => {
    expect(formatMoney(350000).replace(/\s/g, " ")).toBe("R$ 350.000,00");
    expect(formatDate("2026-11-05")).toBe("05/11/2026");
  });

  it("classifica o vencimento em relação a hoje", () => {
    expect(todayISO(new Date(2026, 0, 9, 23, 30))).toBe("2026-01-09");
    expect(dueStatus("2026-11-19", "2026-11-20")).toBe("vencida");
    expect(dueStatus("2026-11-20", "2026-11-20")).toBe("hoje");
    expect(dueStatus("2026-11-21", "2026-11-20")).toBe("futura");
  });
});
