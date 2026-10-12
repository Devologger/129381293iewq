import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "../public/fonts/Geist-Variable.woff2",
  display: "swap",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../public/fonts/GeistMono-Variable.woff2",
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Penguin",
    template: "%s · Penguin",
  },
  description:
    "A standalone multi-market trading, strategy research, and Obsidian knowledge workspace.",
  applicationName:
    "Penguin",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0c0f11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--cmr-bg)]">
        {children}
      </body>
    </html>
  );
}
