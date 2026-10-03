import { buildStylePackage, mergeStylePackage, parseStylePackage, PAPA_PROFILE_NAME } from './style-package.mjs';
const STORAGE_KEY = 'ritter-kunibert-erzaehlerschmiede-v1';
const TOKEN_KEY = 'ritter-kunibert-demo-token';
const DEFAULT_DATA = {
  currentProfileId: 'papa-og',
  mode: 'chat',
  profiles: [
    {
      id: 'papa-og', name: PAPA_PROFILE_NAME, kind: 'kunibert',
      style: 'Mündlich, ruhig und warm. Kurze, klare Sätze; sinnliche Bilder; ein wenig verschmitzt. Spannung entsteht durch Rätsel und Klugheit, nicht durch Härte. Vertraute Stationen dürfen wiederkehren, aber jede Geschichte erhält kleine neue Begebenheiten.',
      references: [], feedback: [], messages: [],
    },
    {
      id: 'my-storyteller', name: 'Mein Erzähler', kind: 'personal',
      style: 'Warm, anschaulich und freundlich. Passe Rhythmus, Wortwahl und Humor an meine freigegebenen Beispiele an.',
      references: [], feedback: [], messages: [],
    },
  ],
};
const $ = (selector) => document.querySelector(selector);
const ui = {
  gate: $('#accessGate'), gateForm: $('#accessForm'), gateError: $('#gateError'), accessCode: $('#accessCode'),
  shell: $('#appShell'), profileList: $('#profileList'), activeProfileName: $('#activeProfileName'),
  cardProfileName: $('#cardProfileName'), profileStatus: $('#profileStatus'), profileCardCopy: $('#profileCardCopy'),
  exampleCount: $('#exampleCount'), meterFill: $('#meterFill'), profileAvatar: $('#profileAvatar'), exampleList: $('#exampleList'),
  conversation: $('#conversation'), input: $('#messageInput'), send: $('#sendButton'), mic: $('#micButton'),
  micHint: $('#micHint'), voiceStatus: $('#voiceStatus'), stopSpeech: $('#stopSpeechButton'),
  typing: $('#typingIndicator'), modeEyebrow: $('#modeEyebrow'), pageTitle: $('#pageTitle'),
  pageDescription: $('#pageDescription'), workshopNudge: $('#workshopNudge'), promptStrip: $('#promptStrip'),
  profileDialog: $('#profileDialog'), profileForm: $('#profileForm'), profileNameInput: $('#profileNameInput'),
  profileStyleInput: $('#profileStyleInput'), dataDialog: $('#dataDialog'), toast: $('#toast'),
  exportStyleButton: $('#exportStyleButton'), importStyleButton: $('#importStyleButton'), stylePackageFile: $('#stylePackageFile'),
};
let data = readData();
let activeMode = data.mode || 'chat';
let token = sessionStorage.getItem(TOKEN_KEY) || '';
let listening = false;
let activeRecognition = null;
let toastTimer;

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.profiles) && saved.profiles.length) {
      const papa = saved.profiles.find((profile) => profile.id === 'papa-og');
      if (papa?.name === 'Papa OG') papa.name = PAPA_PROFILE_NAME;
      return saved;
    }
  } catch { /* beschädigter lokaler Stand wird durch Startprofile ersetzt */ }
  return cloneDefaults();
}
function saveData() {
  data.mode = activeMode;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { showToast('Der lokale Speicher ist voll. Exportiere oder entferne alte Beispiele.'); }
}
function currentProfile() {
  return data.profiles.find((profile) => profile.id === data.currentProfileId) || data.profiles[0];
}
function setGate(open) {
  ui.gate.setAttribute('aria-hidden', String(!open));
  ui.shell.inert = open;
  if (open) ui.accessCode.focus();
}
async function unlock(value) {
  const response = await fetch('/api/unlock', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Freischaltung fehlgeschlagen.');
  token = value;
  sessionStorage.setItem(TOKEN_KEY, token);
  setGate(false);
  render();
  showToast('Willkommen in der Werkstatt.');
}
async function verifySession() {
  if (!token) return setGate(true);
  const response = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    return setGate(true);
  }
  setGate(false);
  render();
}
function escapeText(text) { return String(text ?? ''); }
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}
function renderProfileList() {
  ui.profileList.replaceChildren();
  for (const profile of data.profiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `profile-item${profile.id === data.currentProfileId ? ' active' : ''}`;
    button.setAttribute('aria-current', profile.id === data.currentProfileId ? 'true' : 'false');
    const avatar = document.createElement('span');
    avatar.className = `profile-avatar${profile.kind === 'personal' ? ' personal' : ''}`;
    avatar.textContent = profile.name.trim().slice(0, 1).toUpperCase() || 'E';
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = profile.name;
    const sub = document.createElement('small');
    sub.textContent = profile.kind === 'kunibert' ? 'Kunibert · Startprofil' : `${profile.references.length} Stilbeispiele`;
    text.append(title, sub); button.append(avatar, text);
    button.addEventListener('click', () => {
      data.currentProfileId = profile.id;
      saveData(); render();
    });
    ui.profileList.append(button);
  }
}
function renderProfileCard() {
  const profile = currentProfile();
  const isPapa = profile.kind === 'kunibert';
  ui.activeProfileName.textContent = profile.name;
  ui.cardProfileName.textContent = profile.name;
  ui.profileAvatar.textContent = profile.name.trim().slice(0, 1).toUpperCase() || 'E';
  ui.profileAvatar.classList.toggle('personal', !isPapa);
  ui.profileStatus.textContent = isPapa
    ? (profile.references.length ? `Stilprofil · ${profile.references.length} freigegebene Beispiele` : 'Startprofil · noch ohne echte Papa-Dialoge')
    : (profile.references.length ? `Persönliches Profil · ${profile.references.length} Stilbeispiele` : 'Persönliches Startprofil');
  ui.profileCardCopy.textContent = isPapa
    ? 'Ein warmes Kunibert-Grundprofil aus den vorhandenen Projekt-Prompts. Es behauptet nicht, Papas Originalstil zu rekonstruieren.'
    : 'Deine eigenen Stilwünsche und freigegebenen Beispiele formen diesen Erzähler – lokal in diesem Browser.';
  ui.exampleCount.textContent = String(profile.references.length);
  ui.meterFill.style.width = `${Math.min(100, profile.references.length * 12)}%`;
  ui.exampleList.replaceChildren();
  profile.references.forEach((reference, index) => {
    const row = document.createElement('div'); row.className = 'example-row';
    const text = document.createElement('span'); text.textContent = reference.length > 64 ? `${reference.slice(0, 64)}…` : reference;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'example-remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Beispiel ${index + 1} entfernen`);
    remove.addEventListener('click', () => { profile.references.splice(index, 1); saveData(); render(); showToast('Stilbeispiel entfernt.'); });
    row.append(text, remove); ui.exampleList.append(row);
  });
  ui.workshopNudge.textContent = isPapa ? 'Was macht Papas Geschichten unverwechselbar?' : `Was soll ${profile.name} besonders gut können?`;
}
function renderMode() {
  document.querySelectorAll('.mode-tab').forEach((button) => {
    const selected = button.dataset.mode === activeMode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  const copy = {
    chat: { eyebrow: 'DIE ERZÄHLERSTIMME AUSWÄHLEN', title: 'Geschichten bekommen<br><em>eine eigene Stimme.</em>', description: 'Wähle einen Erzähler, sprich oder schreibe los. Mit jedem freigegebenen Beispiel wird sein Stil genauer.', placeholder: 'Was soll die Geschichte erleben?' },
    story: { eyebrow: 'EINE GESCHICHTE BEGINNT', title: 'Ein Faden aus Worten.<br><em>Und du mittendrin.</em>', description: 'Gib den ersten Einfall vor. Dein Erzähler spinnt ihn weiter – und du lenkst die Geschichte mit.', placeholder: 'Wo soll Kuniberts Weg diesmal hinführen?' },
    forge: { eyebrow: 'DIE ERZÄHLERSCHMIEDE', title: 'Stil entsteht im<br><em>gemeinsamen Erzählen.</em>', description: 'Stelle Fragen, gib Textbeispiele frei und forme einen Erzähler. Nichts wird ohne deine Zustimmung zum Stilbeispiel.', placeholder: 'Erzähl, was an einer guten Geschichte hängenbleiben soll …' },
  }[activeMode];
  ui.modeEyebrow.textContent = copy.eyebrow;
  ui.pageTitle.innerHTML = copy.title;
  ui.pageDescription.textContent = copy.description;
  ui.input.placeholder = copy.placeholder;
  ui.promptStrip.hidden = activeMode === 'chat';
  if (activeMode === 'forge') {
    const prompts = currentProfile().kind === 'kunibert'
      ? ['Wie begann Papa eine Kunibert-Geschichte?', 'Wie machte er Spannung, ohne Angst zu machen?', 'Welche Sätze oder Bilder sind typisch für ihn?']
      : ['Welche Stimmung soll dein Erzähler tragen?', 'Wie soll er mit Spannung umgehen?', 'Wie soll sich ein gutes Ende anfühlen?'];
    ui.promptStrip.replaceChildren(...prompts.map((prompt) => {
      const button = document.createElement('button'); button.className = 'prompt-chip'; button.type = 'button'; button.dataset.prompt = prompt; button.textContent = prompt; return button;
    }));
  }
  if (activeMode === 'story') {
    ui.promptStrip.replaceChildren(...[
      'Ein neuer Morgen im Dachzimmer', 'Ein Hinweis der Hexe', 'Kunibert und ein verschwundener Gegenstand',
    ].map((prompt) => {
      const button = document.createElement('button'); button.className = 'prompt-chip'; button.type = 'button'; button.dataset.prompt = prompt; button.textContent = prompt; return button;
    }));
  }
}
function renderConversation() {
  const profile = currentProfile();
  const messages = Array.isArray(profile.messages) ? profile.messages : [];
  ui.conversation.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const inner = document.createElement('div');
    const mark = document.createElement('div'); mark.className = 'empty-mark'; mark.textContent = '✳';
    const title = document.createElement('strong'); title.textContent = activeMode === 'forge' ? 'Hier beginnt das gemeinsame Lernen.' : 'Ein leeres Blatt wartet.';
    const description = document.createElement('p'); description.textContent = activeMode === 'forge'
      ? 'Sprich oder schreibe. Wenn ein Satz wirklich den Stil trifft, gib ihn ausdrücklich frei.'
      : 'Wähle eine Idee, stelle eine Frage oder drücke das Mikrofon.';
    inner.append(mark, title, description); empty.append(inner); ui.conversation.append(empty); return;
  }
  for (const message of messages.slice(-40)) {
    const row = document.createElement('article'); row.className = `message ${message.role === 'user' ? 'user' : 'assistant'}`;
    const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = message.role === 'user' ? 'Du' : profile.name.slice(0, 1);
    const wrap = document.createElement('div'); wrap.className = 'bubble-wrap';
    const meta = document.createElement('p'); meta.className = 'message-meta'; meta.textContent = message.role === 'user' ? 'DEIN BEITRAG' : profile.name.toUpperCase();
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = escapeText(message.content);
    wrap.append(meta, bubble);
    if (message.role === 'assistant') {
      const tools = document.createElement('div'); tools.className = 'message-tools';
      const speak = document.createElement('button'); speak.type = 'button'; speak.textContent = 'Vorlesen'; speak.addEventListener('click', () => speakText(message.content));
      const like = document.createElement('button'); like.type = 'button'; like.textContent = 'Gefällt mir'; like.addEventListener('click', () => {
        profile.feedback.push({ rating: 'up', text: message.content, createdAt: new Date().toISOString() }); saveData(); showToast('Feedback lokal gespeichert.');
      });
      const improve = document.createElement('button'); improve.type = 'button'; improve.textContent = 'Verbessern'; improve.addEventListener('click', () => showFeedbackForm(wrap, profile, message));
      tools.append(speak, like, improve); wrap.append(tools);
    }
    if (message.role === 'user' && activeMode === 'forge') {
      const tools = document.createElement('div'); tools.className = 'message-tools';
      const approve = document.createElement('button'); approve.type = 'button';
      approve.textContent = message.approved ? '✓ Als Stilbeispiel freigegeben' : (profile.kind === 'kunibert' ? 'Als Papa-Textbeispiel freigeben' : 'Als Stilbeispiel freigeben');
      approve.disabled = Boolean(message.approved);
      approve.addEventListener('click', () => {
        profile.references.push(message.content.slice(0, 700)); profile.references = profile.references.slice(-5);
        message.approved = true; saveData(); render(); showToast('Freigegebenes Beispiel ist lokal gespeichert.');
      });
      tools.append(approve); wrap.append(tools);
    }
    row.append(avatar, wrap); ui.conversation.append(row);
  }
  ui.conversation.scrollTop = ui.conversation.scrollHeight;
}
function showFeedbackForm(wrap, profile, assistantMessage) {
  if (wrap.querySelector('.feedback-form')) return;
  const form = document.createElement('form'); form.className = 'feedback-form';
  const textarea = document.createElement('textarea'); textarea.rows = 3; textarea.maxLength = 700; textarea.placeholder = 'Wie hätte die Antwort besser klingen sollen?';
  const label = document.createElement('label'); const check = document.createElement('input'); check.type = 'checkbox';
  label.append(check, document.createTextNode('Korrektur als Stilbeispiel freigeben'));
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Feedback speichern';
  form.append(textarea, label, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const correction = textarea.value.trim();
    profile.feedback.push({ rating: 'improve', original: assistantMessage.content, correction, createdAt: new Date().toISOString() });
    if (check.checked && correction) profile.references = [...profile.references, correction.slice(0, 700)].slice(-5);
    saveData(); render(); showToast(check.checked && correction ? 'Feedback und Stilbeispiel lokal gespeichert.' : 'Feedback lokal gespeichert.');
  });
  wrap.append(form); textarea.focus();
}
function render() {
  renderProfileList(); renderProfileCard(); renderMode(); renderConversation();
}
function addMessage(role, content) {
  const profile = currentProfile();
  profile.messages ||= [];
  profile.messages.push({ role, content: content.slice(0, 7000), createdAt: new Date().toISOString() });
  profile.messages = profile.messages.slice(-40);
  saveData(); renderConversation();
}
async function sendMessage(explicitMessage) {
  const message = String(explicitMessage ?? ui.input.value).trim();
  if (!message || ui.send.disabled) return;
  const profile = currentProfile();
  ui.input.value = '';
  ui.input.style.height = 'auto';
  addMessage('user', message);
  ui.send.disabled = true; ui.typing.hidden = false; ui.voiceStatus.textContent = 'Der Erzähler überlegt …';
  try {
    const history = profile.messages.slice(-9, -1).map(({ role, content }) => ({ role, content }));
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message, mode: activeMode, history,
        narrator: { name: profile.name, kind: profile.kind, isKunibert: profile.kind === 'kunibert', style: profile.style, references: profile.references },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { token = ''; sessionStorage.removeItem(TOKEN_KEY); setGate(true); throw new Error('Bitte gib den Vorschau-Code erneut ein.'); }
    if (!response.ok) throw new Error(result.error || 'Die Antwort ist gerade nicht angekommen.');
    addMessage('assistant', result.text);
    speakText(result.text);
  } catch (error) {
    showToast(error.message || 'Verbindung unterbrochen.');
    ui.voiceStatus.textContent = 'Die Antwort konnte nicht geladen werden.';
  } finally {
    ui.send.disabled = false; ui.typing.hidden = true;
  }
}
function speakText(text) {
  if (!('speechSynthesis' in window)) { ui.voiceStatus.textContent = 'Vorlesen wird von diesem Browser nicht unterstützt.'; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-CH'; utterance.rate = 0.91; utterance.pitch = 0.97;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang?.toLowerCase() === 'de-ch') || voices.find((voice) => voice.lang?.toLowerCase().startsWith('de')) || null;
  utterance.onstart = () => { ui.stopSpeech.hidden = false; ui.voiceStatus.textContent = 'Erzähler liest vor …'; };
  utterance.onend = () => { ui.stopSpeech.hidden = true; ui.voiceStatus.textContent = ''; };
  utterance.onerror = () => { ui.stopSpeech.hidden = true; ui.voiceStatus.textContent = 'Vorlesen ist fehlgeschlagen.'; };
  window.speechSynthesis.speak(utterance);
}
function startListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { showToast('Spracheingabe wird hier nicht unterstützt. Du kannst schreiben.'); return; }
  if (listening) { activeRecognition?.stop(); return; }
  const recognition = new Recognition();
  activeRecognition = recognition;
  recognition.lang = 'de-CH'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    listening = true; ui.mic.classList.add('listening'); ui.mic.setAttribute('aria-label', 'Spracheingabe beenden'); ui.micHint.textContent = 'Ich höre zu …'; ui.voiceStatus.textContent = 'Mikrofon aktiv · zum Beenden erneut tippen.';
  };
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) { ui.input.value = transcript; ui.input.focus(); ui.micHint.textContent = 'Erkannt — bitte prüfen und senden'; }
  };
  recognition.onerror = (event) => { ui.voiceStatus.textContent = event.error === 'not-allowed' ? 'Mikrofonzugriff wurde nicht erlaubt.' : 'Spracheingabe konnte nicht abgeschlossen werden.'; };
  recognition.onend = () => {
    listening = false; activeRecognition = null; ui.mic.classList.remove('listening'); ui.mic.setAttribute('aria-label', 'Spracheingabe starten');
    if (!ui.input.value) ui.micHint.textContent = 'Zum Sprechen antippen';
    if (ui.voiceStatus.textContent.startsWith('Mikrofon aktiv')) ui.voiceStatus.textContent = 'Text prüfen und auf Senden drücken.';
  };
  recognition.start();
}
function createProfile() {
  const name = ui.profileNameInput.value.trim();
  if (!name) return;
  const profile = {
    id: `narrator-${crypto.randomUUID()}`, name, kind: 'personal',
    style: ui.profileStyleInput.value.trim() || 'Warm, anschaulich und freundlich. Lerne nur aus Beispielen, die ich ausdrücklich freigebe.',
    references: [], feedback: [], messages: [],
  };
  data.profiles.push(profile); data.currentProfileId = profile.id; activeMode = 'forge';
  saveData(); ui.profileDialog.close(); ui.profileForm.reset(); render(); showToast(`${name} ist angelegt.`);
}
function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
function exportData() {
  downloadJson({ exportedAt: new Date().toISOString(), ...data }, 'erzaehlerschmiede-backup.json');
  showToast('Vollständiges Backup heruntergeladen. Es enthält auch Chats und Feedback.');
}
function exportStyle() {
  try {
    downloadJson(buildStylePackage(currentProfile()), 'erzaehlerschmiede-stilpaket.json');
    showToast('Stilpaket heruntergeladen — nur freigegebene Beispiele, keine Chats.');
  } catch (error) {
    showToast(error.message);
  }
}
async function importStyle(file) {
  if (!file) return;
  try {
    if (file.size > 64 * 1024) throw new Error('Das Stilpaket ist größer als 64 KB.');
    const packageProfile = parseStylePackage(JSON.parse(await file.text()));
    const existing = data.profiles.some((profile) => profile.kind === packageProfile.kind && profile.name.trim().toLocaleLowerCase() === packageProfile.name.toLocaleLowerCase());
    const details = existing
      ? 'Nur neue Stilbeispiele werden ergänzt; dein lokaler Stil, Chat und Feedback bleiben erhalten.'
      : 'Ein neues Profil wird angelegt; Gespräche und Feedback werden nicht importiert.';
    if (!window.confirm(`Stilpaket „${packageProfile.name}“ mit ${packageProfile.references.length} freigegebenen Beispielen importieren?\n\n${details}`)) return;
    const result = mergeStylePackage(data, packageProfile);
    data.currentProfileId = result.profile.id; activeMode = 'forge'; saveData(); render();
    showToast(result.added ? `${result.added} Stilbeispiele ${result.created ? 'importiert' : 'ergänzt'}.` : 'Es waren keine neuen Stilbeispiele enthalten.');
  } catch (error) {
    showToast(error.message || 'Das Stilpaket konnte nicht importiert werden.');
  } finally {
    ui.stylePackageFile.value = '';
  }
}
function clearLocalData() {
  if (!window.confirm('Alle lokalen Erzählerprofile, Beispiele, Rückmeldungen und Gesprächsverläufe auf diesem Gerät löschen?')) return;
  localStorage.removeItem(STORAGE_KEY); data = cloneDefaults(); activeMode = 'chat'; saveData(); ui.dataDialog.close(); render(); showToast('Lokale Werkstattdaten wurden gelöscht.');
}

