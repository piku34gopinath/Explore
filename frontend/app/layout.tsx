import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClipAI - AI Video Clipper",
  description: "Generate YouTube Shorts from long videos with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Navbar />
        <main className="container mx-auto py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
