/* ── State ────────────────────────────────────────────── */
let ideas = [];       // { id, text, timestamp, subIdeas: [], archived }
let nextId = 1;
let modalTargetId = null;
let recognition = null;
let isListeningMain = false;
let isListeningModal = false;

/* ── DOM Refs ─────────────────────────────────────────── */
const ideaInput       = document.getElementById('idea-input');
const addBtn          = document.getElementById('add-btn');
const voiceBtn        = document.getElementById('voice-btn');
const voiceStatus     = document.getElementById('voice-status');
const ideaList        = document.getElementById('idea-list');
const countBadge      = document.getElementById('count-badge');
const archiveBadge    = document.getElementById('archive-badge');
const archiveList     = document.getElementById('archive-list');
const archiveToggle   = document.getElementById('archive-toggle');
const toggleArrow     = archiveToggle.querySelector('.toggle-arrow');

const modalOverlay    = document.getElementById('modal-overlay');
const modalClose      = document.getElementById('modal-close');
const modalCancel     = document.getElementById('modal-cancel');
const modalSave       = document.getElementById('modal-save');
const modalParentText = document.getElementById('modal-parent-text');
const subIdeaTitle    = document.getElementById('sub-idea-title');
const subIdeaDetails  = document.getElementById('sub-idea-details');
const modalVoiceBtn   = document.getElementById('modal-voice-btn');
const modalVoiceStatus= document.getElementById('modal-voice-status');

/* ── Persistence ──────────────────────────────────────── */
function save() {
  localStorage.setItem('idea-backlog', JSON.stringify({ ideas, nextId }));
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem('idea-backlog'));
    if (data) { ideas = data.ideas; nextId = data.nextId; }
  } catch (_) {}
}

/* ── Render ───────────────────────────────────────────── */
function render() {
  const active   = ideas.filter(i => !i.archived);
  const archived = ideas.filter(i =>  i.archived);

  countBadge.textContent   = active.length;
  archiveBadge.textContent = archived.length;

  /* Active list */
  ideaList.innerHTML = '';
  if (active.length === 0) {
    ideaList.innerHTML = '<li class="empty-state">No ideas yet. Add your first one above!</li>';
  } else {
    active.forEach(idea => ideaList.appendChild(buildCard(idea, false)));
  }

  /* Archive list */
  archiveList.innerHTML = '';
  archived.forEach(idea => archiveList.appendChild(buildCard(idea, true)));
}

function buildCard(idea, archived) {
  const li = document.createElement('li');
  li.className = 'idea-card';
  li.dataset.id = idea.id;

  const date = new Date(idea.timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  /* Sub-ideas markup */
  let subHTML = '';
  if (idea.subIdeas && idea.subIdeas.length > 0) {
    const subItems = idea.subIdeas.map(s => `
      <li class="sub-card">
        <div class="sub-card-title">${escHtml(s.title)}</div>
        ${s.details ? `<div class="sub-card-details">${escHtml(s.details)}</div>` : ''}
      </li>
    `).join('');
    subHTML = `<ul class="sub-list">${subItems}</ul>`;
  }

  const actionsHTML = archived ? '' : `
    <div class="idea-actions">
      <button class="btn-action btn-sub"     data-action="sub"     data-id="${idea.id}">+ Sub-Idea</button>
      <button class="btn-action btn-archive" data-action="archive" data-id="${idea.id}">Archive</button>
    </div>
  `;

  li.innerHTML = `
    <div class="idea-card-top">
      <div>
        <div class="idea-text">${escHtml(idea.text)}</div>
        <div class="idea-meta">${date}</div>
      </div>
    </div>
    ${subHTML}
    ${actionsHTML}
  `;
  return li;
}

function escHtml(str) {
  return str
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

/* ── Add Idea ─────────────────────────────────────────── */
function addIdea() {
  const text = ideaInput.value.trim();
  if (!text) { ideaInput.focus(); return; }
  ideas.unshift({ id: nextId++, text, timestamp: Date.now(), subIdeas: [], archived: false });
  ideaInput.value = '';
  save();
  render();
}

addBtn.addEventListener('click', addIdea);
ideaInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addIdea();
});

