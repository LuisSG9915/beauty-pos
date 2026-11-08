import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

import { ModalConfirmacionCobro } from "./modal-confirmacion-cobro";

describe("ModalConfirmacionCobro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("es un componente de React válido", () => {
    expect(typeof ModalConfirmacionCobro).toBe("function");
  });

  it("todas las exportaciones esperadas existen", () => {
    expect(ModalConfirmacionCobro).toBeDefined();
    expect(typeof ModalConfirmacionCobro).toBe("function");
  });
});
