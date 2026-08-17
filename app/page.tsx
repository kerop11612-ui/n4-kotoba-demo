"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./demo.module.css";
import { AppNav } from "./components/AppNav";
import { MasterySummary } from "./components/MasterySummary";
import { ReviewPanel } from "./components/ReviewPanel";
import { WordCard } from "./components/WordCard";
import { AudioPlayer } from "./components/AudioPlayer";
import { LearningToolbar } from "./components/LearningToolbar";
import { UnitPicker } from "./components/UnitPicker";
import { LearningRecommendationCard } from "./components/LearningRecommendationCard";
import { AiChatDrawer } from "./components/AiChatDrawer";
import { AiChatFab } from "./components/AiChatFab";

import { useFavorites } from "./hooks/useFavorites";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useReviewSession } from "./hooks/useReviewSession";
import { useStudyPreferences } from "./hooks/useStudyPreferences";
import { useUnitMemory } from "./hooks/useUnitMemory";
import { useUnitSelection } from "./hooks/useUnitSelection";
import { useVocabularyIndex } from "./hooks/useVocabularyIndex";
import { useVocabularyUnit } from "./hooks/useVocabularyUnit";
import { useLearningRecommendation } from "./hooks/useLearningRecommendation";
import { useAiChat } from "./hooks/useAiChat";
import type { AiChatContext } from "../src/ai/chat";
import { calculateUnitStats, filterUnitEvidence } from "../src/spaced-repetition/unit-stats";
import { getMemoryKey } from "../src/spaced-repetition/types";
import { estimateReviewMinutes } from "../src/spaced-repetition/study-session";
import type { UnitStats } from "../src/spaced-repetition/types";
import { buildVocabularySections } from "../src/vocabulary/catalog";
import { searchVocabulary, selectUnitWords } from "../src/vocabulary/selectors";

