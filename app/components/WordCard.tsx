import { useState } from "react";
import styles from "../demo.module.css";
import { calculateMasterySnapshot, getMasteryLabel } from "../../src/spaced-repetition/mastery";
import type { MasterySnapshot } from "../../src/spaced-repetition/mastery";
import type { WordMemoryRecord } from "../../src/spaced-repetition/types";
import { AudioIcon, StarIcon, type AudioStep, renderRuby, type DemoWord } from "./vocabulary";

type WordCardProps = {
  word: DemoWord;
  wordIndex: number;
  memory?: WordMemoryRecord;
  currentAudioId?: string;
  isPlaylist: boolean;
  showMeaning: boolean;
  showReading: boolean;
  showExample: boolean;
  showExampleTranslation: boolean;
  blurTranslations: boolean;
  isFavorite: boolean;
  isExampleExpanded: boolean;
  onPlayVisible: (index: number) => void;
  onPlayOne: (step: AudioStep) => void;
  onToggleFavorite: () => void;
  onToggleExample: () => void;
};

export function WordCard({
  word,
  wordIndex,
  memory,
  currentAudioId,
  isPlaylist,
  showMeaning,
  showReading,
  showExample,
  showExampleTranslation,
  blurTranslations,
  isFavorite,
  isExampleExpanded,
  onPlayVisible,
  onPlayOne,
  onToggleFavorite,
  onToggleExample,
}: WordCardProps) {
  const masterySnapshot: MasterySnapshot = calculateMasterySnapshot(memory);
  const masteryLabel = getMasteryLabel(masterySnapshot.masteryPercent, masterySnapshot.reviewCount);
  const masteryText = masterySnapshot.reviewCount < 3 ? masteryLabel : `${masterySnapshot.masteryPercent}%`;
  const wordStepId = `${word.id}-word`;
  const sentenceStepId = `${word.id}-sentence`;
  const isExampleLong = word.example.length > 28 || word.exampleZhTw.length > 22;
  const [translationRevealed, setTranslationRevealed] = useState(false);
  const translationHidden = blurTranslations && !translationRevealed;
  const translationClassName = translationHidden ? styles.translationHidden : "";

  return (
    <article
      className={`${styles.card} ${!showReading ? styles.cardWithoutReading : ""} ${currentAudioId?.startsWith(`${word.id}-`) ? styles.activeCard : ""}`}
    >
      <div className={styles.cardHeading}>
        <h2 className={styles.wordHeading} lang="ja">
          <button
            className={styles.wordPlayButton}
            type="button"
            disabled={!word.wordAudio}
            aria-label={`播放 ${word.word} 的單字音檔`}
            title={`播放 ${word.word}`}
            data-playing={currentAudioId === wordStepId}
            onClick={() => isPlaylist
              ? onPlayVisible(wordIndex)
              : onPlayOne({ id: wordStepId, label: `${word.word}・單字`, src: word.wordAudio })}
          >
            <span className={styles.wordPlayLabel}>{word.word}</span>
          </button>
        </h2>
        {showReading && <span className={styles.reading} lang="ja">{word.reading}</span>}
        <span className={styles.partOfSpeech}>{word.partOfSpeech}</span>
        <button
          className={styles.favoriteButton}
          type="button"
          aria-label={isFavorite ? `取消收藏${word.word}` : `收藏${word.word}`}
          aria-pressed={isFavorite}
          title={isFavorite ? "取消收藏" : "加入收藏"}
          onClick={onToggleFavorite}
        >
          <StarIcon filled={isFavorite} />
        </button>
      </div>

      {showMeaning ? (
        <div className={styles.meaningRow}>
          <p className={`${styles.meaning} ${translationClassName}`} aria-hidden={translationHidden}>{word.meaningZhTw}</p>
          <div className={styles.meaningMeta}>
            {blurTranslations && (
              <button
                className={styles.translationReveal}
                type="button"
                aria-pressed={!translationHidden}
                onClick={() => setTranslationRevealed((revealed) => !revealed)}
              >
                {translationHidden ? "顯示答案" : "隱藏答案"}
              </button>
            )}
            <span className={styles.wordMastery} title={`目前記憶率 ${masterySnapshot.currentRecallPercent}%`}>
              30天保持率 {masteryText}
            </span>
            <span className={styles.wordNumber}>#{String(word.number).padStart(3, "0")}</span>
          </div>
        </div>
      ) : (
        <div className={styles.wordNumberOnly}>
          <span className={styles.wordMastery} title={`目前記憶率 ${masterySnapshot.currentRecallPercent}%`}>
            30天保持率 {masteryText}
          </span>
          <span>#{String(word.number).padStart(3, "0")}</span>
        </div>
      )}

      {showExample && (
        <div className={`${styles.exampleBlock} ${isExampleExpanded ? styles.exampleExpanded : ""}`}>
          <div className={styles.exampleCopy}>
            <p className={styles.exampleJapanese} lang="ja">{renderRuby(word.example)}</p>
            {showExampleTranslation && (
              <p className={`${styles.exampleTranslation} ${translationClassName}`} aria-hidden={translationHidden}>
                {word.exampleZhTw}
              </p>
            )}
          </div>
          <div className={styles.exampleActions}>
            {isExampleLong && (
              <button className={styles.exampleMore} type="button" onClick={onToggleExample}>
                {isExampleExpanded ? "收起" : "更多"}
              </button>
            )}
            <button
              className={styles.exampleAudio}
              type="button"
              disabled={!word.sentenceAudio}
              aria-label={`播放 ${word.word} 的例句音檔`}
              title="播放例句"
              data-playing={currentAudioId === sentenceStepId}
              onClick={() => onPlayOne({ id: sentenceStepId, label: `${word.word}・例句`, src: word.sentenceAudio })}
            >
              <AudioIcon />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
