import styles from "../demo.module.css";
import { calculateMasterySnapshot, getMasteryLabel } from "../../src/spaced-repetition/mastery";
import type { MasterySnapshot } from "../../src/spaced-repetition/mastery";
import type { WordMemoryRecord } from "../../src/spaced-repetition/types";
import { AudioIcon, type AudioStep, renderRuby, type DemoWord } from "./vocabulary";

type WordCardProps = {
  word: DemoWord;
  wordIndex: number;
  memory?: WordMemoryRecord;
  currentAudioId?: string;
  isPlaylist: boolean;
  showMeaning: boolean;
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

  return (
    <article
      className={`${styles.card} ${currentAudioId?.startsWith(`${word.id}-`) ? styles.activeCard : ""}`}
      tabIndex={blurTranslations ? 0 : undefined}
    >
      <div className={styles.cardHeading}>
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
          <h2 lang="ja">{word.word}</h2>
        </button>
        <span className={styles.reading} lang="ja">{word.reading}</span>
        <span className={styles.partOfSpeech}>{word.partOfSpeech}</span>
        <button
          className={styles.favoriteButton}
          type="button"
          aria-label={isFavorite ? `取消收藏${word.word}` : `收藏${word.word}`}
          aria-pressed={isFavorite}
          title={isFavorite ? "取消收藏" : "加入收藏"}
          onClick={onToggleFavorite}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>

      {showMeaning ? (
        <div className={styles.meaningRow}>
          <p className={styles.meaning}>{word.meaningZhTw}</p>
          <div className={styles.meaningMeta}>
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
            {showExampleTranslation && <p className={styles.exampleTranslation}>{word.exampleZhTw}</p>}
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
