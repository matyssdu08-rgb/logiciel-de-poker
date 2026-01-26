let players = [];

/* --------------------------------
   INITIALISATION
-------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadPlayers();

  
  renderPlayers();
  setupEventListeners();
  updateStats();
});

/* --------------------------------
   Écouteurs d'événements
-------------------------------- */
function setupEventListeners() {
  const form = document.getElementById('createPlayerForm');
  if (form) form.addEventListener('submit', handleCreatePlayer);

  const btnClear = document.getElementById('btnClear');
  if (btnClear) btnClear.addEventListener('click', () => {
    const p = document.getElementById('pseudo');
    if (p) p.value = '';
  });

  const btnReset = document.getElementById('btnReset');
  if (btnReset)
    btnReset.addEventListener('click', () => {
      if (confirm('Êtes-vous sûr de vouloir réinitialiser TOUS les joueurs ?')) {
        players = [];
        savePlayers();
        renderPlayers();
        syncWithMainPage();
        updateStats();
        alert('Tous les joueurs ont été supprimés');
      }
    });
}

/* --------------------------------
   Charger / Sauvegarder
-------------------------------- */
function loadPlayers() {
  const saved = localStorage.getItem('tournamentPlayers');
  if (saved) {
    try {
      players = JSON.parse(saved);
    } catch (e) {
      console.error('Erreur JSON joueurs :', e);
      players = [];
    }
  }
}

function savePlayers() {
  try {
    localStorage.setItem('tournamentPlayers', JSON.stringify(players));
  } catch (e) {
    console.error('Erreur sauvegarde players:', e);
  }

  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.postMessage({ type: 'players-updated' });
  } catch (e) {
  }
}

