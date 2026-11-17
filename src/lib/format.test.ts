import { describe, expect, it } from "vitest";
import { formatDateTime, formatPhone, ROLE_LABELS, STATUS_LABELS } from "./format";

describe("formatPhone", () => {
  it.each([
    ["5511988887777", "+55 (11) 98888-7777"],
    ["551133334444", "+55 (11) 3333-4444"],
    ["", "—"],
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
