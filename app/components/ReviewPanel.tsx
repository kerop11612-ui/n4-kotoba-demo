import styles from "../demo.module.css";
import { createClozeSentence } from "../../src/spaced-repetition/cloze";
import type { HintLevel, ReviewFormat, ReviewRating } from "../../src/spaced-repetition/types";
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
  const hintLabel = reviewHintLevel === 0 ? "例句提示" : reviewHintLevel === 1 ? "顯示完整例句" : "顯示答案";
  const firstReading = Array.from(reviewWord.reading)[0] ?? Array.from(reviewWord.word)[0] ?? "";
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
      {reviewComplete || reviewIndex >= reviewWords.length ? (
        <div className={styles.reviewComplete}>
          <strong>本輪複習完成</strong>
          <span>已完成 {reviewWords.length} 個單字</span>
          <button type="button" onClick={onStopReview}>回到單字列表</button>
        </div>
      ) : (
        <>
          <div className={styles.reviewMeta}>
            <span>{reviewFormat === "jp-to-zh" ? "日文 → 中文" : reviewFormat === "zh-to-jp" ? "中文 → 日文" : "例句填空"}</span>
            <span>{reviewIndex + 1} / {reviewWords.length}</span>
          </div>
          <div className={styles.reviewPrompt}>
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
                    {reviewHintLevel >= 1 && (
                      <p className={styles.reviewHintDetail}>首個假名：<strong lang="ja">{firstReading}</strong></p>
                    )}
                    <div className={styles.reviewActions}>
                      {reviewHintLevel < 1 && (
                        <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(1)}>
                          顯示首個假名
                        </button>
                      )}
                      {reviewHintLevel < 2 && reviewWord.wordAudio && (
                        <button
                          className={styles.reviewHintButton}
                          type="button"
                          onClick={() => {
                            onSetHintLevel(2);
                            onPlayOne({ id: `${reviewWord.id}-word-hint`, label: `${reviewWord.word}・提示音檔`, src: reviewWord.wordAudio });
                          }}
                        >
                          再聽一次單字
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
                {reviewHintLevel >= 2 && (
                  <p className={styles.reviewHintDetail}>首個假名：<strong lang="ja">{firstReading}</strong></p>
                )}
                <div className={styles.reviewActions}>
                  {reviewHintLevel < 1 && (
                    <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(1)}>
                      提示字數
                    </button>
                  )}
                  {reviewHintLevel < 2 && (
                    <button className={styles.reviewHintButton} type="button" onClick={() => onSetHintLevel(2)}>
                      顯示首個假名
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
                  ? `本次填空嘗試 ${clozeAnswerAttempts} 次，答案${clozeAnswerCorrect ? "正確" : "未答對"}${reviewHintLevel === 0 ? "，未使用額外提示" : reviewHintLevel === 1 ? "，使用首個假名提示" : "，使用首個假名與音檔提示"}`
                  : reviewFormat === "zh-to-jp"
                    ? reviewHintLevel === 0 ? "本次未使用提示" : reviewHintLevel === 1 ? "本次使用：字數提示" : reviewHintLevel === 2 ? "本次使用：首個假名提示" : reviewHintLevel === 3 ? "本次使用：音檔提示" : "本次已查看完整答案"
                  : reviewHintLevel === 3
                    ? "本次已查看中文答案，請依實際回想程度評分"
                    : reviewHintLevel === 2 ? "本次使用：完整日文例句提示" : reviewHintLevel === 1 ? "本次使用：挖空例句提示" : "本次未使用提示"}
              </p>
              <ReviewRatingButtons disabled={isSubmitting} onRate={onRate} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
