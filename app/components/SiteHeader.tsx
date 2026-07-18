import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Handmade Games — главная">
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

      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/games">Игры</Link>
        <Link href="/#about">Как делаем</Link>
      </nav>

      <span className="header-note">Built at home</span>
    </header>
  );
}
