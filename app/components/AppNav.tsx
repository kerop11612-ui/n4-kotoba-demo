import Link from "next/link";
import styles from "./AppNav.module.css";

export type AppNavItem = "home" | "library" | "favorites";

type AppNavProps = {
  active: AppNavItem;
};

const items: Array<{ href: string; key: AppNavItem; label: string }> = [
  { href: "/home", key: "home", label: "首頁" },
  { href: "/", key: "library", label: "單字庫" },
  { href: "/favorites", key: "favorites", label: "收藏" },
];

export function AppNav({ active }: AppNavProps) {
  return (
    <nav className={styles.nav} aria-label="主要導覽">
      <Link className={styles.brand} href="/">
        <span className={styles.brandMark}>N4</span>
        <span className={styles.brandText}>
          <strong>N4 ことば帳</strong>
          <small>Audio Vocabulary</small>
        </span>
      </Link>
      <div className={styles.links}>
        {items.map((item) => (
          <Link
            className={item.key === active ? `${styles.link} ${styles.active}` : styles.link}
            href={item.href}
            key={item.key}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
