/* script.js - logique principale (réécrit : gestion correcte des initiaux/restants + affichage "PAUSE" pour le prochain niveau) */

let currentLevel = 0;
let timeRemaining = 0; // secondes
let totalTimeElapsed = 0; // secondes
let isRunning = false;
let isBreak = false;
let timerInterval = null;
// Key for persisting timer state across tabs
const TIMER_STATE_KEY = 'tournament_timer_state_v1';

const DEFAULT_STARTING_CHIPS = (typeof TOURNAMENT_CONFIG !== 'undefined' && TOURNAMENT_CONFIG.startingChips) ? TOURNAMENT_CONFIG.startingChips : 10000;

document.addEventListener('DOMContentLoaded', function () {
  loadStartingChips();
  initializeTournament();
  renderChipsGrid();
  updateDisplay();
  updateStatistics();
  showStartingStackModalIfNeeded();
  // restore tournament state if you want (optionnel)
  // Try to load persisted timer state (from other tab)
  try { loadTimerState(); } catch (e) { console.error('loadTimerState error', e); }
});

/* ---------------------------
   Initialisation du tournoi
----------------------------*/
function initializeTournament() {
  currentLevel = 0;
  timeRemaining = (TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels && TOURNAMENT_CONFIG.levels[0]) ? TOURNAMENT_CONFIG.levels[0].duration * 60 : 20 * 60;
  totalTimeElapsed = 0;
  isRunning = false;
  isBreak = (TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels && TOURNAMENT_CONFIG.levels[0]) ? (TOURNAMENT_CONFIG.levels[0].isBreak || false) : false;
    const tn = document.getElementById('tournamentName');
  if (tn && TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.name) tn.textContent = TOURNAMENT_CONFIG.name;
}

/* ---------------------------
   Starting chips handling
----------------------------*/
function loadStartingChips() {
  try {
    const saved = localStorage.getItem('tournament_starting_chips');
    const useAntes = localStorage.getItem('tournament_use_antes');
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val > 0) {
        TOURNAMENT_CONFIG.startingChips = val;
        // if use_antes explicitly set to '0', remove antes from levels
        if (useAntes === '0' && TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels) {
          TOURNAMENT_CONFIG.levels.forEach(l => { l.ante = 0; });
        }
        disableStackButton();
        showHeaderModifyButton();
      }
    }
  } catch (err) {
    console.error('Erreur lecture starting chips:', err);
  }
}

function showStartingStackModalIfNeeded() {
  const saved = localStorage.getItem('tournament_starting_chips');
  if (saved) return;
  const modal = document.getElementById('startingStackModal');
  if (!modal) return;
  modal.style.display = 'block';
}

function applyStartingStackChoice() {
  const radios = document.getElementsByName('startingStackOption');
  let chosen = null;
  for (const r of radios) if (r.checked) { chosen = r.value; break; }
  if (!chosen) { alert('Veuillez sélectionner une option.'); return; }

  let value = 0;
  let useAntes = true;
  if (chosen === '25000_with_antes') { value = 25000; useAntes = true; }
  else if (chosen === '20000_no_antes') { value = 20000; useAntes = false; }
  else { alert('Option inconnue.'); return; }

  // Vérifier qu'il y a au moins 1 joueur créé
  const playersJson = localStorage.getItem('tournamentPlayers');
  let playersCount = 0;
  if (playersJson) {
    try { const players = JSON.parse(playersJson); playersCount = players.length; } catch (e) { console.error(e); }
  }

  if (playersCount === 0) { alert('Vous devez créer au moins 1 joueur avant de confirmer le stack de départ.'); return; }

  TOURNAMENT_CONFIG.startingChips = value;
  try { localStorage.setItem('tournament_starting_chips', String(value)); } catch (e) { console.error(e); }
  try { localStorage.setItem('tournament_use_antes', useAntes ? '1' : '0'); } catch (e) { console.error(e); }

  // If user chose no antes, zero out ante values in levels (keep SB/BB intact)
  if (!useAntes && TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels) {
    TOURNAMENT_CONFIG.levels.forEach(l => { l.ante = 0; });
  }

  const modal = document.getElementById('startingStackModal'); if (modal) modal.style.display = 'none';
  disableStackButton(); showHeaderModifyButton();

  try { bc.postMessage({ type: 'startingStack-updated', value }); } catch (e) { }
  const startEl = document.getElementById('startingStack'); if (startEl) startEl.textContent = TOURNAMENT_CONFIG.startingChips.toLocaleString();
  updateStatistics();
}

