"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./home.module.css";

type VocabularyItem = {
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
};

type ChapterView = {
  number: number;
  title: string;
  words: number;
  sections: { number: number; title: string }[];
};

export default function DemoHomePage() {
  const [words, setWords] = useState<VocabularyItem[]>([]);

  useEffect(() => {
    fetch("/vocabulary-n4.json")
      .then((response) => response.json() as Promise<VocabularyItem[]>)
      .then(setWords)
      .catch(() => setWords([]));
  }, []);

  const chapters = useMemo<ChapterView[]>(() => {
    const map = new Map<number, ChapterView>();
    for (const word of words) {
      const chapter = map.get(word.chapterNumber) ?? {
        number: word.chapterNumber,
        title: word.chapterTitle,
        words: 0,
        sections: [],
      };
      chapter.words += 1;
      if (!chapter.sections.some((section) => section.number === word.sectionNumber)) {
        chapter.sections.push({ number: word.sectionNumber, title: word.sectionTitle });
      }
      map.set(word.chapterNumber, chapter);
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [words]);

  const firstSection = chapters[0]?.sections[0];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>KOTOBA NOTE</p>
          <h1>學習首頁</h1>
        </div>
        <span className={styles.badge}>N4 HOME</span>
      </header>

      <section className={styles.continueCard}>
        <div>
          <p className={styles.eyebrow}>開始學習</p>
          <h2>{firstSection ? `第 1 章・${firstSection.title}` : "N4 單字庫"}</h2>
          <p>{words.length ? `已整理 ${words.length} 個 N4 單字，從章節選擇學習內容。` : "正在載入單字庫…"}</p>
        </div>
        <Link className={styles.primaryButton} href={firstSection ? "/?chapter=1&section=1" : "/units"}>開啟單字庫</Link>
      </section>

      <section className={styles.stats} aria-label="單字庫統計">
        {[
          ["N4 單字", words.length ? String(words.length) : "—"],
          ["章節", chapters.length ? String(chapters.length) : "—"],
          ["單元", chapters.length ? String(chapters.reduce((total, chapter) => total + chapter.sections.length, 0)) : "—"],
          ["音訊", words.length ? "已連結" : "—"],
        ].map(([label, value]) => (
          <article className={styles.statCard} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>資料庫內容</small>
          </article>
        ))}
      </section>

      <section className={styles.actions}>
        <Link className={styles.actionPrimary} href="/?chapter=1&section=1">開始學習</Link>
        <Link className={styles.actionSecondary} href="/units">瀏覽全部章節</Link>
        <Link className={styles.actionSecondary} href="/">搜尋單字</Link>
      </section>

      <section className={styles.chapterSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>學習地圖</p>
            <h2>章節與單字庫</h2>
          </div>
          <Link href="/units">查看全部單元 →</Link>
        </div>
        <div className={styles.chapterList}>
          {chapters.map((chapter) => {
            const section = chapter.sections[0];
            return (
              <Link className={styles.chapterRow} href={`/?chapter=${chapter.number}&section=${section?.number ?? 1}`} key={chapter.number}>
                <span className={styles.chapterNumber}>{String(chapter.number).padStart(2, "0")}</span>
                <strong>第 {chapter.number} 章・{chapter.title}</strong>
                <span className={styles.chapterProgress}>{chapter.words} 詞・{chapter.sections.length} 節</span>
                <span className={styles.progressTrack}><i /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.recent}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>使用方式</p>
            <h2>先選章節，再進入單字庫</h2>
          </div>
        </div>
        <div className={styles.emptyState}>每個單元都有單字、假名、中文意思、例句與單字／例句音訊。</div>
      </section>
    </main>
  );
}
