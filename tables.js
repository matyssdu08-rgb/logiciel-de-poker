// -------------------------------------------------------------
// ACTIONS BOU/* tables.js - gestion des tables (version rééquilibrée avec transferts automatiques) */

let tables = [];
let playersPerTable = 9;
// Speech for transfers enabled by default; elimination announcements disabled below
let speechEnabled = true;

// -------------------------------------------------------------
// INITIALISATION
// -------------------------------------------------------------
//  Mise à jour automatique des tables lorsqu'un joueur est modifié
try {
  const bc = new BroadcastChannel('tournament_channel');
  bc.onmessage = (e) => {
    if (!e || !e.data) return;
    if (e.data.type === 'players-updated') {
      updateTablesDisplay();
    }
    if (e.data.type === 'rebalance-tables') {
      performRebalance();
    }
    if (e.data.type === 'player-eliminated') {
      // Afficher une notification brève pour signaler l'élimination
      try {
        if (e.data.pseudo) showEliminationNotification(e.data.pseudo);
      } catch (err) {}
    }
  };
} catch (e) {
  console.error('BroadcastChannel error:', e);
}

// Fallback: écouter les changements de localStorage (déclenché par l'autre onglet lors d'une élimination)
window.addEventListener('storage', function (e) {
  if (!e) return;
  if (e.key === 'rebalanceTrigger' || e.key === 'tournamentPlayers') {
    // petit délai pour laisser le stockage se stabiliser
    setTimeout(() => {
      try {
        performRebalance();
      } catch (err) {
        // en cas d'erreur, forcer mise à jour d'affichage
        updateTablesDisplay();
      }
    }, 50);
  }
  // Si un joueur vient d'être éliminé dans un autre onglet
  if (e.key === 'lastEliminated' && e.newValue) {
    try {
      const data = JSON.parse(e.newValue);
      if (data && data.pseudo) showEliminationNotification(data.pseudo);
    } catch (err) {}
  }
  // Si un transfert a été enregistré par un autre onglet
  if (e.key === 'lastTransfer' && e.newValue) {
    try {
      const t = JSON.parse(e.newValue);
      if (t && t.playerName) showTableTransferNotification(t.playerName, t.fromTable, t.toTable, false, t.seatNumber || null);
    } catch (err) {}
  }
});

