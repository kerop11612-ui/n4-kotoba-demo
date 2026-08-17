import type { ReviewRating } from "../../src/spaced-repetition/types";
import styles from "../demo.module.css";

type ReviewRatingButtonsProps = {
  disabled: boolean;
  onRate: (rating: ReviewRating) => void;
};

const ratings: Array<[ReviewRating, string, string]> = [
  ["again", "忘記", "1"],
  ["hard", "困難", "2"],
  ["good", "想起", "3"],
  ["easy", "熟練", "4"],
];

export function ReviewRatingButtons({ disabled, onRate }: ReviewRatingButtonsProps) {
  return (
    <div className={styles.reviewRatings}>
      {ratings.map(([rating, label, shortcut]) => (
        <button key={rating} type="button" disabled={disabled} aria-keyshortcuts={shortcut} onClick={() => onRate(rating)}>
          <kbd>{shortcut}</kbd>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
