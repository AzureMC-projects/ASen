const $ = (id) => document.getElementById(id);
const status = (s) => { $("status").textContent = s; };

async function load() {
  const data = await chrome.storage.local.get(["answerBank", "autoSelect", "autoNext"]);
  $("autoSelect").checked = data.autoSelect === true;
  $("autoNext").checked = data.autoNext === true;
  $("bank").value = JSON.stringify(Array.isArray(data.answerBank) ? data.answerBank : [], null, 2);
}
$("save").addEventListener("click", async () => {
  try {
    const bank = JSON.parse($("bank").value || "[]");
    if (!Array.isArray(bank) || bank.some(x => !x || typeof x.question !== "string" || typeof x.answer !== "string")) {
      throw new Error("Use an array of {question, answer} objects.");
    }
    await chrome.storage.local.set({
      answerBank: bank,
      autoSelect: $("autoSelect").checked,
      autoNext: $("autoNext").checked
    });
    status("Saved " + bank.length + " answer(s).");
  } catch (e) { status("Could not save: " + e.message); }
});
$("export").addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("bank").value || "[]");
    const blob = new Blob([JSON.stringify(parsed, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "asen-answer-bank.json"; a.click();
    URL.revokeObjectURL(url); status("Answer bank exported.");
  } catch (e) { status("Fix the JSON before exporting."); }
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  const file = $("file").files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed) || parsed.some(x => !x || typeof x.question !== "string" || typeof x.answer !== "string")) {
      throw new Error("Expected an array of question/answer objects.");
    }
    $("bank").value = JSON.stringify(parsed, null, 2);
    status("Imported " + parsed.length + " answer(s). Click Save settings to apply.");
  } catch (e) { status("Import failed: " + e.message); }
  $("file").value = "";
});
load().catch(e => status("Load failed: " + e.message));