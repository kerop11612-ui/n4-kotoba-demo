"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./units.module.css";
import { AppNav } from "../components/AppNav";
import { buildVocabularyChapters } from "../../src/vocabulary/catalog";
import { useVocabularyIndex } from "../hooks/useVocabularyIndex";

export default function UnitsDemoPage() {
  const { items, totalWords, loading, error } = useVocabularyIndex();
  const [activeChapter, setActiveChapter] = useState(1);
  const [activeSection, setActiveSection] = useState(1);
  const [query, setQuery] = useState("");
  const message = error || (loading ? "正在載入 N4 章節…" : "");

  const chapters = useMemo(() => buildVocabularyChapters(items), [items]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChapters = useMemo(() => {
    if (!normalizedQuery) return chapters;
    return chapters.filter((chapter) =>
      String(chapter.number).includes(normalizedQuery) ||
      chapter.title.toLocaleLowerCase().includes(normalizedQuery) ||
      chapter.sections.some((section) =>
        section.sectionTitle.toLocaleLowerCase().includes(normalizedQuery) ||
        `${chapter.number}-${section.sectionNumber}`.includes(normalizedQuery),
      ),
    );
  }, [chapters, normalizedQuery]);

  const orderedUnits = useMemo(
    () => chapters.flatMap((chapter) => chapter.sections.map((section) => ({ chapter: chapter.number, section: section.sectionNumber }))),
    [chapters],
  );
  const activeUnitIndex = orderedUnits.findIndex(
    (unit) => unit.chapter === activeChapter && unit.section === activeSection,
  );

  function selectSection(chapter: number, section: number) {
    setActiveChapter(chapter);
    setActiveSection(section);
  }

  function moveSection(direction: -1 | 1) {
    const next = orderedUnits[activeUnitIndex + direction];
    if (next) selectSection(next.chapter, next.section);
  }

  if (!items.length) {
    return (
      <main className={styles.page}>
        <header className={styles.topbar}>
          <AppNav active="library" />
        </header>
        <div className={styles.emptyState}>{message}</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <AppNav active="library" />
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>N4 單字庫</p>
        <h1>章節與單字庫</h1>
        <p>依教材章節整理 {totalWords} 個單字，選擇單元後直接開啟學習卡片。</p>
      </section>

      <nav className={styles.controls} aria-label="單字庫導覽控制">
        <label className={styles.search}>
          <span>搜尋章節或主題</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：時間、旅行、2-3" />
        </label>
        <div className={styles.current}>
          <span>目前單元</span>
          <strong>{activeUnitIndex >= 0 ? `${activeChapter}-${activeSection}` : "—"}</strong>
        </div>
        <button type="button" onClick={() => moveSection(-1)} disabled={activeUnitIndex <= 0}>‹ 上一節</button>
        <button type="button" onClick={() => moveSection(1)} disabled={activeUnitIndex < 0 || activeUnitIndex >= orderedUnits.length - 1}>下一節 ›</button>
      </nav>

      <section className={styles.chapterList} aria-label="N4 章節列表">
        {visibleChapters.map((chapter) => {
          const isOpen = activeChapter === chapter.number;
          return (
            <article className={isOpen ? `${styles.chapter} ${styles.chapterActive}` : styles.chapter} key={chapter.number}>
              <button className={styles.chapterHeader} type="button" aria-expanded={isOpen} onClick={() => selectSection(chapter.number, chapter.sections[0]?.sectionNumber ?? 1)}>
                <span className={styles.chapterNumber}>{String(chapter.number).padStart(2, "0")}</span>
                <span className={styles.chapterTitle}>第 {chapter.number} 章・{chapter.title}</span>
                <span className={styles.chapterMeta}>{chapter.sections.length} 節・{chapter.words} 詞</span>
                <span className={styles.chevron}>{isOpen ? "⌃" : "⌄"}</span>
              </button>
              {isOpen && (
                <div className={styles.sectionGrid}>
                  {chapter.sections.map((section) => {
                    const selected = activeSection === section.sectionNumber;
                    return (
                      <Link
                        className={selected ? `${styles.sectionButton} ${styles.sectionSelected}` : styles.sectionButton}
                        href={`/?chapter=${chapter.number}&section=${section.sectionNumber}`}
                        key={section.sectionNumber}
                        aria-current={selected ? "page" : undefined}
                        onClick={() => selectSection(chapter.number, section.sectionNumber)}
                      >
                        <span className={styles.sectionNumber}>節 {String(section.sectionNumber).padStart(2, "0")}</span>
                        <strong>{section.sectionTitle}</strong>
                        <small>{section.wordCount} 個單字・開啟單字庫 →</small>
                      </Link>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {!visibleChapters.length && <div className={styles.emptyState}>找不到符合的章節，請換個關鍵字。</div>}
    </main>
  );
}
