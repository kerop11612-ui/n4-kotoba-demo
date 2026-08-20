import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LearningDataProvider } from "./providers/LearningDataProvider";

export const metadata: Metadata = {
  title: "N4 ことば帳 Demo",
  description: "以音訊、例句與間隔複習學習 JLPT N4 單字。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2efe7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <body><LearningDataProvider>{children}</LearningDataProvider></body>
    </html>
  );
}
