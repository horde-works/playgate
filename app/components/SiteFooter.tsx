"use client";

import Link from "next/link";
import { useLanguage } from "../i18n/LanguageProvider";

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer">
      <div className="site-footer-identity">
        <p>Handmade Games</p>
        <p>{t("footer.place")}</p>
      </div>
      <nav className="site-footer-links" aria-label="Legal information">
        <Link href="/terms-of-usage">Terms of Usage</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/third-party-notices">Third-Party Notices</Link>
        <Link href="/license">Source code: MIT License</Link>
      </nav>
    </footer>
  );
}
