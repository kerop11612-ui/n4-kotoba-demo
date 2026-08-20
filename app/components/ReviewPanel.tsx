import styles from "../demo.module.css";
import { createClozeSentence } from "../../src/spaced-repetition/cloze";
import { getKanaHint } from "../../src/spaced-repetition/kana-hint";
import type { HintLevel, ReviewFormat, ReviewRating } from "../../src/spaced-repetition/types";
import { estimateReviewMinutes } from "../../src/spaced-repetition/study-session";
import type { ReviewSessionSummary } from "../hooks/useReviewSession";
import { AudioIcon, renderRuby, type AudioStep, type DemoWord } from "./vocabulary";
import { ReviewRatingButtons } from "./ReviewRatingButtons";

type ReviewPanelProps = {
  reviewWords: DemoWord[];
  reviewIndex: number;
  reviewComplete: boolean;
  reviewFormat: ReviewFormat;
  reviewRevealed: boolean;
  reviewHintLevel: HintLevel;
  clozeAnswer: string;
  clozeAnswerAttempts: number;
  clozeAnswerCorrect: boolean | null;
  isSubmitting: boolean;
  reviewSummary: ReviewSessionSummary;
  showMeaning: boolean;
  showExample: boolean;
  showExampleTranslation: boolean;
  onStopReview: () => void;
  onPlayOne: (step: AudioStep) => void;
  onSetHintLevel: (level: HintLevel) => void;
  onSetRevealed: (revealed: boolean) => void;
  onSetClozeAnswer: (answer: string) => void;
  onCheckClozeAnswer: () => void;
  onRate: (rating: ReviewRating) => void;
  exitLabel?: string;
  completionLabel?: string;
};

