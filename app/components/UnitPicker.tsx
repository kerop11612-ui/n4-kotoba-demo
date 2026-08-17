import Link from "next/link";
import styles from "../demo.module.css";
import type { VocabularySection } from "../../src/vocabulary/catalog";

type UnitPickerProps = {
  sections: VocabularySection[];
  chapterSections: VocabularySection[];
  selectedChapter: number;
  selectedSection: number;
  onSelectUnit: (chapter: number, section: number) => void;
};

export function UnitPicker({
  sections,
  chapterSections,
  selectedChapter,
  selectedSection,
  onSelectUnit,
}: UnitPickerProps) {
  const chapters = [...new Set(sections.map((section) => section.chapterNumber))];

  return (
    <div className={styles.unitPicker} aria-label="選擇章節與單字庫">
      <label>
        <span>章節</span>
        <select
          value={selectedChapter}
          onChange={(event) => {
            const chapter = Number(event.target.value);
            const firstSection = sections.find((section) => section.chapterNumber === chapter);
            if (firstSection) onSelectUnit(chapter, firstSection.sectionNumber);
          }}
        >
          {chapters.map((chapter) => {
            const chapterData = sections.find((section) => section.chapterNumber === chapter);
            return <option key={chapter} value={chapter}>第 {chapter} 章・{chapterData?.chapterTitle}</option>;
          })}
        </select>
      </label>
      <label>
        <span>單字庫</span>
        <select
          value={selectedSection}
          onChange={(event) => onSelectUnit(selectedChapter, Number(event.target.value))}
        >
          {chapterSections.map((section) => (
            <option key={section.sectionNumber} value={section.sectionNumber}>
              {String(section.sectionNumber).padStart(2, "0")}・{section.sectionTitle}（{section.wordCount} 詞）
            </option>
          ))}
        </select>
      </label>
      <Link className={styles.unitMapLink} href="/units">查看全部章節 →</Link>
      <Link className={styles.unitMapLink} href="/favorites">收藏清單</Link>
    </div>
  );
}
