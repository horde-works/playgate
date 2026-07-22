"use client";

import Link from "next/link";
import { useLanguage } from "../i18n/LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const { t } = useLanguage();
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label={t("header.brandAria")}>
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          Handmade
          <small>Games</small>
        </span>
      </Link>

      <nav className="site-nav" aria-label={t("nav.games")}>
        <Link href="/games">{t("nav.games")}</Link>
        <Link href="/#about">{t("nav.about")}</Link>
      </nav>

      <div className="site-header-end">
        <span className="header-note">{t("header.note")}</span>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
