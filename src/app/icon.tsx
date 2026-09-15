import { ImageResponse } from "next/og";

// Ícono de la app: terracota a sangre completa (compatible con máscara
// adaptativa/maskable) con el monograma "B" dentro de la zona segura.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#8a5140",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#f2e3dc",
            borderRadius: "50%",
            display: "flex",
            height: 320,
            justifyContent: "center",
            width: 320,
          }}
        >
          <span
            style={{
              color: "#8a5140",
              fontSize: 190,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            B
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
