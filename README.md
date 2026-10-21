# ASen — Seneca Study Helper

ASen is a local Chrome extension prototype for reading visible Seneca lesson/question content and helping with supported answer formats. It does not call an AI service or send page text to a server.

## Install / update

1. Download the repository ZIP from GitHub and extract it.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted ASen folder.
4. After future updates, download/extract the latest version and use **Reload** on the extension card (or load the updated folder).

## Current capabilities

- Reads visible text from the current page, including lesson passages outside interactive controls.
- Detects likely question text and visible answer choices using DOM heuristics.
- Matches exact/contained saved question-answer entries from a local answer bank.
- Uses conservative word-overlap evidence from visible lesson sentences to rank some multiple-choice options.
- Can click a supported choice, fill a text input/textarea/contenteditable, or choose a matching dropdown option when auto-apply is enabled.
- Can optionally advance after applying an answer.
- Stores the answer bank and settings in Chrome local storage; there is no external AI/network service in this extension.
- Has an experimental learning hook for pages that visibly report correctness. Verify learned entries before relying on them.

## Answer bank format

Import or paste a JSON array in the popup:

```json
[
  { "question": "What is the capital of France?", "answer": "Paris" }
]
```

Only use verified answers. The question should be specific enough to identify the intended prompt. Entries are stored locally in the browser.

## Important limitations

This is an experimental prototype, not a universal solver. It has not been validated against every Seneca page or question type. The lesson-based solver uses text overlap, not deep semantic reasoning, and may miss facts, misunderstand negation, or fail when lesson content is rendered as images/canvas. Matching pairs, drag-and-drop ordering, diagrams, and complex multi-part questions may need dedicated handlers. Unknown or ambiguous questions are left unanswered rather than guessed.

Start with auto-apply and auto-advance turned off. Test on practice questions and verify the answer before enabling automation. Seneca can change its page structure at any time, which may require updates.

## Files

- `manifest.json` — Chrome Manifest V3 configuration
- `content.js` — page reading, question detection, local matching, basic lesson-evidence scoring, and supported input interaction
- `popup.html`, `popup.js` — settings and answer-bank import/export
- `answers.json` — example answer-bank format