// Notification simple pour une élimination
function showEliminationNotification(playerName) {
  const notification = document.createElement('div');
  notification.className = 'elimination-notification';
  notification.innerHTML = `
    <div class="elim-icon">❌</div>
    <div class="elim-text"><strong>${playerName}</strong> éliminé(e)</div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 50);
  // Lire l'annonce via TTS
  // TTS d'élimination volontairement supprimé
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Utilise l'API Web Speech pour annoncer l'élimination
function speakElimination(playerName) {
  if (!('speechSynthesis' in window)) return;
  try {
    const msg = `${playerName}, éliminé`;
    const utter = new SpeechSynthesisUtterance(msg);
    // Config voix française
    utter.lang = 'fr-FR';
    utter.rate = 0.95;
    utter.pitch = 1;

    // Choisir une voix francophone si disponible
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      const frVoice = voices.find(v => /fr|fr-FR|français/i.test(v.lang) || /French/i.test(v.name));
      if (frVoice) utter.voice = frVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', function () {
  // Restaurer la valeur choisie pour "playersPerTable" depuis localStorage ou depuis l'input
  try {
    const input = document.getElementById('playersPerTable');
    const saved = parseInt(localStorage.getItem('playersPerTable'), 10);
    if (!isNaN(saved) && saved >= 2) {
      playersPerTable = saved;
      if (input) input.value = saved;
    } else if (input) {
      playersPerTable = Math.max(2, parseInt(input.value, 10) || 8);
    }

    // Mettre à jour et mémoriser quand l'utilisateur change l'input
    if (input) {
      input.addEventListener('change', (ev) => {
        const v = Math.max(2, parseInt(ev.target.value, 10) || 8);
        playersPerTable = v;
        try { localStorage.setItem('playersPerTable', String(v)); } catch (e) {}
        // Re-render pour appliquer immédiatement le nouveau nombre de sièges
        renderTables();
      });
    }
  } catch (e) {
    // ignore
  }

  loadTables();
  renderTables();
  updateStats();

  // UI update for speech button removed per user request
});

// -------------------------------------------------------------
// CHARGEMENT DES JOUEURS ACTIFS
// -------------------------------------------------------------
function loadActivePlayers() {
  const saved = localStorage.getItem('tournamentPlayers');
  if (!saved) return [];
  try {
    const allPlayers = JSON.parse(saved);
    return allPlayers.filter(p => p.isActive && !p.isEliminated);
  } catch (e) {
    console.error('loadActivePlayers parse error', e);
    return [];
  }
}

// -------------------------------------------------------------
// MISE À JOUR DE L'AFFICHAGE (sans régénération)
// -------------------------------------------------------------
function updateTablesDisplay() {
  const activePlayers = loadActivePlayers();
  
  tables.forEach(table => {
    // Marquer les joueurs éliminés/inactifs sans les supprimer
    table.players.forEach(player => {
      if (!player) return;
      const currentPlayer = activePlayers.find(p => p.id === player.id);
      player.isDisplayed = !!currentPlayer;
    });
  });

  // Rééquilibrage automatique des tables
  autoBalanceTables();

  saveTables();
  renderTables();
  updateStats();
}

// -------------------------------------------------------------
// GÉNÉRATION DES TABLES (ÉQUILIBRÉES)
// -------------------------------------------------------------
function generateTables() {
  const activePlayers = loadActivePlayers();
  if (!activePlayers || activePlayers.length === 0) {
    alert("Aucun joueur actif trouvé. Ajoutez d'abord des joueurs.");
    return;
  }

  const input = document.getElementById('playersPerTable');
  playersPerTable = input ? Math.max(2, parseInt(input.value, 10) || 8) : 8;
  try { localStorage.setItem('playersPerTable', String(playersPerTable)); } catch (e) {}

  const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
  const total = shuffled.length;

  // Table finale auto si ≤ 9 joueurs
  if (total <= 9) {
    createFinalTable(shuffled);
    return;
  }

  // Nombre MINIMAL de tables selon la limite max
  const tableCount = Math.ceil(total / playersPerTable);

  // Taille équilibrée des tables
  const baseSize = Math.floor(total / tableCount);
  const remainder = total % tableCount;

  tables = [];
  let index = 0;

  for (let t = 0; t < tableCount; t++) {
    const size = baseSize + (t < remainder ? 1 : 0);

    const players = shuffled.slice(index, index + size).map((player, i) => ({
      ...player,
      tableNumber: t + 1,
      seatNumber: i + 1
    }));

    tables.push({
      tableNumber: t + 1,
      players,
      isFinal: false
    });

    index += size;
  }
  // Normaliser les sièges pour chaque table
  tables.forEach(t => ensureTableSlots(t));

  saveTables();
  renderTables();
  updateStats();
}

// -------------------------------------------------------------
// TABLE FINALE
// -------------------------------------------------------------
function createFinalTable(players) {
  tables = [{
    tableNumber: 1,
    isFinal: true,
    players: players.map((player, i) => ({
      ...player,
      tableNumber: 1,
      seatNumber: i + 1
    }))
  }];

  const autoMsg = document.getElementById('autoFinalMessage');
  if (autoMsg) autoMsg.style.display = 'block';

  saveTables();
  renderTables();
  updateStats();

  setTimeout(() => {
    if (autoMsg) autoMsg.style.display = 'none';
  }, 5000);
}

// -------------------------------------------------------------
// RÉÉQUILIBRAGE AUTOMATIQUE DES TABLES
// -------------------------------------------------------------
function performRebalance() {
  console.log('performRebalance() appelée');
  loadTables();
  // s'assurer des slots valides
  tables.forEach(t => ensureTableSlots(t));
  console.log('Tables chargées:', tables.length);
  autoBalanceTables();
  saveTables();
  renderTables();
  updateStats();
}

function autoBalanceTables() {
  console.log('autoBalanceTables() appelée');
  
  // Ignorer si c'est une table finale ou s'il n'y a qu'une seule table
  if (tables.length <= 1) {
    console.log('Une seule table ou aucune table, rééquilibrage ignoré');
    return;
  }
  
  if (tables.some(t => t.isFinal)) {
    console.log('Table finale détectée, rééquilibrage ignoré');
    return;
  }

  const activePlayers = loadActivePlayers();
  console.log('Joueurs actifs:', activePlayers.length);
  
  // Calculer le nombre de joueurs actifs par table
  const tableSizes = tables.map(table => {
    const activeCount = table.players.filter(p => p && activePlayers.some(ap => ap.id === p.id)).length;
    return { table, activeCount };
  });

  console.log('Tailles des tables:', tableSizes.map(t => `Table ${t.table.tableNumber}: ${t.activeCount} joueurs`));

  // Trier par nombre de joueurs (du plus grand au plus petit)
  tableSizes.sort((a, b) => b.activeCount - a.activeCount);

  const maxTable = tableSizes[0];
  // Trouver la table destination minimale qui a une place disponible (indice < playersPerTable)
  function tableHasAvailableSeat(tableObj) {
    const t = tableObj.table;
    for (let i = 0; i < playersPerTable; i++) {
      if (i >= t.players.length) return true; // place libre à la fin
      const p = t.players[i];
      // considérer siège disponible si vide (null) ou si le joueur n'est plus actif
      if (!p || !p.id) return true;
      const stillActive = activePlayers && activePlayers.some(ap => ap.id === p.id);
      if (!stillActive) return true;
    }
    return false;
  }

  // Rechercher la table avec le plus petit activeCount qui possède une place libre
  const candidateMins = tableSizes.slice().reverse().filter(ts => tableHasAvailableSeat(ts));
  const minTable = candidateMins.length ? candidateMins[0] : tableSizes[tableSizes.length - 1];
  
  const difference = maxTable.activeCount - minTable.activeCount;
  console.log(`Différence entre tables: ${difference} (max: ${maxTable.activeCount}, min: ${minTable.activeCount})`);

  // Vérifier s'il y a une différence de 2 joueurs ou plus
  if (difference >= 2) {
    console.log('Différence >= 2, déplacement de joueur...');
    
    // Trouver TOUS les joueurs actifs de la table avec le plus de joueurs
    const activePlayers_inMaxTable = maxTable.table.players.filter(p => p && activePlayers.some(ap => ap.id === p.id));
    
    console.log('Joueurs actifs dans la table max:', activePlayers_inMaxTable.map(p => p.pseudo));
    
    // Choisir un joueur ALÉATOIREMENT parmi les joueurs actifs
    const randomIndex = Math.floor(Math.random() * activePlayers_inMaxTable.length);
    const playerToMove = activePlayers_inMaxTable[randomIndex];

    if (playerToMove) {
      console.log(`Joueur sélectionné pour déplacement: ${playerToMove.pseudo}`);
      
      // Retirer le joueur de l'ancienne table
      const oldTableNum = maxTable.table.tableNumber;
      const newTableNum = minTable.table.tableNumber;

      // Si la table de destination n'a pas de place (candidateMins vide), annuler
      if (!tableHasAvailableSeat(minTable)) {
        console.log('La table de destination ne possède pas de siège libre. Annulation du déplacement.');
        return;
      }

      // Ne pas réordonner les joueurs de la table source : remplacer sa position par une place vide
      const idxInOld = maxTable.table.players.findIndex(p => p && p.id === playerToMove.id);
      if (idxInOld !== -1) {
        // conserver la longueur du tableau, marquer le siège comme vide
        maxTable.table.players[idxInOld] = null;
      } else {
        // fallback : si non trouvé, retirer sans réordonner (sécurité)
        maxTable.table.players = maxTable.table.players.filter(p => p && p.id !== playerToMove.id);
      }

      // Diagnostic: afficher état des tables et configuration
      try {
        console.log('playersPerTable:', playersPerTable);
        console.log(`Source table ${maxTable.table.tableNumber} players length:`, maxTable.table.players.length);
        console.log(`Dest table ${minTable.table.tableNumber} players length:`, minTable.table.players.length);
        const empties = [];
          for (let ii = 0; ii < Math.max(minTable.table.players.length, playersPerTable); ii++) {
            const p = minTable.table.players[ii];
            const isActiveSeat = p && p.id && activePlayers && activePlayers.some(ap => ap.id === p.id);
            if (!p || !p.id || !isActiveSeat) empties.push(ii);
          }
        console.log('Dest empty seat indices (first 0..playersPerTable-1):', empties.filter(i => i < playersPerTable));
      } catch (e) {}

      // Trouver le premier siège vide dans la table de destination (indices 0..playersPerTable-1)
      let emptyIndex = -1;
      for (let ii = 0; ii < playersPerTable; ii++) {
        if (ii >= minTable.table.players.length) { emptyIndex = ii; break; }
        const p = minTable.table.players[ii];
        const isActiveSeat = p && p.id && activePlayers && activePlayers.some(ap => ap.id === p.id);
        if (!p || !p.id || !isActiveSeat) { emptyIndex = ii; break; }
      }

      let cannotMove = false;
      // Si aucun index vide trouvé dans la plage 0..playersPerTable-1
      if (emptyIndex === -1) {
        // table pleine selon la configuration
        console.log('Aucune place libre trouvée dans les indices 0..playersPerTable-1 de la table de destination. Déplacement annulé.');
        cannotMove = true;
      }

      // Insérer le joueur à l'index trouvé et mettre à jour son numéro de siège et table
      // Si l'index est au-delà de la longueur, pousser jusqu'à atteindre cet index
      if (cannotMove) {
        // si on ne peut pas déplacer, restaurer l'ancienne position (au cas où on l'avait mis à null)
        if (typeof idxInOld !== 'undefined' && idxInOld !== -1) {
          maxTable.table.players[idxInOld] = playerToMove;
        }
        return;
      }

      if (emptyIndex >= minTable.table.players.length) {
        // n'ajouter un siège que si on reste en-dessous de playersPerTable
        if (minTable.table.players.length < playersPerTable) {
          // remplir les trous éventuels avec null
          while (minTable.table.players.length < emptyIndex) minTable.table.players.push(null);
          minTable.table.players.push({
            ...playerToMove,
            tableNumber: newTableNum,
            seatNumber: emptyIndex + 1
          });
        } else {
          // shouldn't happen due to cannotMove, but guard anyway
          console.warn('Impossible d\'ajouter un siège: limite atteinte');
          if (typeof idxInOld !== 'undefined' && idxInOld !== -1) {
            maxTable.table.players[idxInOld] = playerToMove;
          }
          return;
        }
      } else {
        minTable.table.players[emptyIndex] = {
          ...playerToMove,
          tableNumber: newTableNum,
          seatNumber: emptyIndex + 1
        };
      }

      // S'assurer de la longueur minimale de la table (prévenir indices manquants)
      ensureTableSlots(maxTable.table);
      ensureTableSlots(minTable.table);

      // Supprimer tout autre occurence éventuelle du joueur dans toutes les tables
      try {
        const movedId = playerToMove.id;
        tables.forEach(t => {
          for (let si = 0; si < t.players.length; si++) {
            const seat = t.players[si];
            if (seat && seat.id === movedId) {
              // si ce n'est pas la destination (tableNumber/new index), supprimer
              if (!(t.tableNumber === newTableNum && si === emptyIndex)) {
                t.players[si] = null;
              }
            }
          }
        });
      } catch (e) { console.error('Erreur suppression duplicata:', e); }

      // Recalculez seatNumber de chaque joueur selon son index pour consistance
      tables.forEach(t => {
        for (let si = 0; si < t.players.length; si++) {
          const p = t.players[si];
          if (p && p.id) {
            p.seatNumber = si + 1;
            p.tableNumber = t.tableNumber;
          }
        }
      });

      // Forcer sauvegarde et rerender immédiatement pour que le joueur apparaisse
      try { saveTables(); } catch (e) { console.error(e); }
      try { renderTables(); updateStats(); } catch (e) { console.error(e); }

      console.log(`${playerToMove.pseudo} déplacé de Table ${oldTableNum} vers Table ${newTableNum} (siège ${emptyIndex + 1})`);

      // Afficher notification + log incluant le numéro de siège (et persister)
      showTableTransferNotification(playerToMove.pseudo, oldTableNum, newTableNum, true, emptyIndex + 1);
    }
  } else {
    console.log('Différence < 2, pas de rééquilibrage nécessaire');
  }
}

// -------------------------------------------------------------
// NOTIFICATION DE TRANSFERT DE TABLE
// -------------------------------------------------------------
function showTableTransferNotification(playerName, fromTable, toTable, persist = true, seatNumber = null) {
  // Eviter les doublons si l'affichage est déclenché via storage/polling
  if (!persist) {
    try {
      const last = localStorage.getItem('lastTransfer');
      if (last) {
        const parsed = JSON.parse(last);
        if (parsed && parsed.playerName && String(parsed.playerName) === String(playerName) && String(parsed.fromTable) === String(fromTable) && String(parsed.toTable) === String(toTable)) {
          // même transfert déjà enregistré/affiché -> ignorer
          return;
        }
      }
    } catch (e) {}
  }
  const notification = document.createElement('div');
  notification.className = 'table-transfer-notification';
  notification.innerHTML = `
    <div class="transfer-icon">🔄</div>
    <div class="transfer-text">
      <strong>${playerName}</strong> déplacé(e)<br>
      Table ${fromTable} → Table ${toTable}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animation d'entrée
  setTimeout(() => notification.classList.add('show'), 100);
  
  // Suppression après 5 secondes
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 5000);

  // Enregistrer le dernier transfert dans localStorage pour persistance/fallback
  if (persist) {
    try {
      const payload = { playerName, fromTable, toTable, seatNumber, ts: Date.now() };
      localStorage.setItem('lastTransfer', JSON.stringify(payload));
    } catch (e) {}
  }

  // Annoncer vocalement le transfert si c'est un transfert réel
  if (persist) {
    try { speakTransfer(playerName, fromTable, toTable, seatNumber); } catch (e) {}
  }

  // Ajouter une ligne au log visible (si présent)
  try {
    const log = document.getElementById('transferLogEntries');
    if (log) {
      const entry = document.createElement('div');
      const time = new Date().toLocaleTimeString();
      const seatText = seatNumber ? ` (siège ${seatNumber})` : '';
      entry.textContent = `${time} — ${playerName} déplacé(e) : Table ${fromTable} → Table ${toTable}${seatText}`;
      log.prepend(entry);
      // garder au maximum 6 entrées
      while (log.children.length > 6) log.removeChild(log.lastChild);
    }
  } catch (e) {}
}

