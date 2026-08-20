"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./home.module.css";
import { MemoryDataControls } from "./MemoryDataControls";
import { AppNav } from "../components/AppNav";
import { LearningRecommendationCard } from "../components/LearningRecommendationCard";
import { AiChatDrawer } from "../components/AiChatDrawer";
import { AiChatFab } from "../components/AiChatFab";
import { useLearningRecommendation } from "../hooks/useLearningRecommendation";
import { useAiChat } from "../hooks/useAiChat";
import type { AiChatContext } from "../../src/ai/chat";
import { useLearningData } from "../hooks/useLearningData";
import { buildStudyOverview, type StudyOverview } from "../../src/spaced-repetition/study-session";
import { buildVocabularyChapters } from "../../src/vocabulary/catalog";
import { useVocabularyIndex } from "../hooks/useVocabularyIndex";

export default function DemoHomePage() {
  const { items, totalWords, loading, error: loadError } = useVocabularyIndex();
  const [overview, setOverview] = useState<StudyOverview | null>(null);
  const { repository } = useLearningData();
  const [memoryRevision, setMemoryRevision] = useState(0);

  const chapters = useMemo(() => buildVocabularyChapters(items), [items]);

  useEffect(() => {
    if (!chapters.length) return;
    let cancelled = false;

    void (async () => {
      try {
        await repository.migrate();
        const data = await repository.exportData();
        const nextOverview = buildStudyOverview(Object.values(data.memories), items, chapters, undefined, totalWords);
        if (!cancelled) {
          setOverview(nextOverview);
        }
      } catch {
        if (!cancelled) {
          setOverview(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapters, items, memoryRevision, repository, totalWords]);

  const dashboard = overview?.dashboard ?? null;
  const chapterProgress = overview?.chapterProgress ?? {};
  const recommendedHref = overview?.recommendedUnit
    ? `/?chapter=${overview.recommendedUnit.chapter}&section=${overview.recommendedUnit.section}`
    : "/units";

  const firstChapter = chapters[0];
  const firstSection = firstChapter?.sections[0];
  const firstSectionHref = firstChapter && firstSection
    ? `/?chapter=${firstChapter.number}&section=${firstSection.sectionNumber}`
    : "/units";
  const studyHref = dashboard?.reviewedWords ? recommendedHref : firstSectionHref;
  const { recommendation, generatedAt } = useLearningRecommendation({
    scope: "home",
    overview,
  });
  const chatContext = useMemo<AiChatContext>(() => ({
    scope: "home",
    label: "全部 N4 單字",
    recentPeriodLabel: "最近 3 天",
    recommendation: recommendation ? {
      title: recommendation.title,
      reason: recommendation.reason,
      evidenceLabel: recommendation.evidenceLabel,
    } : undefined,
  }), [recommendation]);
  const aiChat = useAiChat({ context: chatContext });

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <AppNav active="home" />
      </header>

      <section className={styles.continueCard}>
        <div>
          <p className={styles.eyebrow}>今日學習</p>
          <h2>{dashboard ? `${dashboard.estimatedMinutes} 分鐘專注複習` : "建立今日學習計畫"}</h2>
          <p>
            {loading
              ? "正在載入單字庫…"
              : loadError || (dashboard
                ? `${dashboard.dueToday} 個到期・${dashboard.needsPracticeWords} 個待加強・建議 ${dashboard.suggestedNewWords} 個新字`
                : `已整理 ${totalWords} 個 N4 單字，準備開始第一個單元。`)}
          </p>
        </div>
        <Link className={styles.primaryButton} href={studyHref}>開始今日學習</Link>
      </section>

      {recommendation && (
        <LearningRecommendationCard
          recommendation={recommendation}
          sourceLabel="本機規則"
          generatedAt={generatedAt}
          onStart={() => window.location.assign(studyHref)}
          onAskWhy={() => aiChat.open("為什麼推薦這個？")}
        />
      )}

      <section className={styles.stats} aria-label="單字庫統計">
        {[
          ["今日到期", dashboard ? String(dashboard.dueToday) : "—", "先處理最該複習的字"],
          ["待加強", dashboard ? String(dashboard.needsPracticeWords) : "—", dashboard ? `其中 ${dashboard.weakWords} 個弱項` : "包含新字與學習中"],
          ["新字", dashboard ? String(dashboard.newWords) : "—", dashboard ? `今日建議 ${dashboard.suggestedNewWords} 個` : "尚未建立學習紀錄"],
          ["手動已學會", dashboard ? String(dashboard.manualMasteredWords) : "—", "可隨時取消並重新加入練習"],
          ["已學單字", dashboard ? String(dashboard.reviewedWords) : "—", `共 ${totalWords || "—"} 個 N4 單字`],
          ["預估時間", dashboard ? `${dashboard.estimatedMinutes} 分` : "—", "以每題約 15 秒估算"],
        ].map(([label, value, detail]) => (
          <article className={styles.statCard} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className={styles.actions}>
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
            const progress = chapterProgress[chapter.number];
            return (
              <Link className={styles.chapterRow} href={`/?chapter=${chapter.number}&section=${section?.sectionNumber ?? 1}`} key={chapter.number}>
                <span className={styles.chapterNumber}>{String(chapter.number).padStart(2, "0")}</span>
                <strong>第 {chapter.number} 章・{chapter.title}</strong>
                <span className={styles.chapterProgress}>{chapter.words} 詞・{chapter.sections.length} 節・{progress === undefined ? "進度載入中" : `${progress}% 已學習`}</span>
                <span
                  className={styles.progressTrack}
                  role="progressbar"
                  aria-label={`第 ${chapter.number} 章學習進度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? 0}
                ><i style={{ width: `${progress ?? 0}%` }} /></span>
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

      <MemoryDataControls repository={repository} onChanged={() => setMemoryRevision((revision) => revision + 1)} />
      {!aiChat.isOpen && <AiChatFab onOpen={() => aiChat.open()} />}
      <AiChatDrawer
        open={aiChat.isOpen}
        context={chatContext}
        messages={aiChat.messages}
        draft={aiChat.draft}
        status={aiChat.status}
        error={aiChat.error}
        onDraftChange={aiChat.setDraft}
        onSend={aiChat.send}
        onStop={aiChat.stop}
        onRetry={aiChat.retry}
        onClear={aiChat.clear}
        onClose={aiChat.close}
      />
    </main>
  );
}
