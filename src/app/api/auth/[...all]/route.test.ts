import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("Better Auth route", () => {
  it("exposes the HTTP handlers without initializing the database at import time", () => {
    expect(GET).toBeTypeOf("function");
    expect(POST).toBeTypeOf("function");
  });
});