// -------------------------------------------------------------
// ACTIONS BOUTONS
// -------------------------------------------------------------
function redistributeTables() {
  if (!confirm("Redistribuer toutes les tables ?")) return;
  generateTables();
}

function resetTables() {
  if (!confirm("Réinitialiser toutes les tables ?")) return;
  tables = [];
  saveTables();
  renderTables();
  updateStats();
}

// -------------------------------------------------------------
// AFFICHAGE DES TABLES
// -------------------------------------------------------------
function renderTables() {
  const container = document.getElementById('tablesContainer');
  const emptyState = document.getElementById('emptyState');
  
  if (!container) return;
  container.innerHTML = '';

  if (!tables.length) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  tables.forEach(table => container.appendChild(createTableCard(table)));
}

// -------------------------------------------------------------
// CARTE D'UNE TABLE
// -------------------------------------------------------------
function createTableCard(table) {
  const card = document.createElement('div');
  card.className = `table-card ${table.isFinal ? 'final-table' : ''}`;

  const activePlayers = loadActivePlayers();
  const displayedCount = table.players.filter(p => {
    if (!p) return false;
    const current = activePlayers.find(ap => ap.id === p.id);
    return !!current;
  }).length;

  const header = document.createElement('div');
  header.className = 'table-header';
  header.innerHTML = `
    <div class="table-number">${table.isFinal ? '🏆 Table Finale' : `Table ${table.tableNumber}`}</div>
    <div class="table-count">${displayedCount} joueur(s) actif(s)</div>
  `;
  card.appendChild(header);

  const pokerTable = document.createElement('div');
  pokerTable.className = 'poker-table';

  const center = document.createElement('div');
  center.className = 'table-center';
  center.innerHTML = `
    <div class="table-center-icon">${table.isFinal ? '🏆' : '♠️'}</div>
    <div class="table-center-text">${table.isFinal ? 'FINALE' : `T${table.tableNumber}`}</div>
  `;
  pokerTable.appendChild(center);

  // Affichage jusqu'à "playersPerTable" sièges (ne pas afficher au-delà)
  for (let i = 0; i < playersPerTable; i++) {
    const player = table.players[i];
    const seat = document.createElement('div');
    
    // Vérifier si le joueur est toujours actif
    let isActive = false;
    let displayName = 'Vide';
    
    if (player) {
      const currentPlayer = activePlayers.find(p => p.id === player.id);
      if (currentPlayer) {
        isActive = true;
        displayName = player.pseudo;
      }
    }
    
    seat.className = `seat ${!isActive ? 'empty' : ''}`;

    seat.innerHTML = `
      <span class="seat-number">Siège ${i + 1}</span>
      <span class="seat-player">${displayName}</span>
    `;

    pokerTable.appendChild(seat);
  }

  card.appendChild(pokerTable);

  // Positionnement circulaire
  setTimeout(() => positionSeatsInCircle(pokerTable), 50);

  return card;
}

