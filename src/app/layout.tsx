import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa/PwaRuntime";
import "./visual-system.css";

export const metadata: Metadata = {
  title: "Story Card Studio - 本地优先的长篇创作工作台",
  description: "从角色卡与世界书到规划、正文和连续性管理的一体化中文创作工作台。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Story Studio" },
};

export const viewport: Viewport = { themeColor: "#294A97", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body><PwaRuntime>{children}</PwaRuntime></body>
    </html>
  );
}