export function ReviewPanel({
  reviewWords,
  reviewIndex,
  reviewComplete,
  reviewFormat,
  reviewRevealed,
  reviewHintLevel,
  clozeAnswer,
  clozeAnswerAttempts,
  clozeAnswerCorrect,
  isSubmitting,
  reviewSummary,
  showMeaning,
  showExample,
  showExampleTranslation,
  onStopReview,
  onPlayOne,
  onSetHintLevel,
  onSetRevealed,
  onSetClozeAnswer,
  onCheckClozeAnswer,
  onRate,
  exitLabel = "暫停",
  completionLabel = "回到單字列表",
}: ReviewPanelProps) {
  const reviewWord = reviewWords[reviewIndex];
  if (!reviewWord) return null;
  const cloze = createClozeSentence(reviewWord.example, [reviewWord.word, reviewWord.reading]);
  const isCloze = reviewFormat === "cloze";
  const isClozeFallback = isCloze && !cloze.replaced;
  const clozeFinished = isCloze && (clozeAnswerCorrect === true || clozeAnswerAttempts >= 2);
  const answerVisible = isCloze
    ? clozeFinished
    : reviewRevealed || (reviewFormat === "zh-to-jp" ? reviewHintLevel === 4 : reviewHintLevel === 3);
  const remainingItems = reviewComplete ? 0 : Math.max(0, reviewWords.length - reviewIndex);
  const estimatedMinutes = estimateReviewMinutes(remainingItems);
  const completionRate = reviewSummary.completed
    ? Math.round((reviewSummary.correct / reviewSummary.completed) * 100)
    : 0;
  const nextReviewLabel = reviewSummary.nextReviewAt
    ? new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(reviewSummary.nextReviewAt))
    : "待安排";
  const progressPercent = reviewComplete
    ? 100
    : reviewWords.length
      ? Math.min(100, Math.round(((reviewIndex + 1) / reviewWords.length) * 100))
      : 0;
  const successRateLabel = reviewFormat === "cloze" ? "答對率" : "自評回想率";
  const hintLabel = reviewHintLevel === 0 ? "例句提示" : reviewHintLevel === 1 ? "顯示完整例句" : "顯示答案";
  const firstKanaHint = getKanaHint(reviewWord.reading, 1) || getKanaHint(reviewWord.word, 1);
  const twoKanaHint = getKanaHint(reviewWord.reading, 2) || getKanaHint(reviewWord.word, 2);
  const hasSecondKanaHint = Boolean(twoKanaHint && twoKanaHint !== firstKanaHint);
  const wordLength = Array.from(reviewWord.word).length;
  const readingLength = Array.from(reviewWord.reading).length;
  const japaneseWord = (
    <button
      className={styles.reviewWord}
      type="button"
      disabled={!reviewWord.wordAudio}
      onClick={() => onPlayOne({
        id: `${reviewWord.id}-word`,
        label: `${reviewWord.word}・單字`,
        src: reviewWord.wordAudio,
      })}
    >
      <span lang="ja">{reviewWord.word}</span>
      <small lang="ja">{reviewWord.reading}</small>
    </button>
  );

  return (
    <section
      className={styles.reviewCard}
      aria-label={reviewFormat === "jp-to-zh" ? "日文到中文複習" : reviewFormat === "zh-to-jp" ? "中文到日文複習" : "例句填空複習"}
    >
      <div className={styles.reviewSessionBar}>
        <button className={styles.reviewExitButton} type="button" onClick={onStopReview}>
          <span aria-hidden="true">←</span> {reviewComplete ? completionLabel : exitLabel}
        </button>
        <div className={styles.reviewProgressSummary}>
          <div>
            <span>{reviewFormat === "jp-to-zh" ? "日文 → 中文" : reviewFormat === "zh-to-jp" ? "中文 → 日文" : "例句填空"}</span>
            <strong>{reviewIndex + 1} / {reviewWords.length}</strong>
          </div>
          <span
            className={styles.reviewProgressTrack}
            role="progressbar"
            aria-label="本輪複習進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <i style={{ width: `${progressPercent}%` }} />
          </span>
        </div>
        <span className={styles.reviewEstimate}>約剩 {estimatedMinutes} 分鐘</span>
      </div>
      {reviewComplete || reviewIndex >= reviewWords.length ? (
        <div className={styles.reviewComplete}>
          <strong>本輪複習完成</strong>
          <span>已完成 {reviewWords.length} 個單字</span>
          <div className={styles.reviewCompleteStats} aria-label="本輪複習摘要">
            <div><span>{successRateLabel}</span><strong>{completionRate}%</strong></div>
            <div>
              <span>使用提示</span>
              <strong>{reviewSummary.hinted} 題</strong>
              <small>查看答案 {reviewSummary.revealed} 題</small>
            </div>
            <div><span>需要再看</span><strong>{reviewSummary.retryWordIds.length} 題</strong></div>
            <div><span>下次複習</span><strong>{nextReviewLabel}</strong></div>
          </div>
          <p className={styles.reviewCompleteNote}>
            {reviewSummary.retryWordIds.length
              ? reviewSummary.hinted
                ? "有些單字使用了手動提示、查看答案或選了再來一次，稍後再看一次會更穩固。"
                : "你沒有使用手動提示；查看答案或選了再來一次的單字，稍後再看一次會更穩固。"
              : "這輪回想很穩定，保持每天短時間複習。"}
          </p>
          <button type="button" onClick={onStopReview}>{completionLabel}</button>
        </div>
      ) : (
        <>
          <div className={styles.reviewPrompt} aria-live="polite" aria-atomic="true">
            {reviewFormat === "jp-to-zh" && japaneseWord}
            {reviewFormat === "zh-to-jp" && (
              <div className={styles.reviewPromptMeaning}>
                <strong>{reviewWord.meaningZhTw}</strong>
                <span>請回想對應的日文單字</span>
              </div>
            )}
            {isCloze && (
              <>
                <div className={styles.reviewPromptMeaning}>
                  <strong>{reviewWord.exampleZhTw}</strong>
                  <span>請根據中文提示填入例句中的日文單字</span>
                </div>
                {isClozeFallback ? (
                  <>
                    <p className={styles.reviewFallback}>此例句無法自動挖空，改用中文提示</p>
                    <div className={styles.reviewPromptMeaning}><strong>{reviewWord.meaningZhTw}</strong></div>
                  </>
                ) : (
                  <p className={styles.reviewHintSentence} lang="ja">{renderRuby(cloze.text)}</p>
                )}
                <label className={styles.reviewAnswerField}>
                  <span>輸入日文答案</span>
                  <input
                    value={clozeAnswer}
                    disabled={clozeFinished}
                    onChange={(event) => onSetClozeAnswer(event.target.value)}
                    placeholder="單字或讀音"
                    autoComplete="off"
                  />
                </label>
                <div className={styles.reviewActions}>
                  <button className={styles.reviewAnswerButton} type="button" disabled={clozeFinished || !clozeAnswer.trim()} onClick={onCheckClozeAnswer}>
                    檢查答案
                  </button>
                </div>
                {clozeAnswerCorrect === false && clozeAnswerAttempts === 1 && (
                  <p className={styles.reviewAnswerIncorrect} role="status">答案不正確，還有一次機會。</p>
                )}
                {clozeAnswerCorrect !== null && clozeAnswerAttempts >= 2 && (
                  <p className={clozeAnswerCorrect ? styles.reviewAnswerCorrect : styles.reviewAnswerIncorrect} role="status">
                    {clozeAnswerCorrect ? "答案正確" : "答案不正確，已顯示標準答案"}
                  </p>
                )}
                {clozeAnswerCorrect === false && clozeAnswerAttempts === 1 && (
                  <>
                    {reviewHintLevel >= 1 && firstKanaHint && (
                      <p className={styles.reviewHintDetail}>假名提示：<strong lang="ja">{getKanaHint(reviewWord.reading, Math.min(reviewHintLevel, 2)) || firstKanaHint}</strong></p>
                    )}
                    <div className={styles.reviewActions}>
                      {reviewHintLevel < 1 && firstKanaHint && (
                        <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(1)}>
                          顯示 1 個假名
                        </button>
                      )}
                      {reviewHintLevel < 2 && hasSecondKanaHint && (
                        <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(2)}>
                          顯示 2 個假名
                        </button>
                      )}
                      {reviewHintLevel < 3 && reviewWord.wordAudio && (
                        <button
                          className={styles.reviewHintButton}
                          type="button"
                          onClick={() => {
                            onSetHintLevel(3);
                            onPlayOne({ id: `${reviewWord.id}-word-hint`, label: `${reviewWord.word}・提示音檔`, src: reviewWord.wordAudio });
                          }}
                        >
                          播放音檔提示
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            {reviewFormat === "jp-to-zh" && !answerVisible && (
              <div className={styles.reviewActions}>
                {reviewHintLevel < 2 && (
                  <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(reviewHintLevel === 0 && cloze.replaced ? 1 : 2)}>
                    {hintLabel}
                  </button>
                )}
                <button className={styles.reviewAnswerButton} type="button" onClick={() => { onSetHintLevel(3); onSetRevealed(true); }}>
                  顯示答案
                </button>
              </div>
            )}
            {reviewFormat === "zh-to-jp" && !answerVisible && (
              <>
                {reviewHintLevel >= 1 && (
                  <p className={styles.reviewHintDetail}>答案長度：{wordLength} 字／讀音 {readingLength} 個假名</p>
                )}
                {reviewHintLevel >= 2 && firstKanaHint && (
                  <p className={styles.reviewHintDetail}>假名提示：<strong lang="ja">{firstKanaHint}</strong></p>
                )}
                {reviewHintLevel >= 3 && hasSecondKanaHint && (
                  <p className={styles.reviewHintDetail}>再多一個假名：<strong lang="ja">{twoKanaHint}</strong></p>
                )}
                <div className={styles.reviewActions}>
                  {reviewHintLevel < 1 && (
                    <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(1)}>
                      提示字數
                    </button>
                  )}
                  {reviewHintLevel < 2 && firstKanaHint && (
                    <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(2)}>
                      顯示 1 個假名
                    </button>
                  )}
                  {reviewHintLevel < 3 && hasSecondKanaHint && (
                    <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(3)}>
                      顯示 2 個假名
                    </button>
                  )}
                  {reviewHintLevel < 3 && reviewWord.wordAudio && (
                    <button
                      className={styles.reviewHintButton}
                      type="button"
                      onClick={() => {
                        onSetHintLevel(3);
                        onPlayOne({ id: `${reviewWord.id}-word-hint`, label: `${reviewWord.word}・提示音檔`, src: reviewWord.wordAudio });
                      }}
                    >
                      播放音檔提示
                    </button>
                  )}
                  <button className={styles.reviewAnswerButton} type="button" onClick={() => { onSetHintLevel(4); onSetRevealed(true); }}>
                    顯示答案
                  </button>
                </div>
              </>
            )}
          </div>
          {answerVisible && (
            <div className={styles.reviewAnswer}>
              {reviewFormat !== "jp-to-zh" && japaneseWord}
              {showMeaning && reviewFormat !== "zh-to-jp" && <strong>{reviewWord.meaningZhTw}</strong>}
              {showExample && (
                <div className={styles.reviewExample}>
                  <p lang="ja">{renderRuby(reviewWord.example)}</p>
                  {showExampleTranslation && <p>{reviewWord.exampleZhTw}</p>}
                  <button type="button" onClick={() => onPlayOne({ id: `${reviewWord.id}-sentence`, label: `${reviewWord.word}・例句`, src: reviewWord.sentenceAudio })}>
                    <AudioIcon /> 播放例句
                  </button>
                </div>
              )}
              <p className={styles.reviewHintUsed}>
                {isCloze
                  ? `本次填空嘗試 ${clozeAnswerAttempts} 次，答案${clozeAnswerCorrect ? "正確" : "未答對"}${reviewHintLevel === 0 ? "，未使用額外提示" : reviewHintLevel === 1 ? "，使用 1 個假名提示" : reviewHintLevel === 2 ? "，使用 2 個假名提示" : "，使用音檔提示"}`
                  : reviewFormat === "zh-to-jp"
                    ? reviewHintLevel === 0 ? "本次未使用提示" : reviewHintLevel === 1 ? "本次使用：字數提示" : reviewHintLevel === 2 ? "本次使用：1 個假名提示" : reviewHintLevel === 3 ? "本次使用：2 個假名或音檔提示" : "本次已查看完整答案"
                  : reviewHintLevel === 3
                    ? "本次已查看中文答案，請依實際回想程度評分"
                    : reviewHintLevel === 2 ? "本次使用：完整日文例句提示" : reviewHintLevel === 1 ? "本次使用：挖空例句提示" : "本次未使用提示"}
              </p>
              <ReviewRatingButtons disabled={isSubmitting} onRate={onRate} />
            </div>
          )}
          <div className={styles.reviewShortcutGuide} aria-label="鍵盤快捷鍵">
            {!answerVisible && !isCloze && <span><kbd>Space</kbd> 顯示答案</span>}
            {!answerVisible && reviewFormat === "jp-to-zh" && <span><kbd>H</kbd> 顯示提示</span>}
            {answerVisible && <span><kbd>1–4</kbd> 快速評分</span>}
          </div>
        </>
      )}
    </section>
  );
}