// -------------------------------------------------------------
// POSITION CIRCULAIRE
// -------------------------------------------------------------
function positionSeatsInCircle(pokerTable) {
  const seats = pokerTable.querySelectorAll('.seat');
  if (!seats.length) return;

  const radius = pokerTable.offsetWidth / 2 - 70;
  const centerX = pokerTable.offsetWidth / 2;
  const centerY = pokerTable.offsetHeight / 2;

  seats.forEach((seat, i) => {
    const angle = (2 * Math.PI * i) / seats.length - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle) - seat.offsetWidth / 2;
    const y = centerY + radius * Math.sin(angle) - seat.offsetHeight / 2;

    seat.style.position = 'absolute';
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;
  });
}

// -------------------------------------------------------------
// STATISTIQUES
// -------------------------------------------------------------
function updateStats() {
  const activePlayers = loadActivePlayers();
  
  const totalActiveAtTables = tables.reduce((sum, table) => {
    const activeInTable = table.players.filter(p => p && (() => { const current = activePlayers.find(ap => ap.id === p.id); return !!current; })()).length;
    return sum + activeInTable;
  }, 0);

  const sc = document.getElementById('tablesCount');
  if (sc) sc.textContent = tables.length;

  const pt = document.getElementById('playersAtTables');
  if (pt) pt.textContent = totalActiveAtTables;
}

