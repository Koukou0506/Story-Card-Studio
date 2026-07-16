import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Story Card Studio 长篇创作工作台",
    short_name: "Story Studio",
    description: "本地优先的角色、世界书、规划、正文与连续性创作工作台。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FCFCF1",
    theme_color: "#294A97",
    lang: "zh-CN",
    categories: ["productivity", "writing"],
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
      { src: "/icons/icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

