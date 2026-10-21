(() => {
  "use strict";
  if (window.__asenInstalled) return;
  window.__asenInstalled = true;

  const normalize = s => (s || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const words = s => normalize(s).split(/\s+/).filter(w => w.length > 2);
  const unique = a => [...new Set(a.filter(Boolean))];
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const textOf = el => clean(el?.innerText || el?.textContent || "");
  const excludedFromLesson = el => !el || el.closest("#asen-status") ||
    el.closest("button,[role=button],[role=radio],[role=checkbox],[role=option],label,input,textarea,select,[contenteditable=true]");

  function labelOf(el) {
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) return textOf(lab);
    }
    return textOf(el.closest("label")) || el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") || el.getAttribute("name") || "";
  }

  function readPage() {
    const main = document.querySelector("main,[role=main],article") || document.body;
    const qSelectors = [
      '[data-testid*="question" i]', '[class*="question" i]',
      '[aria-label*="question" i]', '[id*="question" i]',
      "main h1","main h2","main h3",'[role=main] h1','[role=main] h2','[role=main] h3',
      "article h1","article h2","article h3"
    ];
    const qs = [], qSeen = new Set();
    for (const sel of qSelectors) {
      for (const el of main.querySelectorAll(sel)) {
        if (!visible(el) || el.closest("#asen-status")) continue;
        const t = textOf(el);
        if (t.length < 5 || t.length > 650 || qSeen.has(t)) continue;
        qSeen.add(t);
        const score = (t.includes("?") ? 5 : 0) +
          (/\b(choose|select|complete|fill|match|order|which|what|why|how|calculate|name|identify|write|enter)\b/i.test(t) ? 3 : 0) -
          Math.max(0, t.length - 200) / 100;
        qs.push({el, text:t, score});
      }
    }
    // Fallback: look for visible, compact question-like text.
    if (!qs.length) {
      for (const el of main.querySelectorAll("p,div,span")) {
        if (!visible(el) || excludedFromLesson(el)) continue;
        const t = textOf(el);
        if (t.length < 8 || t.length > 240 || !(/[?]/.test(t) || /\b(choose|select|which|what|why|how|calculate|write|enter)\b/i.test(t))) continue;
        if (el.children.length > 5) continue;
        if (!qSeen.has(t)) { qSeen.add(t); qs.push({el,text:t,score:(t.includes("?")?5:0)+2}); }
      }
    }
    qs.sort((a,b)=>b.score-a.score);
    const question = qs[0] || null;

    const optionSelectors = [
      '[role=radio]','[role=checkbox]','[role=option]','input[type=radio]','input[type=checkbox]',
      'label','[data-testid*="answer" i]','[data-testid*="option" i]',
      '[class*="answer" i]','[class*="option" i]','button'
    ];
    const options = [], optionSet = new Set();
    for (const sel of optionSelectors) {
      for (const el of main.querySelectorAll(sel)) {
        if (!visible(el) || el.closest("#asen-status")) continue;
        const target = el.matches('input[type=radio],input[type=checkbox]') ? (el.closest("label") || el) : el;
        if (optionSet.has(target)) continue;
        const t = clean(labelOf(target) || textOf(target) || target.getAttribute("value"));
        if (!t || t.length > 220 || /^(next|continue|check|check answer|submit|finish|skip|back|hint|show answer|try again|close|start assignment)$/i.test(t)) continue;
        if (target.matches("button") && !target.matches('[class*="answer" i],[class*="option" i],[data-testid*="answer" i],[data-testid*="option" i]') &&
            !target.getAttribute("role") && !target.querySelector("img,svg,input")) continue;
        if (question?.el && (target === question.el || question.el.contains(target))) continue;
        optionSet.add(target);
        options.push({el:target,text:t, input:target.matches('input[type=radio],input[type=checkbox]') ? target : target.querySelector('input[type=radio],input[type=checkbox]')});
      }
    }

    const controls = [...main.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]')]
      .filter(el=>visible(el) && !el.closest("#asen-status") && !el.disabled && !el.readOnly)
      .map(el=>({el,placeholder:el.getAttribute("placeholder")||"",label:labelOf(el),value:el.isContentEditable?textOf(el):(el.value||"")}));

    const chunks = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p=node.parentElement;
        if (!p || !visible(p) || excludedFromLesson(p) || ["SCRIPT","STYLE","NOSCRIPT","SVG"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        const t=clean(node.nodeValue);
        return t.length >= 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let length=0;
    while (walker.nextNode() && length<18000) {
      const t=clean(walker.currentNode.nodeValue);
      chunks.push(t); length+=t.length+1;
    }
    return {main,question:question?.text||"",questionEl:question?.el||null,options,controls,pageText:clean(chunks.join(" ").slice(0,18000))};
  }

  function sentences(text) {
    return (text.match(/[^.!?\n]+[.!?]?/g)||[]).map(clean).filter(s=>s.length>12);
  }
  function evidenceScore(question, option, lesson) {
    const ignored=["which","what","where","when","does","from","this","that","with","have","about","following","correct","answer","select","choose","does","the","are","for"];
    const qWords=unique(words(question)).filter(w=>!ignored.includes(w));
    const oWords=unique(words(option));
    if (!oWords.length) return {score:0,sentence:""};
    let best={score:0,sentence:""};
    for (const sentence of sentences(lesson)) {
      const ns=normalize(sentence);
      const optionHits=oWords.filter(w=>ns.includes(w)).length/oWords.length;
      const qHits=qWords.filter(w=>ns.includes(w)).length/Math.max(1,Math.min(qWords.length,7));
      const phrase=ns.includes(normalize(option))?0.8:0;
      const score=optionHits*2+qHits*1.6+phrase;
      if(score>best.score) best={score,sentence};
    }
    return best;
  }
  function solveFromLesson(question, options, lesson) {
    if(!question||options.length<2||lesson.length<80)return null;
    const ranked=options.map(o=>({...o,...evidenceScore(question,o.text,lesson)})).sort((a,b)=>b.score-a.score);
    if(ranked[0].score>=2.15 && ranked[0].score-(ranked[1]?.score||0)>=0.55)
      return {answer:ranked[0].text,target:ranked[0],confidence:"lesson-supported",evidence:ranked[0].sentence};
    return null;
  }
  function findBankMatch(question, bank) {
    const q=normalize(question);
    if(!q)return null;
    const exact=bank.find(e=>normalize(e.question)===q && normalize(e.answer));
    if(exact)return {answer:e.answer,confidence:"saved answer"};
    const fuzzy=bank.filter(e=>{const k=normalize(e.question);return k.length>24&&(q.includes(k)||k.includes(q))&&normalize(e.answer);})
      .sort((a,b)=>normalize(b.question).length-normalize(a.question).length)[0];
    return fuzzy?{answer:fuzzy.answer,confidence:"saved question match"}:null;
  }
  function guessTextAnswer(question, lesson) {
    const ss=sentences(lesson);
    if(!ss.length)return null;
    const stop=["what","which","where","when","who","why","how","does","did","are","was","were","the","and","for","from","into","that","this","with","you","write","enter","explain","describe","give","name"];
    const q=unique(words(question)).filter(w=>!stop.includes(w));
    const ranked=ss.map(s=>{
      const ns=normalize(s);
      const hits=q.filter(w=>ns.includes(w)).length/Math.max(1,Math.min(q.length,6));
      const lenPenalty=Math.max(0,s.length-240)/500;
      return {sentence:s,score:hits-lenPenalty};
    }).sort((a,b)=>b.score-a.score);
    return ranked[0] ? {answer:ranked[0].sentence,confidence:"LOW CONFIDENCE — guessing",evidence:ranked[0].sentence} : null;
  }

  function setNativeValue(el,value) {
    if(el.isContentEditable) el.textContent=value;
    else {
      const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
      if(setter)setter.call(el,value);else el.value=value;
    }
    el.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:value}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function fillControl(control, answer) {
    const el=control?.el;
    if(!el||el.disabled||el.readOnly)return false;
    if(el.tagName==="SELECT") {
      const wanted=normalize(answer);
      const opt=[...el.options].find(o=>normalize(o.textContent)===wanted||normalize(o.value)===wanted||normalize(o.textContent).includes(wanted));
      if(!opt)return false;
      setNativeValue(el,opt.value);
    } else setNativeValue(el,answer);
    el.focus?.();
    return true;
  }
  function clickOption(option) {
    if(!option?.el)return false;
    const el=option.el;
    if(el.matches("input[type=radio],input[type=checkbox]")) {
      if(!el.checked)el.click();
    } else {
      const input=el.querySelector?.('input[type=radio],input[type=checkbox]');
      if(input) { if(!input.checked)input.click(); }
      else el.click();
    }
    return true;
  }

  let statusNode;
  function renderStatus(message,state="info") {
    if(!statusNode) {
      statusNode=document.createElement("div");statusNode.id="asen-status";
      Object.assign(statusNode.style,{position:"fixed",right:"12px",bottom:"12px",zIndex:"2147483647",maxWidth:"360px",padding:"10px 12px",borderRadius:"10px",background:"#172033",color:"#fff",font:"13px/1.4 system-ui,sans-serif",boxShadow:"0 4px 18px #0004",pointerEvents:"none"});
      document.documentElement.appendChild(statusNode);
    }
    statusNode.textContent="ASen · "+message;
    statusNode.style.borderLeft="4px solid "+(state==="good"?"#39b980":state==="warn"?"#f0b44d":"#8ba4ff");
  }
  function findActionButton(names) {
    return [...document.querySelectorAll("button,[role=button],input[type=button],input[type=submit]")].find(el=>{
      if(!visible(el)||el.disabled||el.closest("#asen-status"))return false;
      const t=normalize(textOf(el)||el.getAttribute("aria-label")||el.value||"");
      return names.includes(t);
    });
  }

  let attemptedKey="";
  const progressed=new Set();
  function questionKey(page) {
    return normalize(page.question)+"|"+page.options.map(o=>normalize(o.text)).join("|")+"|"+page.controls.length;
  }
  function progressAssignment(key) {
    chrome.storage.local.get(["autoNext"]).then(data=>{
      if(data.autoNext===false)return;
      const check=findActionButton(["check answer","check","submit answer","submit","mark answer"]);
      if(check && !progressed.has(key+":check")) {
        progressed.add(key+":check");
        check.click();
        setTimeout(()=>progressAssignment(key),1000);
        return;
      }
      const next=findActionButton(["next","continue","next question","finish","finish assignment","complete"]);
      if(next && !progressed.has(key+":next")) {
        progressed.add(key+":next");
        next.click();
      }
    }).catch(()=>{});
  }

  async function run() {
    const page=readPage();
    if(!page.question && !page.controls.length && page.options.length<2)return;
    const stored=await chrome.storage.local.get(["answerBank","autoSelect","autoNext"]);
    if(stored.autoSelect===undefined)stored.autoSelect=true;
    if(stored.autoNext===undefined)stored.autoNext=true;
    if(stored.autoSelect!==true)return;
    const key=questionKey(page);
    if(key===attemptedKey) {
      progressAssignment(key);
      return;
    }
    const bank=Array.isArray(stored.answerBank)?stored.answerBank:[];
    let result=findBankMatch(page.question,bank), target=null;
    if(result && page.options.length) {
      target=page.options.find(o=>normalize(o.text)===normalize(result.answer))||null;
      if(!target && page.options.length)result=null;
    }
    const multiSelect=/\b(select all|choose all|all that apply|more than one)\b/i.test(page.question);
    if(!result && page.options.length>=2 && multiSelect) {
      const ranked=page.options.map(o=>({...o,...evidenceScore(page.question,o.text,page.pageText)})).filter(o=>o.score>=1.7);
      if(ranked.length) result={answer:ranked.map(o=>o.text).join(", "),targets:ranked,confidence:"lesson-supported multiple selection"};
      else {
        const best=page.options.map(o=>({...o,...evidenceScore(page.question,o.text,page.pageText)})).sort((a,b)=>b.score-a.score)[0];
        result={answer:best.text,targets:[best],confidence:"LOW CONFIDENCE — guessing"};
      }
    }
    if(!result && page.options.length>=2) {
      result=solveFromLesson(page.question,page.options,page.pageText);
      target=result?.target||null;
    }
    if(!result && page.question && page.options.length>=2) {
      const ranked=page.options.map(o=>({...o,...evidenceScore(page.question,o.text,page.pageText)})).sort((a,b)=>b.score-a.score);
      target=ranked[0];
      result={answer:target.text,target,confidence:"LOW CONFIDENCE — guessing",evidence:target.sentence||""};
    }
    if(!result && page.controls.length) result=findBankMatch(page.question,bank);
    if(!result && page.controls.length) result=guessTextAnswer(page.question,page.pageText);
    if(!result) {
      renderStatus(page.question?"I don't know this one yet; please check manually.":"Waiting for a clear question.","warn");
      return;
    }

    let acted=false;
    if(result.targets?.length) {
      result.targets.forEach(o=>{acted=clickOption(o)||acted;});
    } else if(target) acted=clickOption(target);
    else if(page.options.length) {
      const matching=page.options.find(o=>normalize(o.text)===normalize(result.answer));
      if(matching)acted=clickOption(matching);
    }
    if(!acted && page.controls.length) {
      const control=page.controls.find(c=>!c.value.trim())||page.controls[0];
      acted=fillControl(control,result.answer);
    }
    const isGuess=String(result.confidence).includes("guessing");
    const preview=String(result.answer).length>90?String(result.answer).slice(0,87)+"…":String(result.answer);
    renderStatus((acted?"Applied · ":"Could not interact · ")+result.confidence+": "+preview+(result.evidence?" · evidence: "+result.evidence.slice(0,75):""),isGuess?"warn":acted?"good":"warn");
    if(acted) {
      attemptedKey=key;
      if(stored.autoNext===true)setTimeout(()=>progressAssignment(key),650);
    }
  }

  async function learnVerifiedAnswer() {
    const body=normalize(document.body?.innerText||"");
    if(!/\b(correct|thats right|well done|mark scheme|correct answer)\b/.test(body))return;
    const page=readPage();
    if(!page.question)return;
    const chosen=page.options.find(o=>o.el.getAttribute("aria-checked")==="true"||o.el.getAttribute("aria-pressed")==="true"||o.el.getAttribute("data-selected")==="true"||/selected|correct/i.test(o.el.getAttribute("class")||""));
    if(!chosen)return;
    const data=await chrome.storage.local.get(["answerBank"]);
    const bank=Array.isArray(data.answerBank)?data.answerBank:[];
    if(bank.some(e=>normalize(e.question)===normalize(page.question)))return;
    bank.push({question:page.question,answer:chosen.text,learned:true});
    await chrome.storage.local.set({answerBank});
  }

  document.addEventListener("click",async event=>{
    const el=event.target?.closest?.("button,[role=button],a");
    if(!el||el.closest("#asen-status"))return;
    const label=normalize(textOf(el)||el.getAttribute("aria-label")||"");
    if(["start assignment","start activity","begin assignment","start"].includes(label)) {
      await chrome.storage.local.set({autoSelect:true,autoNext:true,assignmentAutoStart:true});
      attemptedKey="";progressed.clear();
      renderStatus("Assignment started — attempting supported questions automatically.","good");
      setTimeout(()=>run().catch(()=>{}),300);
    }
  },true);

  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{run().catch(()=>{});learnVerifiedAnswer().catch(()=>{});},450);};
  new MutationObserver(records=>{
    if(records.some(r=>{const t=r.target.nodeType===1?r.target:r.target.parentElement;return !t||!t.closest("#asen-status");}))schedule();
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  chrome.storage.onChanged.addListener(schedule);
  schedule();
})();