// -------------------------------------------------------------
// NETTOYAGE MANUEL DES SIÈGES VIDES
// -------------------------------------------------------------
function cleanTablesFromEliminatedPlayers() {
  if (!confirm("Voulez-vous supprimer définitivement tous les sièges vides des joueurs éliminés ?")) return;
  
  const activePlayers = loadActivePlayers();

  tables.forEach(table => {
    table.players = table.players.filter(p =>
      activePlayers.some(ap => ap.id === p.id)
    );
  });

  saveTables();
  renderTables();
  updateStats();
  
  alert("Les sièges vides ont été nettoyés !");
}

// -------------------------------------------------------------
// LOCALSTORAGE
// -------------------------------------------------------------
function saveTables() {
  localStorage.setItem('tournamentTables', JSON.stringify(tables));
}

function loadTables() {
  const saved = localStorage.getItem('tournamentTables');
  try {
    tables = saved ? JSON.parse(saved) : [];
  } catch {
    tables = [];
  }
}

// Ensure table has an array of seats with defined length and no undefined holes
function ensureTableSlots(table) {
  if (!table) return;
  if (!Array.isArray(table.players)) table.players = [];
  // Replace undefined by null and ensure no holes up to playersPerTable
  for (let i = 0; i < table.players.length; i++) {
    if (typeof table.players[i] === 'undefined') table.players[i] = null;
  }
  // Guarantee at least playersPerTable length to keep indexes stable
  if (typeof playersPerTable === 'undefined' || playersPerTable === null) playersPerTable = 8;
  while (table.players.length < playersPerTable) table.players.push(null);
}