/* --------------------------------
   Création d'un joueur
-------------------------------- */
function handleCreatePlayer(e) {
  e.preventDefault();
  const pseudoInput = document.getElementById('pseudo');
  if (!pseudoInput) return;

  const pseudo = pseudoInput.value.trim();
  if (!pseudo) return alert('Le pseudo est obligatoire');
  if (players.some(p => p.pseudo.toLowerCase() === pseudo.toLowerCase()))
    return alert('Ce pseudo existe déjà');

  const startingChips =
    (typeof TOURNAMENT_CONFIG !== 'undefined'
      ? TOURNAMENT_CONFIG.startingChips
      : 10000);

  const player = {
    id: Date.now(),
    pseudo,
    chips: startingChips,
    startingChips,
    rebuys: 0,
    _rebuysHistory: 0, 
    isEliminated: false,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  players.push(player);
  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();

  pseudoInput.value = '';
  showNotification(`✅ ${pseudo} a été ajouté`);
}

/* --------------------------------
   Rendu graphique
-------------------------------- */
function renderPlayers() {
  const container = document.getElementById('playersList');
  if (!container) return;

  if (players.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; padding:2rem; color:#aaa;">Aucun joueur inscrit</p>';
    document.getElementById('playerCount').textContent = '0';
    return;
  }

  container.innerHTML = '';
  players.forEach(player => {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (player.isEliminated) row.classList.add('player-eliminated');
    if (!player.isActive) row.classList.add('player-inactive');

    /* Infos joueur */
    const info = document.createElement('div');
    info.className = 'player-info';

    const pseudo = document.createElement('div');
    pseudo.className = 'player-pseudo';
    pseudo.textContent = player.pseudo;

    const meta = document.createElement('div');
    meta.className = 'player-meta';
    meta.textContent = `Chips: ${player.chips} • Rebuys: ${player.rebuys}`;

    info.appendChild(pseudo);
    info.appendChild(meta);

    /* Actions */
    const actions = document.createElement('div');
    actions.className = 'player-actions';

    /* Bouton Rebuy */
    const btnRebuy = document.createElement('button');
    btnRebuy.className = 'btn btn-small btn-rebuy';
    btnRebuy.textContent = 'Rebuy';
    btnRebuy.title = 'Ajouter un rebuy (remet les jetons)';
    btnRebuy.onclick = () => handleRebuy(player.id);

    /* Bouton éliminer / restaurer */
    const btnElim = document.createElement('button');
    btnElim.className = 'btn btn-small';
    btnElim.textContent = player.isEliminated ? 'Restaurer' : 'Éliminer';
    btnElim.onclick = () =>
      player.isEliminated
        ? handleRestore(player.id)
        : handleEliminate(player.id);

    /* Bouton activer/desactiver */
    const btnAct = document.createElement('button');
    btnAct.className = 'btn btn-small';
    btnAct.textContent = player.isActive ? 'Désactiver' : 'Activer';
    btnAct.onclick = () =>
      player.isActive
        ? handleDeactivate(player.id)
        : handleActivate(player.id);

    /* Bouton supprimer */
    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-small';
    btnDel.textContent = 'Supprimer';
    btnDel.onclick = () => handleDelete(player.id);

    actions.append(btnRebuy, btnElim, btnAct, btnDel);

    row.append(info, actions);
    container.appendChild(row);
  });

  document.getElementById('playerCount').textContent = players.length;
}

/* --------------------------------
   Actions joueur
-------------------------------- */
function handleRebuy(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  player.rebuys = (player.rebuys || 0) + 1;
  player._rebuysHistory = (player._rebuysHistory || 0) + 1;

  // Réactiver le joueur si besoin et remettre les jetons
  player.isEliminated = false;
  player.isActive = true;
  player.chips = player.startingChips || 10000;

  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
}

function handleEliminate(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  if (!confirm(`Éliminer ${player.pseudo} ?`)) return;

  player.rebuys = 0;

  player.isEliminated = true;
  player.chips = 0;

  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
  showNotification(`❌ ${player.pseudo} éliminé`);

  // Demander explicitement un rééquilibrage des tables après élimination
  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.postMessage({ type: 'rebalance-tables' });
    // Envoyer aussi une notification d'élimination avec le pseudo
    bc.postMessage({ type: 'player-eliminated', playerId: player.id, pseudo: player.pseudo });
  } catch (e) {}

  // Fallback pour communications entre onglets via localStorage (déclenche l'événement 'storage' dans les autres onglets)
  try {
    localStorage.setItem('rebalanceTrigger', Date.now().toString());
    localStorage.setItem('lastEliminated', JSON.stringify({ id: player.id, pseudo: player.pseudo, ts: Date.now() }));
  } catch (e) {}
}

function handleRestore(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  player.isEliminated = false;
  player.chips = player.startingChips || 10000;

  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
  showNotification(`🔄 ${player.pseudo} restauré`);
}

function handleActivate(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  player.isActive = true;
  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
}

function handleDeactivate(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  if (
    !confirm(
      `Désactiver ${player.pseudo} ?\n\nIl ne comptera plus dans les stats ni tables.`
    )
  )
    return;

  player.isActive = false;
  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
}

function handleDelete(playerId) {
  const player = players.find(p => p.id === playerId);
  if (!player) return;

  if (!confirm(`Supprimer ${player.pseudo} définitivement ?`)) return;

  players = players.filter(p => p.id !== playerId);
  savePlayers();
  renderPlayers();
  syncWithMainPage();
  updateStats();
}

/* --------------------------------
   Statistiques
-------------------------------- */
function updateStats() {
  const activePlayers = players.filter(
    p => p.isActive && !p.isEliminated
  ).length;

  const eliminatedPlayers = players.filter(
    p => p.isEliminated
  ).length;

  const totalRebuys = players.reduce(
    (sum, p) => sum + (p._rebuysHistory || 0),
    0
  );

  updateStatText('activePlayers', activePlayers);
  updateStatText('eliminatedPlayers', eliminatedPlayers);
  updateStatText('totalRebuys', totalRebuys);
  updateStatText('playerCount', players.length);
}

function updateStatText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* --------------------------------
   Synchronisation vers index.html
-------------------------------- */
function syncWithMainPage() {
  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.postMessage({ type: 'players-updated' });
  } catch (e) {}
  savePlayers();
}

function showNotification(text) {
  console.log(text);
}

