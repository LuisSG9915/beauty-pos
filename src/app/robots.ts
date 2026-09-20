import type { MetadataRoute } from "next";

/** App interna de operación: no se indexa. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
