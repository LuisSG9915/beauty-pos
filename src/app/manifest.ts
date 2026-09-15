import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beauty POS",
    short_name: "Beauty POS",
    description: "Gestión integral para salones de belleza",
    start_url: "/admin",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#8a5140",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