/* ── List Delegation ──────────────────────────────────── */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id     = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const idea   = ideas.find(i => i.id === id);
  if (!idea) return;

  if (action === 'archive') {
    idea.archived = true;
    save();
    render();
  } else if (action === 'sub') {
    openModal(idea);
  }
});

/* ── Archive Toggle ───────────────────────────────────── */
archiveToggle.addEventListener('click', () => {
  const open = !archiveList.classList.contains('hidden');
  archiveList.classList.toggle('hidden', open);
  toggleArrow.classList.toggle('open', !open);
});

/* ── Modal ────────────────────────────────────────────── */
function openModal(idea) {
  modalTargetId = idea.id;
  modalParentText.textContent = idea.text.length > 60 ? idea.text.slice(0, 60) + '…' : idea.text;
  subIdeaTitle.value   = '';
  subIdeaDetails.value = '';
  modalOverlay.classList.remove('hidden');
  subIdeaTitle.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  stopVoice(false);
  modalTargetId = null;
}

modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

modalSave.addEventListener('click', () => {
  const title   = subIdeaTitle.value.trim();
  const details = subIdeaDetails.value.trim();
  if (!title) { subIdeaTitle.focus(); return; }

  const idea = ideas.find(i => i.id === modalTargetId);
  if (idea) {
    idea.subIdeas.push({ title, details });
    save();
    render();
  }
  closeModal();
});

/* ── Speech Recognition ───────────────────────────────── */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function initRecognition(onResult, onEnd) {
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = e => {
    const transcript = e.results[0][0].transcript;
    onResult(transcript);
  };
  r.onend = onEnd;
  r.onerror = onEnd;
  return r;
}

/* Main voice button */
voiceBtn.addEventListener('click', () => {
  if (isListeningMain) {
    stopVoice(true);
    return;
  }
  if (!SpeechRecognition) {
    alert('Your browser does not support Speech Recognition. Try Chrome or Edge.');
    return;
  }
  stopVoice(false); // stop modal if running
  isListeningMain = true;
  voiceBtn.classList.add('active');
  voiceStatus.classList.remove('hidden');

  recognition = initRecognition(
    transcript => {
      const cur = ideaInput.value.trim();
      ideaInput.value = cur ? cur + ' ' + transcript : transcript;
    },
    () => {
      isListeningMain = false;
      voiceBtn.classList.remove('active');
      voiceStatus.classList.add('hidden');
    }
  );
  if (recognition) recognition.start();
});

/* Modal voice button — fills the details textarea */
modalVoiceBtn.addEventListener('click', () => {
  if (isListeningModal) {
    stopVoice(false);
    return;
  }
  if (!SpeechRecognition) {
    alert('Your browser does not support Speech Recognition. Try Chrome or Edge.');
    return;
  }
  stopVoice(true); // stop main if running
  isListeningModal = true;
  modalVoiceBtn.classList.add('active');
  modalVoiceStatus.classList.remove('hidden');

  /* Determine which field is focused; default to details */
  const target = document.activeElement === subIdeaTitle ? subIdeaTitle : subIdeaDetails;

  recognition = initRecognition(
    transcript => {
      const cur = target.value.trim();
      target.value = cur ? cur + ' ' + transcript : transcript;
    },
    () => {
      isListeningModal = false;
      modalVoiceBtn.classList.remove('active');
      modalVoiceStatus.classList.add('hidden');
    }
  );
  if (recognition) recognition.start();
});

function stopVoice(isMain) {
  if (recognition) { try { recognition.stop(); } catch(_) {} recognition = null; }
  if (isMain) {
    isListeningMain = false;
    voiceBtn.classList.remove('active');
    voiceStatus.classList.add('hidden');
  } else {
    isListeningModal = false;
    modalVoiceBtn.classList.remove('active');
    modalVoiceStatus.classList.add('hidden');
  }
}

/* ── Init ─────────────────────────────────────────────── */
load();
render();