// Au chargement, afficher le dernier transfert s'il existe
document.addEventListener('DOMContentLoaded', function () {
  try {
    const last = localStorage.getItem('lastTransfer');
    if (last) {
      const t = JSON.parse(last);
      if (t && t.playerName) {
        // attendre que le DOM soit prêt
        setTimeout(() => showTableTransferNotification(t.playerName, t.fromTable, t.toTable, false, t.seatNumber || null), 200);
      }
    }
  } catch (e) {}
});

// Polling fallback: vérifier périodiquement les clés localStorage si aucun message n'arrive
let __lastRebalanceTS = null;
let __lastTransferTS = null;
setInterval(() => {
  try {
    const reb = localStorage.getItem('rebalanceTrigger');
    if (reb && reb !== __lastRebalanceTS) {
      __lastRebalanceTS = reb;
      console.log('Polling detected rebalanceTrigger -> performRebalance()');
      performRebalance();
    }

    const lastT = localStorage.getItem('lastTransfer');
    if (lastT) {
      const parsed = JSON.parse(lastT);
      const ts = parsed.ts || parsed.time || null;
      if (ts && String(ts) !== String(__lastTransferTS)) {
        __lastTransferTS = ts;
        console.log('Polling detected lastTransfer -> showTableTransferNotification()');
        showTableTransferNotification(parsed.playerName, parsed.fromTable, parsed.toTable, false, parsed.seatNumber || null);
      }
    }
  } catch (e) {
    // ignore polling errors
  }
}, 2000);

