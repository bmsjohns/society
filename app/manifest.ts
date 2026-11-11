import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prologue Society Scan",
    short_name: "Society Scan",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#AD3B28",
    theme_color: "#AD3B28",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
