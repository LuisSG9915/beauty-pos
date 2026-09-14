import { describe, expect, it } from "vitest";

import { isRetryableDbError, withDbRetry } from "./retry";

const pgError = (code: string) => Object.assign(new Error("db error"), { code });

describe("isRetryableDbError", () => {
  it("40001 (serialization) y 40P01 (deadlock) son reintentables", () => {
    expect(isRetryableDbError(pgError("40001"))).toBe(true);
    expect(isRetryableDbError(pgError("40P01"))).toBe(true);
  });

  it("detecta el código anidado en cause", () => {
    const wrapped = Object.assign(new Error("wrapper"), { cause: pgError("40001") });
    expect(isRetryableDbError(wrapped)).toBe(true);
  });

  it("otros códigos no son reintentables", () => {
    expect(isRetryableDbError(pgError("23505"))).toBe(false);
    expect(isRetryableDbError(new Error("sin código"))).toBe(false);
    expect(isRetryableDbError("texto")).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("devuelve el resultado si la función tiene éxito al primer intento", async () => {
    let calls = 0;
    const result = await withDbRetry(async () => {
      calls += 1;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("reintenta ante un error 40001 y devuelve el éxito posterior", async () => {
    let calls = 0;
    const result = await withDbRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw pgError("40001");
        return "recuperado";
      },
      { baseDelayMs: 0 },
    );
    expect(result).toBe("recuperado");
    expect(calls).toBe(3);
  });

  it("agota los intentos y propaga el último error", async () => {
    let calls = 0;
    await expect(
      withDbRetry(
        async () => {
          calls += 1;
          throw pgError("40001");
        },
        { attempts: 2, baseDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(calls).toBe(2);
  });

  it("no reintenta errores no reintentables", async () => {
    let calls = 0;
    await expect(
      withDbRetry(async () => {
        calls += 1;
        throw pgError("23505");
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(calls).toBe(1);
  });
});