// Fonction utilitaire test pour forcer un transfert et diagnostiquer
function forceTransferTest() {
  console.log('forceTransferTest() appelé');
  loadTables();
  try { tables.forEach(t => ensureTableSlots(t)); } catch (e) { console.error(e); }
  const activePlayers = loadActivePlayers();
  console.log('Active players count:', activePlayers.length);
  const tableSizes = tables.map(table => ({ table, activeCount: table.players.filter(p => p && activePlayers.some(ap => ap.id === p.id)).length }));
  console.log('Table sizes:', tableSizes.map(t => ({n: t.table.tableNumber, c: t.activeCount, len: t.table.players.length}))); 

  // find max and min with available seat
  tableSizes.sort((a,b)=>b.activeCount-a.activeCount);
  const maxT = tableSizes[0];
  const mins = tableSizes.slice().reverse().filter(ts => {
    const t = ts.table;
    for (let i=0;i<playersPerTable;i++){
      if (i>=t.players.length) return true;
      const seat = t.players[i];
      const seatActive = seat && seat.id && activePlayers && activePlayers.some(ap => ap.id === seat.id);
      if (!seat || !seat.id || !seatActive) return true;
    }
    return false;
  });
  const minT = mins.length? mins[0] : tableSizes[tableSizes.length-1];
  console.log('maxT', maxT && maxT.table && maxT.table.tableNumber, 'minT', minT && minT.table && minT.table.tableNumber);

  // simulate one move using same logic
  const activePlayers_inMax = maxT.table.players.filter(p => p && activePlayers.some(ap=>ap.id===p.id));
  if (!activePlayers_inMax.length) { console.log('Aucun joueur actif à déplacer'); return; }
  const rnd = Math.floor(Math.random()*activePlayers_inMax.length);
  const toMove = activePlayers_inMax[rnd];
  console.log('toMove', toMove ? (toMove.pseudo||toMove.id) : null);

  const idxOld = maxT.table.players.findIndex(p => p && p.id === toMove.id);
  if (idxOld !== -1) maxT.table.players[idxOld]=null; else maxT.table.players = maxT.table.players.filter(p=>p&&p.id!==toMove.id);

  let emptyIdx = -1; for (let ii=0; ii<playersPerTable; ii++){ 
    if (ii>=minT.table.players.length){ emptyIdx=ii; break; }
    const p = minT.table.players[ii];
    const isActiveSeat = p && p.id && activePlayers && activePlayers.some(ap => ap.id === p.id);
    if (!p || !p.id || !isActiveSeat){ emptyIdx = ii; break; }
  }
  if (emptyIdx===-1){ console.log('Destination pleine, annulation test'); if (idxOld!==-1) maxT.table.players[idxOld]=toMove; return; }
  if (emptyIdx>=minT.table.players.length) { while(minT.table.players.length<emptyIdx) minT.table.players.push(null); minT.table.players.push({...toMove, tableNumber: minT.table.tableNumber, seatNumber: emptyIdx+1}); }
  else { minT.table.players[emptyIdx] = {...toMove, tableNumber: minT.table.tableNumber, seatNumber: emptyIdx+1}; }

  try{ const movedId=toMove.id; tables.forEach(t=>{ for(let si=0; si<t.players.length; si++){ const s=t.players[si]; if(s&&s.id===movedId){ if(!(t.tableNumber===minT.table.tableNumber && si===emptyIdx)) t.players[si]=null; } } }); }catch(e){console.error(e);} 
  tables.forEach(t=>{ for(let si=0; si<t.players.length; si++){ const p=t.players[si]; if(p&&p.id){ p.seatNumber=si+1; p.tableNumber=t.tableNumber; } } });
  saveTables(); renderTables(); updateStats();
  console.log('Transfer test effectué: moved to seat', emptyIdx+1, 'on table', minT.table.tableNumber);
  showTableTransferNotification(toMove.pseudo||toMove.id, maxT.table.tableNumber, minT.table.tableNumber, true, emptyIdx+1);
}

