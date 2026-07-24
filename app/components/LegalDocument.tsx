import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

export function LegalDocument({
  eyebrow,
  title,
  summary,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly children: ReactNode;
}) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="legal-brand" href="/">
          Handmade Games
        </Link>
        <nav aria-label="Legal documents">
          <Link href="/terms-of-usage">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/third-party-notices">Notices</Link>
          <Link href="/license">MIT</Link>
        </nav>
      </header>
      <article className="legal-document">
        <header className="legal-title-block">
          <p className="legal-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="legal-summary">{summary}</p>
        </header>
        <div className="legal-body">{children}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
