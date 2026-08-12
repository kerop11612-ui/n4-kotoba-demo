import { Fragment, type ReactNode } from "react";
import styles from "../demo.module.css";
import type { VocabularyWord } from "../../src/vocabulary/types";

export type DemoWord = VocabularyWord;

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

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className={styles.starIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3.7 2.56 5.19 5.73.83-4.15 4.04.98 5.71L12 16.77l-5.12 2.7.98-5.71-4.15-4.04 5.73-.83L12 3.7Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