function skipStartingStackChoice() {
  const modal = document.getElementById('startingStackModal'); if (modal) modal.style.display = 'none';
  updateDisplay();
}

function openStartingStackModal() {
  const saved = localStorage.getItem('tournament_starting_chips');
  if (saved) { alert('Le stack de départ a déjà été choisi pour ce tournoi. Utilisez le bouton "Modifier".'); return; }
  const modal = document.getElementById('startingStackModal'); if (modal) modal.style.display = 'block';
}

function showHeaderModifyButton() {
  const btn = document.getElementById('btnModifyHeaderStack');
  if (!btn) return;
  btn.style.display = 'inline-block';
  btn.onclick = () => {
    const ok = confirm('Voulez-vous vraiment modifier le stack de départ pour ce tournoi ? Cela affectera les statistiques en cours.');
    if (!ok) return;
    try { localStorage.removeItem('tournament_starting_chips'); } catch (e) { }
    enableStackButton(); openStartingStackModal(); hideHeaderModifyButton();
  };
}
function hideHeaderModifyButton() { const btn = document.getElementById('btnModifyHeaderStack'); if (btn) btn.style.display = 'none'; }
function disableStackButton() { const btn = document.getElementById('btnOpenStack'); if (btn) { btn.setAttribute('disabled', 'disabled'); btn.classList.add('disabled'); } }
function enableStackButton() { const btn = document.getElementById('btnOpenStack'); if (btn) { btn.removeAttribute('disabled'); btn.classList.remove('disabled'); } }

/* ---------------------------
   UI / Display helpers
----------------------------*/
function renderChipsGrid() {
  // Render chips grid if present; always render the large single-line chips row.
  if (typeof CHIP_COLORS === 'undefined') return;
  const grid = document.getElementById('chipsGrid');
  if (grid) {
    grid.innerHTML = '';
    CHIP_COLORS.forEach(chip => {
      const chipItem = document.createElement('div'); chipItem.className = 'chip-item';
      const chipImg = document.createElement('img');
      const pngPath = `jeton_de_${chip.value}.png`;
      const jpgPath = `jeton_de_${chip.value}.jpg`;
      chipImg.src = pngPath;
      chipImg.alt = chip.name;
      chipImg.className = 'chip-image';
      chipImg.onerror = function () { if (this.src.endsWith('.png')) this.src = jpgPath; };
      chipItem.appendChild(chipImg);
      const chipName = document.createElement('span'); chipName.className = 'chip-name'; chipName.textContent = chip.value;
      chipItem.appendChild(chipName);
      grid.appendChild(chipItem);
    });
  }
  // always render the large single-line row under next blinds
  try { renderChipsRow(); } catch (e) {}
}

function renderChipsRow() {
  const row = document.getElementById('chipsRow');
  if (!row || typeof CHIP_COLORS === 'undefined') return;
  row.innerHTML = '';
  CHIP_COLORS.forEach(chip => {
    const chipWrap = document.createElement('div'); chipWrap.className = 'chip-item';
    const img = document.createElement('img');
    img.className = 'chip-image-large';
    img.alt = chip.name;
    img.src = `jeton_de_${chip.value}.png`;
    img.onerror = function () { if (this.src.endsWith('.png')) this.src = `jeton_de_${chip.value}.jpg`; };
    chipWrap.appendChild(img);
    // only show the image (no numeric label)
    row.appendChild(chipWrap);
  });
}
function createChip(value, elementId) {
  const chip = (typeof CHIP_COLORS !== 'undefined') ? CHIP_COLORS.find(c => c.value === value) : null;
  const element = document.getElementById(elementId);
  if (!chip || !element) return;
  // Replace element content with the chip image (use png if available, fall back to jpg)
  element.innerHTML = '';
  const img = document.createElement('img');
  img.alt = chip.name;
  img.className = 'chip-image-inline';
  img.src = `jeton_de_${chip.value}.png`;
  img.onerror = function () { if (this.src.endsWith('.png')) this.src = `jeton_de_${chip.value}.jpg`; };
  element.appendChild(img);
}

