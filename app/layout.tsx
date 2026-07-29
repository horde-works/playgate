import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConsentGate } from "./components/ConsentGate";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { TERMS_ACCEPTANCE_STORAGE_KEY, TERMS_VERSION } from "./legal/consent";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Согласие с условиями лежит в localStorage, а сайт выкладывается
          статикой: в собранном HTML согласия нет, и React обязан на время
          гидрации держаться серверного снимка. Скрипт блокирующий и живёт в
          head, поэтому ставит метку до первой отрисовки, не нарушая порядок
          документа при гидрации.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(TERMS_ACCEPTANCE_STORAGE_KEY)})||"null");if(v&&v.version===${JSON.stringify(TERMS_VERSION)}){document.documentElement.dataset.terms="accepted";}}catch(e){}})();`,
          }}
        />
      </head>
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
