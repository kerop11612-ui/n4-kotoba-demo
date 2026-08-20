import styles from "../demo.module.css";
import type { LearningFilter } from "../../src/spaced-repetition/learning-filter";

type WordFocusFilterProps = {
  value: LearningFilter;
  counts: Record<LearningFilter, number>;
  onChange: (value: LearningFilter) => void;
};

const options: Array<{ value: LearningFilter; label: string }> = [
  { value: "needs", label: "待加強" },
  { value: "all", label: "全部" },
  { value: "learned", label: "已學會" },
];

export function WordFocusFilter({ value, counts, onChange }: WordFocusFilterProps) {
  return (
    <div className={styles.wordFocusFilter} role="group" aria-label="單字顯示篩選">
      <span className={styles.wordFocusFilterLabel}>目前顯示</span>
      <div className={styles.wordFocusFilterOptions}>
        {options.map((option) => (
          <button
            className={value === option.value ? styles.wordFocusFilterActive : styles.wordFocusFilterButton}
            type="button"
            aria-pressed={value === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <b>{counts[option.value]}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
