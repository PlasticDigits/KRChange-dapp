import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/nav/TopNav";
import SteelTexture from "@/components/brand/SteelTexture";
import CustomCursor from "@/components/cursor/CustomCursor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KRChange DEX",
  description: "KRChange DeFi DEX on KasPlex",
};

export const dynamic = "force-static";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-app-gradient bg-grid-dot min-h-screen relative`}
      >
        <CustomCursor />
        <SteelTexture />
        <div className="relative z-10">
          <TopNav />
        </div>
        <main className="container-padded py-6 relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
