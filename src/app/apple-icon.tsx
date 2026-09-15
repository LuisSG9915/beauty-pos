import { ImageResponse } from "next/og";

// Mismo diseño que `icon.tsx` en el tamaño que pide iOS para la pantalla
// de inicio (180×180).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            height: 112,
            justifyContent: "center",
            width: 112,
          }}
        >
          <span
            style={{
              color: "#8a5140",
              fontSize: 66,
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
