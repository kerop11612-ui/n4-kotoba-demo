"use client";

import { useCallback, useEffect, useState } from "react";
import type { VocabularySection } from "../../src/vocabulary/catalog";

function readSelectionFromUrl(): { chapter: number; section: number } {
  const params = new URLSearchParams(window.location.search);
  const chapter = Number(params.get("chapter"));
  const section = Number(params.get("section"));
  return {
    chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : 1,
    section: Number.isInteger(section) && section > 0 ? section : 1,
  };
}

export function useUnitSelection(sections: VocabularySection[]) {
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [selectedSection, setSelectedSection] = useState(1);
  const [selectionReady, setSelectionReady] = useState(false);

  useEffect(() => {
    const applySelectionFromUrl = () => {
      const selection = readSelectionFromUrl();
      setSelectedChapter(selection.chapter);
      setSelectedSection(selection.section);
      setSelectionReady(true);
    };
    applySelectionFromUrl();
    window.addEventListener("popstate", applySelectionFromUrl);
    return () => window.removeEventListener("popstate", applySelectionFromUrl);
  }, []);

  useEffect(() => {
    if (!selectionReady || !sections.length) return;
    const selected = sections.find((section) =>
      section.chapterNumber === selectedChapter && section.sectionNumber === selectedSection,
    );
    if (selected) return;
    const fallback = sections.find((section) => section.chapterNumber === selectedChapter) ?? sections[0];
    const timer = window.setTimeout(() => {
      setSelectedChapter(fallback.chapterNumber);
      setSelectedSection(fallback.sectionNumber);
      window.history.replaceState(null, "", `/?chapter=${fallback.chapterNumber}&section=${fallback.sectionNumber}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sections, selectedChapter, selectedSection, selectionReady]);

  const selectUnit = useCallback((chapter: number, section: number) => {
    setSelectedChapter(chapter);
    setSelectedSection(section);
    window.history.replaceState(null, "", `/?chapter=${chapter}&section=${section}`);
  }, []);

  return { selectedChapter, selectedSection, selectionReady, selectUnit };
}
