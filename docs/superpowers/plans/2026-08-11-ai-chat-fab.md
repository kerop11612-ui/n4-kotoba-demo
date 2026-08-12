# AI 助教浮動入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable fixed “AI 助教” pill button that opens the existing chat drawer on the home and unit pages.

**Architecture:** Create a small client-side `AiChatFab` presentation component with its own CSS module. Mount it beside the existing `AiChatDrawer` in both page shells and render it only while the drawer is closed. Keep chat state, transport, and data flow unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node built-in tests, Playwright CLI.

## Global Constraints

- Keep the existing UI, data format, and AI transport unchanged.
- Touch controls must be at least 44px; use 48px for the coarse-pointer layout.
- Mobile width 390px must not develop horizontal scrolling.
- Do not add packages, deploy, or change global settings.

---

### Task 1: Define the FAB contract and regression test

**Files:**
- Create: `app/components/ai-chat-fab-actions.ts`
- Modify: `tests/ai-chat.test.mjs`

- [ ] Add `getAiChatFabProps()` returning `{ label: "AI 助教", ariaLabel: "開啟 AI 助教" }`.
- [ ] Add a test asserting both literal values before implementation.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="floating" tests/ai-chat.test.mjs` and confirm the missing-module failure.

### Task 2: Build and mount the pill button

**Files:**
- Create: `app/components/AiChatFab.tsx`
- Create: `app/components/AiChatFab.module.css`
- Modify: `app/home/page.tsx`
- Modify: `app/page.tsx`

- [ ] Implement a native button that consumes `onOpen`, uses the shared action props, and includes a decorative inline speech-bubble SVG.
- [ ] Style it as an orange fixed pill at `right: 16px`, bottom-safe-area aware, with `min-height: 48px`, focus-visible outline, hover state, and reduced-motion support.
- [ ] Render it only when `aiChat.isOpen` is false and connect `onOpen={() => aiChat.open()}`.
- [ ] Run the focused test and confirm the contract passes.

### Task 3: Verify the interaction and project

**Files:**
- Modify: `TASK.md`

- [ ] Use Playwright at 390px and 768px to confirm the button is visible, opens the dialog, disappears while open, and does not create horizontal scroll.
- [ ] Run `npm run verify` and `git diff --check`.
- [ ] Update `TASK.md` with the completed FAB status and next step.