/* ---------------------------
   Mise à jour de l'affichage
----------------------------*/
function updateDisplay() {
  const levelData = (TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels && TOURNAMENT_CONFIG.levels[currentLevel]) ? TOURNAMENT_CONFIG.levels[currentLevel] : { level: 1, duration: 20, sb: 100, bb: 100, ante: 0, isBreak: false };
  const currentLevelEl = document.getElementById('currentLevel'); if (currentLevelEl) currentLevelEl.textContent = levelData.level;

  const timeDisplay = document.getElementById('timeRemaining');
  if (timeDisplay) timeDisplay.textContent = formatTime(timeRemaining);

  if (timeRemaining < 60 && timeDisplay) timeDisplay.classList.add('warning'); else if (timeDisplay) timeDisplay.classList.remove('warning');

  const progressPercent = (timeRemaining / (levelData.duration * 60)) * 100;
  const progressBar = document.getElementById('progressBar'); if (progressBar) progressBar.style.width = Math.max(0, Math.min(100, progressPercent)) + '%';

  const timeElapsedEl = document.getElementById('timeElapsed'); if (timeElapsedEl) timeElapsedEl.textContent = formatElapsedTime(totalTimeElapsed);

  const sbEl = document.getElementById('currentSB'); if (sbEl) sbEl.textContent = levelData.sb.toLocaleString();
  const bbEl = document.getElementById('currentBB'); if (bbEl) bbEl.textContent = levelData.bb.toLocaleString();

  createChip(levelData.sb, 'chipSB'); createChip(levelData.bb, 'chipBB');

  const anteRow = document.getElementById('anteRow');
  if (anteRow) {
    if (levelData.ante > 0) {
      anteRow.style.display = 'block';
      const a = document.getElementById('currentAnte'); if (a) a.textContent = levelData.ante.toLocaleString();
      createChip(levelData.ante, 'chipAnte');
    } else {
      anteRow.style.display = 'none';
    }
  }

  // --- Affichage du prochain niveau (modification demandée)
  if (currentLevel < TOURNAMENT_CONFIG.levels.length - 1) {
    const nextLevel = TOURNAMENT_CONFIG.levels[currentLevel + 1];
    const nextBlindsCard = document.getElementById('nextBlindsCard');
    const nextLevelNum = document.getElementById('nextLevelNum');
    const nextBlindsText = document.getElementById('nextBlindsText');

    // Toujours afficher la carte "prochain niveau" si il y a un niveau suivant.
    if (nextBlindsCard) nextBlindsCard.style.display = 'block';

    if (nextLevel.isBreak) {
      // Prochain niveau = pause
      if (nextLevelNum) nextLevelNum.textContent = nextLevel.level;
      if (nextBlindsText) nextBlindsText.textContent = 'PROCHAIN NIVEAU : PAUSE';
    } else {
      // Prochain niveau normal : afficher les blinds
      if (nextLevelNum) nextLevelNum.textContent = nextLevel.level;
      let blinds = `${nextLevel.sb} / ${nextLevel.bb}`;
      if (nextLevel.ante > 0) blinds += ` (${nextLevel.ante})`;
      if (nextBlindsText) nextBlindsText.textContent = blinds;
    }
  } else {
    const nb = document.getElementById('nextBlindsCard'); if (nb) nb.style.display = 'none';
  }

  // Statut actuel (si on est en break pour le niveau courant)
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  if (levelData.isBreak) {
    if (statusBar) statusBar.className = 'status-bar status-break';
    if (statusText) statusText.textContent = '☕ BREAK';
    isBreak = true;
  } else {
    if (statusBar) statusBar.className = 'status-bar status-playing';
    if (statusText) statusText.textContent = '♠ EN JEU ♥';
    isBreak = false;
  }

  updateNextBreak();
  updateStatistics();
}

/* ---------------------------
   Indication du prochain break
----------------------------*/
function updateNextBreak() {
  let nextBreakLevel = null;
  if (TOURNAMENT_CONFIG && TOURNAMENT_CONFIG.levels) {
    for (let i = currentLevel + 1; i < TOURNAMENT_CONFIG.levels.length; i++) {
      if (TOURNAMENT_CONFIG.levels[i].isBreak) { nextBreakLevel = TOURNAMENT_CONFIG.levels[i].level; break; }
    }
  }
  const breakCard = document.getElementById('nextBreakCard');
  if (nextBreakLevel) {
    if (breakCard) {
      breakCard.style.display = 'block';
      const el = document.getElementById('nextBreakLevel'); if (el) el.textContent = `Niveau ${nextBreakLevel}`;
    }
  } else if (breakCard) breakCard.style.display = 'none';
}