ui.gateForm.addEventListener('submit', async (event) => {
  event.preventDefault(); ui.gateError.textContent = '';
  try { await unlock(ui.accessCode.value.trim()); ui.accessCode.value = ''; }
  catch (error) { ui.gateError.textContent = error.message; }
});
ui.send.addEventListener('click', () => sendMessage());
ui.input.addEventListener('input', () => { ui.input.style.height = 'auto'; ui.input.style.height = `${Math.min(ui.input.scrollHeight, 130)}px`; });
ui.input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
ui.mic.addEventListener('click', startListening);
ui.stopSpeech.addEventListener('click', () => { window.speechSynthesis?.cancel(); ui.stopSpeech.hidden = true; ui.voiceStatus.textContent = 'Vorlesen gestoppt.'; });
document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => { activeMode = button.dataset.mode; saveData(); renderMode(); renderConversation(); }));
document.addEventListener('click', (event) => {
  const promptButton = event.target.closest('[data-prompt]');
  if (promptButton) { ui.input.value = promptButton.dataset.prompt; ui.input.focus(); }
});
$('#newProfileButton').addEventListener('click', () => ui.profileDialog.showModal());
$('#profileForm').addEventListener('submit', (event) => { event.preventDefault(); createProfile(); });
$('#createProfileSubmit').addEventListener('click', (event) => { event.preventDefault(); createProfile(); });
$('#trainProfileButton').addEventListener('click', () => { activeMode = 'forge'; saveData(); renderMode(); renderConversation(); ui.input.focus(); });
$('#workshopCard').addEventListener('click', () => { activeMode = 'forge'; saveData(); renderMode(); renderConversation(); ui.input.focus(); });
$('#manageDataButton').addEventListener('click', () => ui.dataDialog.showModal());
$('#exportButton').addEventListener('click', exportData);
ui.exportStyleButton.addEventListener('click', exportStyle);
ui.importStyleButton.addEventListener('click', () => ui.stylePackageFile.click());
ui.stylePackageFile.addEventListener('change', () => importStyle(ui.stylePackageFile.files?.[0]));
$('#clearDataButton').addEventListener('click', clearLocalData);
verifySession();
