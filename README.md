# ASen — Seneca Study Helper

A Manifest V3 Chrome extension starter that detects likely multiple-choice questions on Seneca pages and matches them against a **local, user-maintained answer bank**. It does not use AI or send page content to a server.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the repository folder.
5. Open Seneca and click the ASen extension icon to configure it.

## Answer bank format

Paste or import a JSON array in the extension popup:

```json
[
  {
    "question": "What is the capital of France?",
    "answer": "Paris"
  }
]
```

The question and answer are matched by normalized text. The correct answer must be present in the visible options. Keep question wording exact enough to identify the question uniquely.

## Settings

- **Select exact matches automatically** is off by default. Turn it on to click an option only when an exact local answer-bank match is found.
- **Advance after selecting** is experimental and off by default. Seneca's UI varies, so progression needs testing on real question types.

## Current limitations

- The repository starts with an empty template, not a complete Seneca answer database.
- This is heuristic DOM detection; Seneca may change its page structure and break detection.
- It cannot guarantee correct answers for unknown questions. It deliberately does nothing when no exact match is found.
- Test on practice questions first. Do not enable auto-advance until the relevant question types are verified.

## Files

- `manifest.json` — Chrome Manifest V3 configuration
- `content.js` — detects visible question/option text and matches the local bank
- `popup.html`, `popup.js` — settings and answer-bank import/export
- `answers.json` — example bank format