/* ---------------------------
   Statistiques du tournoi
   - initialPlayers : comptes les profils créés EXCLUANT les désactivés,
     mais INCLUANT les éliminés (donc : isActive === true || isEliminated === true)
   - remainingPlayers : actifs ET non-éliminés (isActive === true && !isEliminated)
----------------------------*/
function updateStatistics() {
  const playersJson = localStorage.getItem('tournamentPlayers');
  let totalInitial = 0;        // joueurs initiaux (selon règle)
  let joueursRestants = 0;
  let totalRebuys = 0;

  if (playersJson) {
    try {
      const players = JSON.parse(playersJson);

      // initial : comptes tous les profils "créés" sauf les désactivés temporaires
      // On veut inclure les joueurs éliminés mais exclure les profils marqués simplement désactivés.
      totalInitial = players.filter(p => (p.isActive === true) || (p.isEliminated === true)).length;

      // restants : actifs ET non éliminés
      joueursRestants = players.filter(p => (p.isActive === true) && !p.isEliminated).length;

      // rebuys : somme des rebuys pour les joueurs actifs (comportement conservé)
      totalRebuys = players.filter(p => p.isActive === true).reduce((s, p) => s + (p.rebuys || 0), 0);

    } catch (e) {
      console.error(e);
      // fallback to config values if parsing fails
      totalInitial = TOURNAMENT_CONFIG.players || 0;
      joueursRestants = TOURNAMENT_CONFIG.currentPlayers || 0;
      totalRebuys = TOURNAMENT_CONFIG.rebuys || 0;
    }
  } else {
    totalInitial = TOURNAMENT_CONFIG.players || 0;
    joueursRestants = TOURNAMENT_CONFIG.currentPlayers || 0;
    totalRebuys = TOURNAMENT_CONFIG.rebuys || 0;
  }

  const elCurrent = document.getElementById('currentPlayers'); if (elCurrent) elCurrent.textContent = joueursRestants;
  const elTotal = document.getElementById('totalPlayers'); if (elTotal) elTotal.textContent = totalInitial;
  const elRebuys = document.getElementById('rebuys'); if (elRebuys) elRebuys.textContent = totalRebuys;
  const elStart = document.getElementById('startingStack'); if (elStart) elStart.textContent = (TOURNAMENT_CONFIG.startingChips || DEFAULT_STARTING_CHIPS).toLocaleString();

  const totalAddons = TOURNAMENT_CONFIG.addons || 0;

  // totalChips correspond au total des jetons mis en jeu : stack de départ * (initial players + rebuys + addons)
  const totalChips = (TOURNAMENT_CONFIG.startingChips || DEFAULT_STARTING_CHIPS) * (totalInitial + totalRebuys + totalAddons);

  const avgStack = joueursRestants > 0 ? Math.floor(totalChips / joueursRestants) : 0;
  const elAvg = document.getElementById('avgStack'); if (elAvg) elAvg.textContent = avgStack.toLocaleString();
}

/* ---------------------------
   Utilitaires
----------------------------*/
function formatTime(seconds) { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; }
function formatElapsedTime(seconds) { const hours = Math.floor(seconds / 3600); const mins = Math.floor((seconds % 3600) / 60); return `${hours}h ${mins.toString().padStart(2, '0')}m`; }

/* ---------------------------
   Contrôles du timer
----------------------------*/
function togglePlayPause() {
  isRunning = !isRunning;
  const btn = document.getElementById('btnPlayPause');
  const playIcon = document.getElementById('playIcon'); const pauseIcon = document.getElementById('pauseIcon'); const btnText = document.getElementById('btnPlayText');
  if (isRunning) {
    if (btn) btn.classList.add('playing');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'block';
    if (btnText) btnText.textContent = 'PAUSE';
    startTimer();
  } else {
    if (btn) btn.classList.remove('playing');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (btnText) btnText.textContent = 'DÉMARRER';
    stopTimer();
    // persist stopping
    try { saveTimerState(); } catch (e) {}
  }
}

