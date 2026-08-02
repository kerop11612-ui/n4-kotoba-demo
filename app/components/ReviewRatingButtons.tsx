import type { ReviewRating } from "../../src/spaced-repetition/types";
import styles from "../demo.module.css";

type ReviewRatingButtonsProps = {
  disabled: boolean;
  onRate: (rating: ReviewRating) => void;
};

const ratings: Array<[ReviewRating, string]> = [
  ["again", "忘記"],
  ["hard", "困難"],
  ["good", "想起"],
  ["easy", "熟練"],
];

export function ReviewRatingButtons({ disabled, onRate }: ReviewRatingButtonsProps) {
  return (
    <div className={styles.reviewRatings}>
      {ratings.map(([rating, label]) => (
        <button key={rating} type="button" disabled={disabled} onClick={() => onRate(rating)}>
          {label}
        </button>
      ))}
    </div>
  );
}
