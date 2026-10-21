(() => {
  "use strict";
  if (window.__asenInstalled) return;
  window.__asenInstalled = true;

  const normalize = (s) => (s || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const text = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

  function questionCandidates() {
    const selectors = [
      '[data-testid*="question"]', '[class*="question"]',
      '[class*="Question"]', 'main h1', 'main h2', 'main h3',
      '[role="main"] h1', '[role="main"] h2', '[role="main"] h3'
    ];
    const seen = new Set(), out = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const t = text(el);
        if (t.length < 5 || t.length > 700 || seen.has(t)) continue;
        seen.add(t); out.push({el, t});
      }
    }
    return out.sort((a,b) => a.t.length - b.t.length);
  }

  function optionElements() {
    const selectors = [
      '[role="radio"]', '[role="option"]', 'button',
      '[data-testid*="answer"]', '[class*="answer"]',
      '[class*="option"]', 'label'
    ];
    const seen = new Set(), out = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el) || seen.has(el)) continue;
        const t = text(el);
        if (!t || t.length > 250 || t.length < 1) continue;
        if (/^(next|continue|check|submit|finish|skip|back|hint|show answer)$/i.test(t)) continue;
        seen.add(el); out.push({el, t});
      }
    }
    return out;
  }

  function findQuestion() {
    const candidates = questionCandidates();
    const options = optionElements();
    if (!candidates.length || options.length < 2) return null;
    // Prefer a concise question heading, avoiding large page containers.
    const q = candidates.find(x => x.t.includes("?")) || candidates[0];
    return {question: q.t, options};
  }

  async function run() {
    const detected = findQuestion();
    if (!detected) return;
    const key = normalize(detected.question);
    const optionTexts = detected.options.map(x => normalize(x.t));
    const stored = await chrome.storage.local.get(["answerBank", "autoSelect", "autoNext"]);
    const bank = Array.isArray(stored.answerBank) ? stored.answerBank : [];
    const match = bank.find(entry => normalize(entry.question) === key &&
      normalize(entry.answer) && optionTexts.includes(normalize(entry.answer)));
    renderStatus(match
      ? "Known question matched: " + match.answer
      : "Question detected — no exact answer in your local answer bank.",
      !!match);

    if (!match) return;
    const target = detected.options.find(x => normalize(x.t) === normalize(match.answer));
    if (!target) return;
    if (stored.autoSelect === true && !target.el.dataset.asenSelected) {
      target.el.dataset.asenSelected = "1";
      target.el.click();
      if (stored.autoNext === true) {
        setTimeout(() => {
          const next = [...document.querySelectorAll("button,[role='button']")]
            .find(el => visible(el) && /^(next|continue|check answer|submit|finish)$/i.test(text(el)));
          if (next) next.click();
        }, 500);
      }
    }
  }

  let statusNode;
  function renderStatus(message, matched) {
    if (!statusNode) {
      statusNode = document.createElement("div");
      statusNode.id = "asen-status";
      Object.assign(statusNode.style, {
        position:"fixed", right:"12px", bottom:"12px", zIndex:"2147483647",
        maxWidth:"320px", padding:"10px 12px", borderRadius:"10px",
        background:"#172033", color:"#fff", font:"13px/1.4 system-ui,sans-serif",
        boxShadow:"0 4px 18px #0004", pointerEvents:"none"
      });
      document.documentElement.appendChild(statusNode);
    }
    statusNode.textContent = "ASen · " + message;
    statusNode.style.borderLeft = "4px solid " + (matched ? "#39b980" : "#f0b44d");
  }

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => run().catch(() => {}), 350); };
  new MutationObserver(schedule).observe(document.documentElement, {subtree:true, childList:true});
  chrome.storage.onChanged.addListener(schedule);
  schedule();
})();