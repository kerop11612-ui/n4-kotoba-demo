import styles from "../demo.module.css";
import { calculateMasterySnapshot, getLearningStatus, getMasteryLabel } from "../../src/spaced-repetition/mastery";
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
  onToggleManualMastered: (mastered: boolean) => void;
  onPlayVisible: (index: number) => void;
  onPlayOne: (step: AudioStep) => void;
  onToggleFavorite: () => void;
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
  onToggleManualMastered,
  onPlayVisible,
  onPlayOne,
  onToggleFavorite,
}: WordCardProps) {
  const masterySnapshot: MasterySnapshot = calculateMasterySnapshot(memory);
  const masteryLabel = getMasteryLabel(masterySnapshot.masteryPercent, masterySnapshot.reviewCount);
  const masteryText = masterySnapshot.reviewCount < 3 ? masteryLabel : `${masterySnapshot.masteryPercent}%`;
  const learningStatus = getLearningStatus(memory);
  const manualMastered = memory?.manualMastered === true;
  const wordStepId = `${word.id}-word`;
  const sentenceStepId = `${word.id}-sentence`;
  const translationHidden = blurTranslations;
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
        <button
          className={`${styles.manualMasteryButton} ${manualMastered ? styles.manualMasteryButtonActive : ""}`}
          type="button"
          aria-pressed={manualMastered}
          onClick={() => onToggleManualMastered(!manualMastered)}
        >
          {manualMastered ? "已學會" : "標記已學會"}
        </button>
      </div>

      {showMeaning ? (
        <div className={styles.meaningRow}>
          <div className={styles.translationRevealZone} tabIndex={blurTranslations ? 0 : undefined}>
            <p className={`${styles.meaning} ${translationClassName}`}>{word.meaningZhTw}</p>
          </div>
          <div className={styles.meaningMeta}>
            <span className={styles.wordStatus} data-status={learningStatus}>{learningStatus}</span>
            <span className={styles.wordMastery} title={`目前記憶率 ${masterySnapshot.currentRecallPercent}%`}>
              30天保持率 {masteryText}
            </span>
            <span className={styles.wordNumber}>#{String(word.number).padStart(3, "0")}</span>
          </div>
        </div>
      ) : (
        <div className={styles.wordNumberOnly}>
          <span className={styles.wordStatus} data-status={learningStatus}>{learningStatus}</span>
          <span className={styles.wordMastery} title={`目前記憶率 ${masterySnapshot.currentRecallPercent}%`}>
            30天保持率 {masteryText}
          </span>
          <span>#{String(word.number).padStart(3, "0")}</span>
        </div>
      )}

      {showExample && (
        <div className={styles.exampleBlock}>
          <div className={styles.exampleCopy}>
            <p className={styles.exampleJapanese} lang="ja">{renderRuby(word.example)}</p>
            {showExampleTranslation && (
              <div className={styles.translationRevealZone} tabIndex={blurTranslations ? 0 : undefined}>
                    <p className={`${styles.exampleTranslation} ${translationClassName}`}>
                  {word.exampleZhTw}
                </p>
              </div>
            )}
          </div>
          <div className={styles.exampleActions}>
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