function startTimer() {
  if (timerInterval) return;
  // store lastTick and running flag
  saveTimerState();
  timerInterval = setInterval(() => {
    // compute elapsed based on wall clock to be resilient
    const state = loadTimerStateRaw();
    const lastTick = state && state.lastTick ? state.lastTick : Date.now();
    const now = Date.now();
    const elapsedMs = now - lastTick;
    const elapsedSec = Math.floor(elapsedMs / 1000) || 1;
    // decrement by elapsedSec to keep consistent across tabs
    timeRemaining = Math.max(0, timeRemaining - elapsedSec);
    totalTimeElapsed += elapsedSec;
    // update stored lastTick
    try { const s = loadTimerStateRaw() || {}; s.lastTick = now; s.timeRemaining = timeRemaining; s.totalTimeElapsed = totalTimeElapsed; s.isRunning = true; localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(s)); } catch (e) {}
    if (timeRemaining <= 0) nextLevel();
    updateDisplay();
  }, 1000);
}
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

function nextLevel() {
  if (TOURNAMENT_CONFIG && currentLevel < TOURNAMENT_CONFIG.levels.length - 1) {
    currentLevel++;
    timeRemaining = TOURNAMENT_CONFIG.levels[currentLevel].duration * 60;
    updateDisplay();
    // Annoncer le nouveau niveau (blinds / ante)
    try {
      const levelData = TOURNAMENT_CONFIG.levels[currentLevel];
      speakLevelAnnouncement(levelData);
    } catch (e) {}
    // persist timer state across tabs
    try { saveTimerState(); } catch (e) {}
  } else {
    stopTimer();
    isRunning = false;
    alert('🏆 Tournoi terminé ! Félicitations aux gagnants !');
  }
}

// Annonce vocale du niveau courant (blinds et ante)
function speakLevelAnnouncement(levelData) {
  if (!levelData) return;
  if (!('speechSynthesis' in window)) return;
  try {
    const sb = levelData.sb || 0;
    const bb = levelData.bb || 0;
    const ante = levelData.ante || 0;
    const levelNum = levelData.level || (currentLevel + 1);

    let parts = [];
    parts.push(`Niveau ${levelNum}`);
    parts.push(`Blindes ${formatNumberForSpeech(sb)} sur ${formatNumberForSpeech(bb)}`);
    if (ante > 0) parts.push(`Ante ${formatNumberForSpeech(ante)}`);

    const msg = parts.join(', ');
    const utter = new SpeechSynthesisUtterance(msg);
    utter.lang = 'fr-FR';
    utter.rate = 0.95;
    utter.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      const frVoice = voices.find(v => /fr|fr-FR|français/i.test(v.lang) || /French/i.test(v.name));
      if (frVoice) utter.voice = frVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (e) {}
}

function formatNumberForSpeech(n) {
  // Formatte les nombres pour une prononciation plus naturelle (1000 -> "mille", sinon chiffre)
  if (n >= 1000 && n % 1000 === 0) {
    const thousands = n / 1000;
    if (thousands === 1) return 'mille';
    return `${thousands} mille`;
  }
  return `${n}`;
}

/* ---------------------------
   Réinitialisation / Paramètres
----------------------------*/
function resetTournament() {
  const ok = window.confirm('Êtes-vous sûr de vouloir réinitialiser le tournoi ?');
  if (!ok) return;
  stopTimer(); initializeTournament(); try { saveTimerState(); } catch (e) {}
  const btn = document.getElementById('btnPlayPause'); const playIcon = document.getElementById('playIcon'); const pauseIcon = document.getElementById('pauseIcon'); const btnText = document.getElementById('btnPlayText');
  if (btn) btn.classList.remove('playing'); if (playIcon) playIcon.style.display = 'block'; if (pauseIcon) pauseIcon.style.display = 'none'; if (btnText) btnText.textContent = 'DÉMARRER';
  updateDisplay();
  try { localStorage.removeItem('tournament_starting_chips'); } catch (e) { }
  TOURNAMENT_CONFIG.startingChips = DEFAULT_STARTING_CHIPS;
  enableStackButton(); hideHeaderModifyButton();
}

// Persist and load timer state helpers
function saveTimerState() {
  const payload = {
    currentLevel: currentLevel,
    timeRemaining: timeRemaining,
    totalTimeElapsed: totalTimeElapsed,
    isRunning: isRunning,
    isBreak: isBreak,
    lastTick: Date.now()
  };
  try { localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(payload)); } catch (e) { console.error('saveTimerState error', e); }
}