export default function DemoPage() {
  const { items, loading: indexLoading, error: indexError } = useVocabularyIndex();
  const sections = useMemo(() => buildVocabularySections(items), [items]);
  const { selectedChapter, selectedSection, selectionReady, selectUnit: updateUnitSelection } = useUnitSelection(sections);
  const { words, loading: unitLoading, error: unitError } = useVocabularyUnit(
    selectedChapter,
    selectedSection,
    selectionReady && sections.length > 0,
  );
  const { favoriteIds: favorites, toggleFavorite, error: favoriteError } = useFavorites();
  const { preferences, setPreferences } = useStudyPreferences();
  const { showMeaning, showReading, showExample, showExampleTranslation, blurTranslations } = preferences;
  const [search, setSearch] = useState("");
  const [expandedExamples, setExpandedExamples] = useState<Set<string>>(new Set());
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);

  const [message, setMessage] = useState("正在準備 N4 單字…");
  const [statsNow, setStatsNow] = useState(() => new Date());

  const {
    repository,
    memoryRecords,
    setMemoryRecords,
    memoryReady,
    reviewHistory,
    setReviewHistory,
    reviewEvents,
    setReviewEvents,
    error: memoryError,
  } = useUnitMemory(words, selectedChapter, selectedSection, selectionReady);

  useEffect(() => {
    const timer = window.setInterval(() => setStatsNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const statusMessage = indexError
    || unitError
    || memoryError
    || favoriteError
    || (words.length && message === "正在準備 N4 單字…" ? "" : message);

  const selectedSectionData = sections.find((section) =>
    section.chapterNumber === selectedChapter && section.sectionNumber === selectedSection,
  ) ?? sections[0];

  const chapterSections = useMemo(
    () => sections.filter((section) => section.chapterNumber === selectedChapter),
    [sections, selectedChapter],
  );

  function selectUnit(chapter: number, section: number) {
    updateUnitSelection(chapter, section);
    setSearch("");
    stopReview();
  }

  const unitWords = useMemo(
    () => selectUnitWords(words, selectedChapter, selectedSection),
    [selectedChapter, selectedSection, words],
  );
  const visibleWords = useMemo(
    () => searchVocabulary(unitWords, search),
    [search, unitWords],
  );

  const {
    audioRef,
    audioSteps,
    audioIndex,
    isAudioPlaying,
    audioRate,
    playbackMode,
    repeatCount,
    currentAudio,
    currentWord,
    isPlaylist,
    setAudioRate,
    setPlaybackMode,
    setRepeatCount,
    playOne,
    playVisibleWords,
    stopAudio,
    toggleAudio,
    jumpAudio,
    handleAudioEnded,
    setIsAudioPlaying,
  } = useAudioPlayer({ words, visibleWords, onMessage: setMessage });

  const {
    reviewing,
    reviewIndex,
    reviewComplete,
    reviewFormat,
    reviewRevealed,
    reviewHintLevel,
    clozeAnswer,
    clozeAnswerAttempts,
    clozeAnswerCorrect,
    isSubmitting,
    reviewMode,
    reviewWords,
    reviewPreviewCount,
    reviewSummary,
    setReviewFormat,
    setReviewMode,
    setReviewHintLevel,
    setReviewRevealed,
    setClozeAnswer,

    stopReview,
    toggleReview,
    checkClozeAnswer,
    rateReview,
  } = useReviewSession({
    words,
    visibleWords,
    memoryRecords,
    setMemoryRecords,
    repository,
    selectedChapter,
    selectedSection,
    setReviewHistory,
    setReviewEvents,
    playOne,
    stopAudio,
    onMessage: setMessage,
  });

  const unitStats = useMemo<UnitStats>(() => {
    const wordIds = new Set(unitWords.map((word) => word.id));
    const records = filterUnitEvidence(Object.values(memoryRecords), wordIds);
    const unitHistory = filterUnitEvidence(reviewHistory, wordIds);
    const unitEvents = filterUnitEvidence(reviewEvents, wordIds);
    return calculateUnitStats(records, unitWords.length, unitHistory, statsNow, unitEvents);
  }, [memoryRecords, reviewEvents, reviewHistory, statsNow, unitWords]);

  const reviewEstimateMinutes = estimateReviewMinutes(reviewPreviewCount);
  const { recommendation, generatedAt } = useLearningRecommendation({
    scope: "unit",
    unitStats,
  });
  const chatContext = useMemo<AiChatContext>(() => ({
    scope: "unit",
    label: selectedSectionData
      ? `第 ${selectedSectionData.chapterNumber} 章・${selectedSectionData.sectionTitle}`
      : `第 ${selectedChapter} 章・第 ${selectedSection} 節`,
    unitId: `${selectedChapter}-${selectedSection}`,
    recentPeriodLabel: "最近 3 天",
    recommendation: recommendation ? {
      title: recommendation.title,
      reason: recommendation.reason,
      evidenceLabel: recommendation.evidenceLabel,
    } : undefined,
  }), [recommendation, selectedChapter, selectedSection, selectedSectionData]);
  const aiChat = useAiChat({ context: chatContext });



  function toggleExample(id: string) {
    setExpandedExamples((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }


  if (indexLoading || unitLoading || !words.length) {
    return (
      <main className={styles.loading}>
        <div className={styles.loadingMark}>N4</div>
        <p>{statusMessage}</p>
      </main>
    );
  }

  return (
    <main className={`${styles.page} ${blurTranslations ? styles.blurTranslations : ""} ${isPlaylist ? styles.audioActive : ""} ${showPlayerSettings ? styles.audioSettingsOpen : ""}`}>
      <audio
        ref={audioRef}
        className={styles.audioElement}
        onEnded={handleAudioEnded}
        onPause={() => setIsAudioPlaying(false)}
        onError={() => {
          setIsAudioPlaying(false);
          setMessage("音檔載入失敗，請確認音檔路徑。");
        }}
      />

      <header className={`${styles.topbar} ${reviewing ? styles.reviewTopbar : ""}`}>
        <AppNav active="library" />
      </header>

      <section className={`${styles.workspace} ${reviewing ? styles.reviewWorkspace : ""}`}>
        {!reviewing && (
          <>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>
                  N4・第 {selectedSectionData?.chapterNumber} 章・{selectedSectionData?.chapterTitle}
                </p>
                <h1>{selectedSectionData?.sectionTitle}</h1>
                <p className={styles.sectionProgress} aria-label="目前章節掌握進度">
                  第 {selectedSectionData?.chapterNumber} 章｜第 {selectedSectionData?.sectionNumber} 節｜{unitStats.stableWords}／{unitStats.totalWords} 個｜30 天保持率 {unitStats.masteryPercent}%
                </p>
              </div>
              <span className={styles.wordCount}>{visibleWords.length} 詞</span>
            </header>

            <UnitPicker
              sections={sections}
              chapterSections={chapterSections}
              selectedChapter={selectedChapter}
              selectedSection={selectedSection}
              onSelectUnit={selectUnit}
            />

            {unitStats && <MasterySummary stats={unitStats} />}

            {recommendation && (
              <LearningRecommendationCard
                recommendation={recommendation}
                  sourceLabel="本機規則"
                generatedAt={generatedAt}
                onStart={toggleReview}
                onAskWhy={() => aiChat.open("為什麼推薦這個？")}
              />
            )}

            <LearningToolbar
              search={search}
              onSearchChange={setSearch}
              visibleWordCount={visibleWords.length}
              totalWordCount={unitWords.length}
              hasVisibleWords={visibleWords.length > 0}
              isPlaylist={isPlaylist}
              reviewing={reviewing}
              memoryReady={memoryReady}
              reviewCount={reviewPreviewCount}
              reviewEstimateMinutes={reviewEstimateMinutes}
              reviewMode={reviewMode}
              reviewFormat={reviewFormat}
              showDisplaySettings={showDisplaySettings}
              showMeaning={showMeaning}
              showReading={showReading}
              showExample={showExample}
              showExampleTranslation={showExampleTranslation}
              blurTranslations={blurTranslations}
              exportHref={`/print?chapter=${selectedChapter}&section=${selectedSection}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              onTogglePlaylist={() => (isPlaylist ? stopAudio() : playVisibleWords())}
              onToggleReview={toggleReview}
              onReviewModeChange={setReviewMode}
              onReviewFormatChange={setReviewFormat}
              onToggleDisplaySettings={() => setShowDisplaySettings((open) => !open)}
              onToggleMeaning={() => setPreferences((current) => ({ ...current, showMeaning: !current.showMeaning }))}
              onToggleReading={() => setPreferences((current) => ({ ...current, showReading: !current.showReading }))}
              onToggleExample={() => setPreferences((current) => ({ ...current, showExample: !current.showExample }))}
              onToggleExampleTranslation={() => setPreferences((current) => ({ ...current, showExampleTranslation: !current.showExampleTranslation }))}
              onToggleBlurTranslations={() => setPreferences((current) => ({ ...current, blurTranslations: !current.blurTranslations }))}
            />
          </>
        )}

        {statusMessage && (
          <p className={styles.notice} role="status">
            {statusMessage}
          </p>
        )}

          {blurTranslations && !reviewing && (
          <p className={styles.translationHint}>
            滑鼠移入單字或例句中文翻譯區即可查看答案。
          </p>
        )}

        {reviewing ? (
          <ReviewPanel
            reviewWords={reviewWords}
            reviewIndex={reviewIndex}
            reviewComplete={reviewComplete}
            reviewFormat={reviewFormat}
            reviewRevealed={reviewRevealed}
            reviewHintLevel={reviewHintLevel}
            clozeAnswer={clozeAnswer}
            clozeAnswerAttempts={clozeAnswerAttempts}
            clozeAnswerCorrect={clozeAnswerCorrect}
            isSubmitting={isSubmitting}
            reviewSummary={reviewSummary}
            showMeaning={showMeaning}
            showExample={showExample}
            showExampleTranslation={showExampleTranslation}
            onStopReview={stopReview}
            onPlayOne={playOne}
            onSetHintLevel={setReviewHintLevel}
            onSetRevealed={setReviewRevealed}
            onSetClozeAnswer={setClozeAnswer}
            onCheckClozeAnswer={checkClozeAnswer}
            onRate={(rating) => void rateReview(rating)}
          />
        ) : <div className={styles.cardGrid}>
          {visibleWords.map((word, wordIndex) => (
            <WordCard
              key={word.id}
              word={word}
              wordIndex={wordIndex}
              memory={memoryRecords[getMemoryKey(word.id, "jp_to_meaning")]}
              currentAudioId={currentAudio?.id}
              isPlaylist={isPlaylist}
              showMeaning={showMeaning}
              showReading={showReading}
              showExample={showExample}
              showExampleTranslation={showExampleTranslation}
              blurTranslations={blurTranslations}
              isFavorite={favorites.has(word.id)}
              isExampleExpanded={expandedExamples.has(word.id)}
              onPlayVisible={playVisibleWords}
              onPlayOne={playOne}
              onToggleFavorite={() => toggleFavorite(word.id)}
              onToggleExample={() => toggleExample(word.id)}
            />
          ))}
        </div>}

        {!visibleWords.length && (
          <div className={styles.emptyState}>
            <strong>找不到符合的單字</strong>
            <button type="button" onClick={() => setSearch("")}>
              清除搜尋
            </button>
          </div>
        )}
      </section>

      <AudioPlayer
        currentAudio={currentAudio ?? null}
        currentWord={currentWord}
        isPlaylist={isPlaylist}
        audioIndex={audioIndex}
        audioLength={audioSteps.length}
        isAudioPlaying={isAudioPlaying}
        showPlayerSettings={showPlayerSettings}
        playbackMode={playbackMode}
        audioRate={audioRate}
        repeatCount={repeatCount}
        onPrevious={() => jumpAudio(-1)}
        onToggle={toggleAudio}
        onNext={() => jumpAudio(1)}
        onStop={stopAudio}
        onToggleSettings={() => setShowPlayerSettings((open) => !open)}
        onPlaybackModeChange={setPlaybackMode}
        onAudioRateChange={setAudioRate}
        onRepeatCountChange={setRepeatCount}
      />
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
