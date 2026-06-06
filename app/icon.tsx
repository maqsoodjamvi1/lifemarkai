import { ImageResponse } from "next/og";

// Route segment config
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const revalidate = 86400; // Cache for 24 hours

// App icon
export default function Icon() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 20,
            background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            color: "white",
            fontWeight: 900,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "-1px",
          }}
        >
          L
        </div>
      ),
      { ...size }
    );
  } catch (error) {
    // Fallback if ImageResponse fails
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#7c3aed",
            fontSize: 16,
            color: "white",
            fontWeight: "bold",
          }}
        >
          L
        </div>
      ),
      { ...size }
    );
  }
}