function loadTimerStateRaw() {
  try {
    const v = localStorage.getItem(TIMER_STATE_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function loadTimerState() {
  const s = loadTimerStateRaw();
  if (!s) return;
  try {
    // If another tab was running the timer, compute elapsed since lastTick
    currentLevel = (typeof s.currentLevel !== 'undefined') ? s.currentLevel : currentLevel;
    timeRemaining = (typeof s.timeRemaining !== 'undefined') ? s.timeRemaining : timeRemaining;
    totalTimeElapsed = (typeof s.totalTimeElapsed !== 'undefined') ? s.totalTimeElapsed : totalTimeElapsed;
    isRunning = !!s.isRunning;
    isBreak = !!s.isBreak;
    if (isRunning && s.lastTick) {
      const elapsedMs = Date.now() - s.lastTick;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      if (elapsedSec > 0) {
        timeRemaining = Math.max(0, timeRemaining - elapsedSec);
        totalTimeElapsed += elapsedSec;
      }
      // start local ticking to reflect continued running
      startTimer();
    }
    updateDisplay();
  } catch (e) { console.error('loadTimerState error', e); }
}

// Listen to storage changes from other tabs to sync play/pause/level changes
window.addEventListener('storage', (ev) => {
  if (!ev || !ev.key) return;
  if (ev.key === TIMER_STATE_KEY && ev.newValue) {
    try {
      const s = JSON.parse(ev.newValue);
      if (!s) return;
      // apply state changes
      currentLevel = (typeof s.currentLevel !== 'undefined') ? s.currentLevel : currentLevel;
      timeRemaining = (typeof s.timeRemaining !== 'undefined') ? s.timeRemaining : timeRemaining;
      totalTimeElapsed = (typeof s.totalTimeElapsed !== 'undefined') ? s.totalTimeElapsed : totalTimeElapsed;
      isBreak = !!s.isBreak;
      const wasRunning = isRunning;
      isRunning = !!s.isRunning;
      if (isRunning && !wasRunning) startTimer();
      if (!isRunning && wasRunning) { stopTimer(); }
      updateDisplay();
    } catch (e) { console.error('storage handler timer parse error', e); }
  }
});

function toggleSettings() { const modal = document.getElementById('settingsModal'); if (!modal) return; modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex'; }

/* ---------------------------
   BroadcastChannel pour updates
----------------------------*/
const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('tournament_channel') : null;
if (bc) {
  bc.onmessage = (ev) => {
    if (!ev || !ev.data) return;
    if (ev.data.type === 'players-updated') { fetchPlayersStats(); updateStatistics(); }
    else if (ev.data.type === 'startingStack-updated') {
      const val = parseInt(ev.data.value, 10);
      if (!isNaN(val) && val > 0) {
        TOURNAMENT_CONFIG.startingChips = val;
        try { localStorage.setItem('tournament_starting_chips', String(val)); } catch (e) { }
        updateDisplay(); updateStatistics();
      }
    }
  };
}

/* ---------------------------
   Lecture des joueurs & stats périodiques
   (fetchPlayersStats utilise la même logique que updateStatistics)
----------------------------*/
function fetchPlayersStats() {
  try {
    const playersData = localStorage.getItem('tournamentPlayers');
    if (!playersData) return null;
    const players = JSON.parse(playersData);

    const remaining = players.filter(p => (p.isActive === true) && !p.isEliminated).length;
    const rebuys = players.filter(p => p.isActive === true).reduce((sum, p) => sum + (p.rebuys || 0), 0);

    // initialPlayers for internal config: include eliminated but exclude simple deactivated profiles
    const initialPlayers = players.filter(p => (p.isActive === true) || (p.isEliminated === true)).length;

    TOURNAMENT_CONFIG.currentPlayers = remaining;
    TOURNAMENT_CONFIG.rebuys = rebuys;

    const elCurrent = document.getElementById('currentPlayers'); if (elCurrent) elCurrent.textContent = remaining;
    const elRebuys = document.getElementById('rebuys'); if (elRebuys) elRebuys.textContent = rebuys;

    return { remaining, rebuys, totalPlayers: players.length, initialPlayers };
  } catch (err) { console.error('fetchPlayersStats error', err); return null; }
}

/* ---------------------------
   Raccourcis clavier
----------------------------*/
document.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); nextLevel(); }
  if (e.code === 'KeyR' && e.ctrlKey) { e.preventDefault(); resetTournament(); }
});

document.addEventListener('DOMContentLoaded', () => { fetchPlayersStats(); setInterval(fetchPlayersStats, 5000); });
