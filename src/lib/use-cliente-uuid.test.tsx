import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useClienteUuid } from "@/lib/use-cliente-uuid";

function Probe() {
  const [id] = useClienteUuid();
  return <input type="hidden" value={id} />;
}

describe("useClienteUuid", () => {
  it("en SSR devuelve cadena vacía: un UUID aquí rompería la hidratación", () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('value=""');
    expect(html).not.toMatch(/value="[0-9a-f-]{36}"/);
  });
});
