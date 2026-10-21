(() => {
  "use strict";
  if (window.__asenInstalled) return;
  window.__asenInstalled = true;

  const normalize = s => (s || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const words = s => normalize(s).split(/\s+/).filter(w => w.length > 2);
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const rawText = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const isControl = el => !!el?.closest("button,[role=button],[role=radio],[role=option],label,input,textarea,select");
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const unique = arr => [...new Set(arr.filter(Boolean))];

  function readPage() {
    const main = document.querySelector("main,[role=main],article") || document.body;
    const questionSelectors = [
      '[data-testid*="question" i]', '[class*="question" i]',
      '[aria-label*="question" i]', "main h1", "main h2", "main h3",
      '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
      "article h1", "article h2", "article h3"
    ];
    const candidates = [];
    const seen = new Set();
    for (const sel of questionSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el) || el.closest("#asen-status")) continue;
        const t = rawText(el);
        if (t.length < 5 || t.length > 650 || seen.has(t)) continue;
        seen.add(t); candidates.push({el, text:t, score:(t.includes("?") ? 4 : 0) + (/\b(choose|select|complete|fill|match|order|which|what|why|how|calculate|name|identify)\b/i.test(t) ? 2 : 0) - Math.max(0,t.length-180)/100});
      }
    }
    const question = candidates.sort((a,b)=>b.score-a.score)[0] || null;

    const optionSelectors = [
      '[role="radio"]','[role="checkbox"]','[role="option"]',
      'button','label','[data-testid*="answer" i]',
      '[class*="answer" i]','[class*="option" i]'
    ];
    const options = [], optionSeen = new Set();
    for (const sel of optionSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el) || el.closest("#asen-status") || optionSeen.has(el)) continue;
        if (el.matches("button") && el.querySelector("input,textarea,select")) continue;
        const t = clean(rawText(el) || el.getAttribute("aria-label") || el.getAttribute("value"));
        if (!t || t.length > 220 || /^(next|continue|check|submit|finish|skip|back|hint|show answer|try again|close)$/i.test(t)) continue;
        if (el.matches("button") && !el.matches('[class*="answer" i],[class*="option" i],[data-testid*="answer" i]') &&
            !el.getAttribute("role") && !el.querySelector("img,svg")) continue;
        optionSeen.add(el); options.push({el,text:t});
      }
    }

    const controls = [...main.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),textarea,select,[contenteditable="true"]')]
      .filter(el=>visible(el) && !el.closest("#asen-status") && !/^(button|submit|reset|file)$/i.test(el.type||""))
      .map(el=>({el,placeholder:el.getAttribute("placeholder")||"",label:associatedLabel(el),value:el.value||""}));

    // Lesson explanation is visible text outside answer controls. Keep it bounded for speed.
    const excluded = new Set(["SCRIPT","STYLE","NOSCRIPT","SVG","BUTTON","INPUT","TEXTAREA","SELECT"]);
    const chunks = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || excluded.has(p.tagName) || p.closest("#asen-status") || !visible(p) || isControl(p)) return NodeFilter.FILTER_REJECT;
        const t = clean(node.nodeValue);
        return t.length >= 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode() && chunks.join(" ").length < 14000) chunks.push(clean(walker.currentNode.nodeValue));
    const pageText = clean(chunks.join(" ").slice(0,14000));
    return {question:question?.text||"", questionEl:question?.el||null, options, controls, pageText, main};
  }

  function associatedLabel(el) {
    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (label) return rawText(label);
    }
    return rawText(el.closest("label")) || el.getAttribute("aria-label") || "";
  }

  function sentenceList(text) {
    return (text.match(/[^.!?\\n]+[.!?]?/g)||[]).map(clean).filter(s=>s.length>12);
  }

  function evidenceScore(question, option, lesson) {
    const qWords = unique(words(question)).filter(w=>!["which","what","where","when","does","from","this","that","with","have","about","following","correct","answer","select","choose"].includes(w));
    const oWords = unique(words(option));
    if (!oWords.length) return {score:0, sentence:""};
    const sentences = sentenceList(lesson);
    let best = {score:0,sentence:""};
    for (const sentence of sentences) {
      const ns = normalize(sentence);
      const optionHits = oWords.filter(w=>ns.includes(w)).length / oWords.length;
      const questionHits = qWords.filter(w=>ns.includes(w)).length / Math.max(1,Math.min(qWords.length,7));
      const exactPhrase = ns.includes(normalize(option)) ? 0.8 : 0;
      const score = optionHits * 2 + questionHits * 1.6 + exactPhrase;
      if (score > best.score) best = {score,sentence};
    }
    return best;
  }

  function solveFromLesson(question, options, lesson) {
    if (!question || options.length < 2 || lesson.length < 80) return null;
    const scored = options.map(o=>({ ...o, ...evidenceScore(question,o.text,lesson)})).sort((a,b)=>b.score-a.score);
    const first = scored[0], second = scored[1];
    // Require meaningful textual overlap and a clear lead; never guess on weak evidence.
    if (first.score >= 2.15 && first.score - (second?.score||0) >= 0.65) {
      return {answer:first.text, target:first, confidence:"lesson-supported", evidence:first.sentence};
    }
    return null;
  }

  function findBankMatch(question, bank) {
    const q = normalize(question);
    if (!q) return null;
    const exact = bank.find(e=>normalize(e.question)===q && normalize(e.answer));
    if (exact) return {answer:exact.answer,confidence:"saved answer"};
    // Permit a saved question to be a clear contained match, but not tiny fragments.
    const fuzzy = bank.filter(e=>{
      const k=normalize(e.question);
      return k.length>24 && (q.includes(k)||k.includes(q)) && normalize(e.answer);
    }).sort((a,b)=>normalize(b.question).length-normalize(a.question).length)[0];
    return fuzzy ? {answer:fuzzy.answer,confidence:"saved question match"} : null;
  }

  function fillControl(control, answer) {
    const el = control.el;
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === "SELECT") {
      const wanted = normalize(answer);
      const option = [...el.options].find(o=>normalize(o.textContent)===wanted || normalize(o.value)===wanted);
      if (!option) return false;
      el.value = option.value;
    } else if (el.isContentEditable) {
      el.textContent = answer;
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      if (setter) setter.call(el, answer); else el.value = answer;
    }
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  }

  function applyAnswer(page, answer, stored, target) {
    if (stored.autoSelect !== true) return false;
    if (target?.el && !target.el.dataset.asenClicked) {
      target.el.dataset.asenClicked = "1";
      target.el.click();
      return true;
    }
    if (page.controls.length) {
      const control = page.controls.find(c=>!c.value || !c.value.trim()) || page.controls[0];
      return fillControl(control, answer);
    }
    return false;
  }

  let statusNode;
  function renderStatus(message, state="info") {
    if (!statusNode) {
      statusNode=document.createElement("div"); statusNode.id="asen-status";
      Object.assign(statusNode.style,{position:"fixed",right:"12px",bottom:"12px",zIndex:"2147483647",maxWidth:"340px",padding:"10px 12px",borderRadius:"10px",background:"#172033",color:"#fff",font:"13px/1.4 system-ui,sans-serif",boxShadow:"0 4px 18px #0004",pointerEvents:"none"});
      document.documentElement.appendChild(statusNode);
    }
    statusNode.textContent="ASen · "+message;
    statusNode.style.borderLeft="4px solid "+(state==="good"?"#39b980":state==="warn"?"#f0b44d":"#8ba4ff");
  }

  async function run() {
    const page=readPage();
    if (!page.question && !page.controls.length) return;
    const stored=await chrome.storage.local.get(["answerBank","autoSelect","autoNext"]);
    const bank=Array.isArray(stored.answerBank)?stored.answerBank:[];
    const bankMatch=findBankMatch(page.question,bank);
    let result=bankMatch;
    let target=null;
    if (result && page.options.length) {
      target=page.options.find(o=>normalize(o.text)===normalize(result.answer))||null;
      if (!target && page.options.length) result=null;
    }
    if (!result && page.options.length>=2) {
      result=solveFromLesson(page.question,page.options,page.pageText);
      target=result?.target||null;
    }
    if (!result && page.controls.length) {
      const direct=findBankMatch(page.question,bank);
      if (direct) result=direct;
    }
    if (!result) {
      renderStatus(page.question ? "Read page + question; no confident answer found." : "Page read; waiting for a clear question.", "warn");
      return;
    }
    const preview=result.answer.length>70?result.answer.slice(0,67)+"…":result.answer;
    renderStatus(result.confidence+": "+preview+(result.evidence?" · evidence: "+result.evidence.slice(0,90):""), "good");
    const acted=applyAnswer(page,result.answer,stored,target);
    if (acted && stored.autoNext===true) {
      setTimeout(()=>{
        const next=[...document.querySelectorAll("button,[role=button]")].find(el=>visible(el)&&/^(next|continue|check answer|submit|finish)$/i.test(rawText(el)));
        if(next) next.click();
      },700);
    }
  }

  // Learn only when the page explicitly exposes a correct/reveal state. Never learn from an unverified click.
  async function learnVerifiedAnswer() {
    const body=normalize(document.body?.innerText||"");
    if (!/\b(correct|that's right|well done|mark scheme|correct answer)\b/.test(body)) return;
    const page=readPage();
    if (!page.question) return;
    const chosen=page.options.find(o=>o.el.getAttribute("aria-checked")==="true" || o.el.getAttribute("aria-pressed")==="true" || o.el.getAttribute("data-selected")==="true" || /selected|correct/i.test(o.el.getAttribute("class")||""));
    if (!chosen) return;
    const data=await chrome.storage.local.get(["answerBank"]);
    const bank=Array.isArray(data.answerBank)?data.answerBank:[];
    if (bank.some(e=>normalize(e.question)===normalize(page.question))) return;
    bank.push({question:page.question,answer:chosen.text,learned:true});
    await chrome.storage.local.set({answerBank});
    renderStatus("Learned a verified answer from feedback.", "good");
  }

  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{run().catch(()=>{});learnVerifiedAnswer().catch(()=>{});},500);};
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  chrome.storage.onChanged.addListener(schedule);
  schedule();
})();