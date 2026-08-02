import { Fragment, type ReactNode } from "react";
import styles from "../demo.module.css";

export type DemoWord = {
  id: string;
  number: number;
  chapterNumber: number;
  chapterTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaningZhTw: string;
  example: string;
  exampleZhTw: string;
  wordAudio: string;
  sentenceAudio: string;
};

export type AudioStep = {
  id: string;
  label: string;
  src: string;
};

export function renderRuby(text: string): ReactNode[] {
  const output: ReactNode[] = [];
  const matcher = /([一-龯々〆ヵヶ0-9０-９]+)\[([^\]]+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) {
      output.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, match.index)}</Fragment>);
    }
    output.push(
      <ruby key={`ruby-${match.index}`}>
        {match[1]}
        <rt>{match[2]}</rt>
      </ruby>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    output.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }
  return output;
}

export function AudioIcon() {
  return <span className={styles.audioIcon} aria-hidden="true" />;
}
