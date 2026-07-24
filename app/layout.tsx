import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConsentGate } from "./components/ConsentGate";
import { LanguageProvider } from "./i18n/LanguageProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Handmade Games",
    template: "%s · Handmade Games",
  },
  description:
    "Домашняя игровая лаборатория. Первая игра — Make a Mess.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider>
          <ConsentGate>{children}</ConsentGate>
        </LanguageProvider>
      </body>
    </html>
  );
}
