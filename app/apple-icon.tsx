import { ImageResponse } from "next/og";

// Route segment config
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 96,
          background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          color: "white",
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-4px",
        }}
      >
        L
      </div>
    ),
    { ...size }
  );
}
