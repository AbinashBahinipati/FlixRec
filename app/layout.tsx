import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AuthInitializer from "@/components/AuthInitializer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "FlixRec | AI Movie Recommendations",
  description: "Discover your next favorite movie or web series with AI-powered recommendations.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="antialiased min-h-screen flex flex-col">
        <AuthInitializer />
        <Navbar />
        <main className="min-h-screen pb-16 pt-16">
          {children}
        </main>
        
        <footer className="w-full py-8 text-center border-t border-white/10 bg-[#050505]">
          <p className="text-gray-500 text-sm max-w-2xl mx-auto px-4">
            This product uses the Watchmode API but is not endorsed or certified by TMDB. 
            All movie and web-series data, including images, are provided by The Movie Database.
          </p>
        </footer>
      </body>
    </html>
  );
}
