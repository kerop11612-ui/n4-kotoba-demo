"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackMode } from "../components/AudioPlayer";
import type { AudioStep, DemoWord } from "../components/vocabulary";

export function useAudioPlayer({
  words,
  visibleWords,
  onMessage,
}: {
  words: DemoWord[];
  visibleWords: DemoWord[];
  onMessage: (message: string) => void;
}) {
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("both");
  const [repeatCount, setRepeatCount] = useState<1 | 2 | 3>(1);
  const [audioSteps, setAudioSteps] = useState<AudioStep[]>([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioRate, setAudioRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentAudio = audioSteps[audioIndex];
  const isPlaylist = audioSteps.length > 1;
  const currentWord = currentAudio
    ? words.find((word) => currentAudio.id.startsWith(word.id))
    : undefined;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;
    const playableAudio = audio;
    let cancelled = false;

    function startPlayback() {
      if (cancelled) return;
      void playableAudio
        .play()
        .then(() => setIsAudioPlaying(true))
        .catch(() => {
          if (!cancelled) {
            setIsAudioPlaying(false);
            onMessage("請再按一次播放。音檔尚未準備完成。");
          }
        });
    }

    playableAudio.pause();
    playableAudio.src = currentAudio.src;
    playableAudio.playbackRate = audioRate;
    playableAudio.currentTime = 0;
    playableAudio.load();
    if (playableAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) startPlayback();
    else playableAudio.addEventListener("canplay", startPlayback, { once: true });

    return () => {
      cancelled = true;
      playableAudio.removeEventListener("canplay", startPlayback);
    };
  }, [audioRate, currentAudio, onMessage]);

  const playOne = useCallback((step: AudioStep) => {
    onMessage("");
    setAudioIndex(0);
    setAudioSteps([step]);
  }, [onMessage]);

  const playVisibleWords = useCallback((startIndex = 0) => {
    const baseSteps = visibleWords.slice(startIndex).flatMap((word) => {
      const wordStep = word.wordAudio
        ? { id: `${word.id}-word`, label: `${word.word}・單字`, src: word.wordAudio }
        : null;
      const sentenceStep = word.sentenceAudio
        ? { id: `${word.id}-sentence`, label: `${word.word}・例句`, src: word.sentenceAudio }
        : null;
      return playbackMode === "word"
        ? wordStep ? [wordStep] : []
        : playbackMode === "sentence"
          ? sentenceStep ? [sentenceStep] : []
          : [wordStep, sentenceStep].filter((step): step is AudioStep => Boolean(step));
    });
    const steps = baseSteps.flatMap((step) => Array.from({ length: repeatCount }, () => ({ ...step })));
    if (!steps.length) return;
    onMessage("");
    setAudioIndex(0);
    setAudioSteps(steps);
  }, [onMessage, playbackMode, repeatCount, visibleWords]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    setIsAudioPlaying(false);
    setAudioSteps([]);
    setAudioIndex(0);
  }, []);

  const toggleAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;
    if (isAudioPlaying) {
      audio.pause();
      setIsAudioPlaying(false);
      return;
    }
    void audio.play()
      .then(() => setIsAudioPlaying(true))
      .catch(() => {
        setIsAudioPlaying(false);
        onMessage("請再按一次播放。音檔尚未準備完成。");
      });
  }, [currentAudio, isAudioPlaying, onMessage]);

  const jumpAudio = useCallback((offset: number) => {
    if (!isPlaylist) return;
    setAudioIndex((index) => Math.max(0, Math.min(index + offset, audioSteps.length - 1)));
  }, [audioSteps.length, isPlaylist]);

  const handleAudioEnded = useCallback(() => {
    setIsAudioPlaying(false);
    if (audioIndex < audioSteps.length - 1) setAudioIndex((index) => index + 1);
    else {
      setAudioSteps([]);
      setAudioIndex(0);
    }
  }, [audioIndex, audioSteps.length]);

  return {
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
  };
}
