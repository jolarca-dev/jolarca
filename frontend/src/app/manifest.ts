import type { MetadataRoute } from "next";

/*
 * Web app manifest — installable PWA floor. Icons are the SVG mark
 * (src/app/icon.svg); Chromium accepts SVG icons in manifests, and we
 * ship no binary raster assets we cannot regenerate in-repo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JOL Marketplace",
    short_name: "JOL",
    description: "Baltic marketplace — Lithuania, Latvia, Estonia.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#12332a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