// Annoncer vocalement un transfert de joueur
function speakTransfer(playerName, fromTable, toTable, seatNumber, _retry = true) {
  if (!('speechSynthesis' in window)) { console.log('speechSynthesis API not supported'); return; }
  if (!speechEnabled) { console.log('speakTransfer: speech not enabled by user'); return; }
  try {
    const seatPart = (typeof seatNumber !== 'undefined' && seatNumber !== null) ? `, siège ${seatNumber}` : '';
    const msg = `${playerName}, transféré de la table ${fromTable} vers la table ${toTable}${seatPart}`;

    // ensure voices are loaded; some browsers populate voices asynchronously
    const voices = window.speechSynthesis.getVoices();
    if ((!voices || voices.length === 0) && _retry) {
      // retry once when voiceschanged fires
      const handler = () => {
        try {
          window.speechSynthesis.removeEventListener('voiceschanged', handler);
        } catch (e) {}
        // call again but prevent infinite recursion by passing _retry = false
        speakTransfer(playerName, fromTable, toTable, seatNumber, false);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      // also schedule a fallback attempt shortly in case event doesn't fire
      setTimeout(() => speakTransfer(playerName, fromTable, toTable, seatNumber, false), 250);
      return;
    }

    const utter = new SpeechSynthesisUtterance(msg);
    utter.lang = 'fr-FR';
    utter.rate = 0.95;
    utter.pitch = 1;

    if (voices && voices.length) {
      const frVoice = voices.find(v => /fr|fr-FR|français/i.test(v.lang) || /French/i.test(v.name));
      if (frVoice) utter.voice = frVoice;
    }

    try { window.speechSynthesis.cancel(); } catch (e) {}
    window.speechSynthesis.speak(utter);
  } catch (e) { console.error('speakTransfer error', e); }
}
