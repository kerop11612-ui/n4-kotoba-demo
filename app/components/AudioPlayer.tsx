import styles from "../demo.module.css";
import { renderRuby, type AudioStep, type DemoWord } from "./vocabulary";

export type PlaybackMode = "word" | "sentence" | "both";

type AudioPlayerProps = {
  currentAudio: AudioStep | null;
  currentWord: DemoWord | undefined;
  isPlaylist: boolean;
  audioIndex: number;
  audioLength: number;
  isAudioPlaying: boolean;
  showPlayerSettings: boolean;
  playbackMode: PlaybackMode;
  audioRate: number;
  repeatCount: 1 | 2 | 3;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onStop: () => void;
  onToggleSettings: () => void;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  onAudioRateChange: (rate: number) => void;
  onRepeatCountChange: (count: 1 | 2 | 3) => void;
};

export function AudioPlayer({
  currentAudio,
  currentWord,
  isPlaylist,
  audioIndex,
  audioLength,
  isAudioPlaying,
  showPlayerSettings,
  playbackMode,
  audioRate,
  repeatCount,
  onPrevious,
  onToggle,
  onNext,
  onStop,
  onToggleSettings,
  onPlaybackModeChange,
  onAudioRateChange,
  onRepeatCountChange,
}: AudioPlayerProps) {
  if (!currentAudio || !isPlaylist) return null;

  return (
    <aside className={styles.nowPlaying} aria-label="連續播放控制">
      <div className={styles.playerInfo} aria-live="polite" aria-atomic="true">
        <small>連續播放</small>
        <strong lang="ja">{currentWord?.word ?? currentAudio.label}</strong>
        <span>{currentWord?.reading}・{currentWord?.meaningZhTw}</span>
      </div>
      <div className={styles.playerSentence}>
        <p lang="ja">{currentWord ? renderRuby(currentWord.example) : currentAudio.label}</p>
      </div>
      <div className={styles.playerControls}>
        <button className={styles.playerButton} type="button" aria-label="上一個音檔" disabled={audioIndex === 0} onClick={onPrevious}>‹</button>
        <button className={`${styles.playerButton} ${styles.playerMainButton}`} type="button" aria-label={isAudioPlaying ? "暫停播放" : "繼續播放"} onClick={onToggle}>
          {isAudioPlaying ? "Ⅱ" : "▶"}
        </button>
        <button className={styles.playerButton} type="button" aria-label="下一個音檔" disabled={audioIndex === audioLength - 1} onClick={onNext}>›</button>
      </div>
      <div className={styles.playerProgressWrap}>
        <div className={styles.playerProgressMeta}><span>{`第 ${audioIndex + 1} / ${audioLength} 項`}</span></div>
        <progress className={styles.playerProgress} value={audioIndex + 1} max={audioLength} aria-label="播放項目進度" />
      </div>
      <button className={styles.playerStop} type="button" onClick={onStop}>結束播放</button>
      <button
        className={styles.playerSettingsToggle}
        type="button"
        aria-label={showPlayerSettings ? "收合播放設定" : "展開播放設定"}
        aria-expanded={showPlayerSettings}
        aria-controls="player-settings-panel"
        onClick={onToggleSettings}
      >
        播放設定
      </button>
      {showPlayerSettings && (
        <div className={styles.playerSettings} id="player-settings-panel" role="group" aria-label="播放設定">
          <fieldset>
            <legend>播放內容</legend>
            <div className={styles.settingSegments}>
              {([
                ["word", "單字"],
                ["sentence", "例句"],
                ["both", "單字＋例句"],
              ] as Array<[PlaybackMode, string]>).map(([value, label]) => (
                <button key={value} type="button" className={playbackMode === value ? styles.selectedSetting : ""} aria-pressed={playbackMode === value} onClick={() => onPlaybackModeChange(value)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.settingsRate}>
            <span>語速</span>
            <select value={audioRate} onChange={(event) => onAudioRateChange(Number(event.target.value))}>
              {Array.from({ length: 11 }, (_, index) => {
                const rate = 0.75 + index * 0.05;
                return <option key={rate.toFixed(2)} value={rate}>{rate.toFixed(2)}×</option>;
              })}
            </select>
          </label>
          <label className={styles.settingsRate}>
            <span>重複</span>
            <select value={repeatCount} onChange={(event) => onRepeatCountChange(Number(event.target.value) as 1 | 2 | 3)}>
              <option value={1}>1 次</option>
              <option value={2}>2 次</option>
              <option value={3}>3 次</option>
            </select>
          </label>
        </div>
      )}
    </aside>
  );
}
