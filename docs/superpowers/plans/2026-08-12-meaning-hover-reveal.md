# Meaning Hover Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the word-card answer button with independent hover/focus reveal behavior for the word and example Chinese translations.

**Architecture:** Keep `blurTranslations` as the existing preference. `WordCard` will render the word meaning and example translation inside separate instances of one reveal-zone class. CSS Modules will reveal only hidden text inside the hovered/focused zone, so the two translations remain independent and no new runtime state or dependency is needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node built-in test runner.

## Global Constraints

- Preserve existing UI, data format, and feature behavior outside this interaction.
- UI changes must be checked at 390px and must not introduce horizontal scrolling.
- Do not add packages or change global settings.
- Keep existing unrelated worktree changes untouched.
- Run `npm test` for the UI contract regression test and existing core tests.

---

### Task 1: Add a failing interaction contract test

**Files:**
- Create: `tests/meaning-hover-reveal.test.mjs`
- Modify: `package.json` test script to include the new test file

**Interfaces:**
- Consumes: source text from `app/components/WordCard.tsx` and `app/demo.module.css`.
- Produces: a repeatable regression check for the absence of the answer button and the presence of independent word/example hover/focus CSS rules.

- [ ] **Step 1: Write the failing test**

Create a Node test that reads the component and stylesheet, then asserts:

```js
test("word and example translations use independent hover reveal zones", () => {
  assert.doesNotMatch(wordCard, /styles\.translationReveal(?!Zone)|顯示答案|隱藏答案/);
  assert.equal((wordCard.match(/translationRevealZone/g) ?? []).length, 2);
  assert.match(stylesheet, /\.translationRevealZone:hover \.translationHidden/);
  assert.match(stylesheet, /\.translationRevealZone:focus-within \.translationHidden/);
  assert.doesNotMatch(stylesheet, /\.translationHidden:hover/);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `node --test tests/meaning-hover-reveal.test.mjs`

Expected: FAIL because the current component does not yet provide two `translationRevealZone` instances and the stylesheet has no scoped hover/focus rules.

### Task 2: Implement independent word/example hover reveal

**Files:**
- Modify: `app/components/WordCard.tsx:1-126`
- Modify: `app/demo.module.css:691-885`
- Modify: `app/page.tsx:306-309`

**Interfaces:**
- Consumes: existing `blurTranslations`, `showMeaning`, and `showExampleTranslation` props.
- Produces: separate word-meaning and example-translation reveal zones that temporarily clear only their own `translationHidden` class on hover/focus.

- [ ] **Step 1: Remove the per-card reveal state and answer button**

Remove `useState`, `translationRevealed`, and the `translationReveal` button. Set the hidden class from the preference alone:

```tsx
const translationHidden = blurTranslations;
const translationClassName = translationHidden ? styles.translationHidden : "";
```

- [ ] **Step 2: Wrap both translations in independent reveal zones**

Render the meaning and example translation as separate focusable zones:

```tsx
<div className={styles.translationRevealZone} tabIndex={blurTranslations ? 0 : undefined}>
  <p className={`${styles.meaning} ${translationClassName}`}>{word.meaningZhTw}</p>
</div>
```

Use a second `translationRevealZone` around the example translation, outside the meaning zone, so hovering one does not reveal the other.

- [ ] **Step 3: Add scoped CSS interaction rules**

Add a flex-compatible `.translationRevealZone` and rules after `.translationHidden`:

```css
.translationRevealZone {
  min-width: 0;
  flex: 1 1 auto;
}

.translationRevealZone:hover .translationHidden,
.translationRevealZone:focus-within .translationHidden {
  filter: none;
  user-select: text;
}

.translationRevealZone:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}
```

- [ ] **Step 4: Update the page hint**

Replace the old button-oriented hint with: `滑鼠移入單字或例句中文翻譯區即可查看答案。`

- [ ] **Step 5: Run the focused contract test**

Run: `node --test tests/meaning-hover-reveal.test.mjs`

Expected: PASS with one test and zero failures.

### Task 3: Update task status and run verification

**Files:**
- Modify: `TASK.md` to record the current implementation and next step only.

**Interfaces:**
- Consumes: the completed WordCard/CSS behavior and test result.
- Produces: current project status for the next work session.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all existing tests and the new UI contract test pass.

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types; npm run lint:app`

Expected: both commands exit with code 0 and no new errors.

- [ ] **Step 3: Run the project check**

Run: `npm run check`

Expected: lint and test checks exit with code 0.

- [ ] **Step 4: Verify the 390px layout and diff hygiene**

Run: `git diff --check` and inspect the responsive CSS around `.meaningRow`, `.exampleCopy`, and `.translationRevealZone`; confirm no fixed-width addition can create horizontal scrolling.

- [ ] **Step 5: Update `TASK.md`**

Record that the meaning answer button was replaced by independent word/example hover/focus reveal, list the exact checks run, and leave only the next relevant project step.
