// Ember Court: a turn-based card battler. Original game, plain vanilla JS, no libraries.
// Player (Ember Warden) vs AI (Ash Regent). 30 life each, mana ramps 1 to 10,
// draw a card each turn, hand limit 7, board limit 5. Guards must be attacked first.
(function () {
  'use strict';

  var SUITS = {
    Ember: { glyph: '\u2726', grad: 'linear-gradient(135deg,#ff9a3c,#c0392b)', color: '#c0392b' },
    Thorn: { glyph: '\u274B', grad: 'linear-gradient(135deg,#7ed957,#2e7d32)', color: '#2e7d32' },
    Tide:  { glyph: '\u25C9', grad: 'linear-gradient(135deg,#5ab8ff,#1d5fa8)', color: '#1d5fa8' },
    Stone: { glyph: '\u25C6', grad: 'linear-gradient(135deg,#b8a88a,#6b5a3e)', color: '#6b5a3e' }
  };

  // Card definitions. id, name, suit, type, cost, atk, hp, guard, text, effect.
  var DEFS = {
    imp:      { name: 'Ember Imp',      suit: 'Ember', type: 'creature', cost: 1, atk: 2, hp: 1, text: 'A quick spark with teeth.' },
    sprite:   { name: 'Spark Sprite',   suit: 'Ember', type: 'creature', cost: 1, atk: 1, hp: 1, text: 'On play: draw a card.', effect: { kind: 'draw', amount: 1 } },
    wolf:     { name: 'Cinder Wolf',    suit: 'Ember', type: 'creature', cost: 2, atk: 3, hp: 2, text: 'It hunts where fire ran.' },
    sprout:   { name: 'Thorn Sprout',   suit: 'Thorn', type: 'creature', cost: 1, atk: 1, hp: 3, guard: true, text: 'Guard: attack it first.' },
    sentinel: { name: 'Stone Sentinel', suit: 'Stone', type: 'creature', cost: 3, atk: 2, hp: 5, guard: true, text: 'Guard: a wall that walks.' },
    herald:   { name: 'Tide Herald',    suit: 'Tide',  type: 'creature', cost: 3, atk: 3, hp: 3, text: 'On play: heal 3 life.', effect: { kind: 'heal', amount: 3 } },
    serpent:  { name: 'Tide Serpent',   suit: 'Tide',  type: 'creature', cost: 4, atk: 4, hp: 4, text: 'It coils in the shallows.' },
    knight:   { name: 'Flame Knight',   suit: 'Ember', type: 'creature', cost: 4, atk: 5, hp: 3, text: 'A sword of held wildfire.' },
    golem:    { name: 'Moss Golem',     suit: 'Thorn', type: 'creature', cost: 5, atk: 4, hp: 6, guard: true, text: 'Guard: slow, immovable.' },
    phoenix:  { name: 'Ash Phoenix',    suit: 'Ember', type: 'creature', cost: 6, atk: 5, hp: 5, text: 'On play: burn the enemy hero for 2.', effect: { kind: 'damage-hero', amount: 2 } },
    dragon:   { name: 'Ember Dragon',   suit: 'Ember', type: 'creature', cost: 7, atk: 7, hp: 6, text: 'The court bows as it lands.' },
    bolt:     { name: 'Ember Bolt',     suit: 'Ember', type: 'spell', cost: 2, text: 'Deal 3 damage to any target.', effect: { kind: 'damage', amount: 3, target: 'any' } },
    wildfire: { name: 'Wildfire',       suit: 'Ember', type: 'spell', cost: 4, text: 'Burn all enemy creatures for 2.', effect: { kind: 'damage-all-enemy', amount: 2 } },
    spring:   { name: 'Healing Spring', suit: 'Tide',  type: 'spell', cost: 2, text: 'Heal your hero for 6.', effect: { kind: 'heal', amount: 6 } },
    wisdom:   { name: 'Ember Wisdom',   suit: 'Tide',  type: 'spell', cost: 2, text: 'Draw 2 cards.', effect: { kind: 'draw', amount: 2 } }
  };

  // Deck recipe: [defId, count] totalling 30 cards.
  var DECK_RECIPE = [
    ['imp', 2], ['sprite', 2], ['wolf', 2], ['sprout', 2], ['sentinel', 2],
    ['herald', 2], ['serpent', 2], ['knight', 2], ['golem', 2], ['phoenix', 2],
    ['dragon', 1], ['bolt', 3], ['wildfire', 2], ['spring', 2], ['wisdom', 2]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var uid = 1;

  function buildDeck() {
    var deck = [];
    DECK_RECIPE.forEach(function (pair) {
      for (var i = 0; i < pair[1]; i++) deck.push(makeCard(pair[0]));
    });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function makeCard(defId) {
    var d = DEFS[defId];
    return { uid: uid++, def: defId, name: d.name, suit: d.suit, type: d.type,
      cost: d.cost, atk: d.atk || 0, hp: d.hp || 0, maxHp: d.hp || 0,
      guard: !!d.guard, text: d.text, effect: d.effect || null, canAttack: false };
  }

  function newSide() {
    return { life: 30, mana: 0, maxMana: 0, deck: buildDeck(), hand: [], board: [], fatigue: 0 };
  }

  var S = null; // game state
  var wins = 0, losses = 0;
  var selected = null; // {kind:'hand', index} or {kind:'board', index}
  var targeting = null; // {handIndex} when a targeted spell is armed
  var aiBusy = false;
  var muted = false;
  var audioCtx = null;

  function newGame() {
    S = { screen: 'game', turn: 0, active: 'player', over: false,
      player: newSide(), enemy: newSide(), log: [], cardsPlayed: 0, attacksMade: 0 };
    selected = null; targeting = null; aiBusy = false;
    $('titleScreen').classList.add('hidden');
    $('endScreen').classList.add('hidden');
    for (var i = 0; i < 3; i++) { drawCard(S.player, true); drawCard(S.enemy, true); }
    startTurn('player');
    log('The duel begins. Your turn: 1 mana, draw a card, play the court.', true);
    render();
  }

  function drawCard(side, silent) {
    if (side.deck.length === 0) {
      side.fatigue++;
      side.life -= side.fatigue;
      if (!silent) log((side === S.player ? 'You' : 'The Regent') + ' run out of cards and take ' + side.fatigue + ' fatigue damage.');
      checkOver();
      return null;
    }
    var c = side.deck.shift();
    if (side.hand.length < 7) { side.hand.push(c); return c; }
    if (!silent) log('Hand is full, a drawn card burns away.');
    return null;
  }

  function startTurn(sideName) {
    var side = S[sideName];
    S.active = sideName;
    if (sideName === 'player') S.turn++;
    side.maxMana = Math.min(10, side.maxMana + 1);
    side.mana = side.maxMana;
    side.board.forEach(function (m) { m.canAttack = true; });
    if (sideName === 'player' && S.turn === 1) { /* opening hand already drawn, no draw */ }
    else drawCard(side);
    render();
  }

  function log(msg, isTurn) {
    S.log.push({ msg: msg, turn: !!isTurn });
    if (S.log.length > 5) S.log.shift();
    renderLog();
  }

  function renderLog() {
    if (!S) return;
    $('log').innerHTML = S.log.map(function (e) {
      return '<div' + (e.turn ? ' class="turn"' : '') + '>' + escapeHtml(e.msg) + '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function other(sideName) { return sideName === 'player' ? 'enemy' : 'player'; }
  function labelFor(side) { return side === S.player ? 'You' : 'The Regent'; }

  function hasGuard(side) { return side.board.some(function (m) { return m.guard; }); }

  function checkOver() {
    if (!S || S.over) return;
    if (S.enemy.life <= 0) { S.enemy.life = 0; endGame(true); }
    else if (S.player.life <= 0) { S.player.life = 0; endGame(false); }
  }

  function endGame(won) {
    S.over = true; S.screen = won ? 'win' : 'loss';
    if (won) wins++; else losses++;
    $('endWord').textContent = won ? 'VICTORY' : 'DEFEAT';
    $('endWord').className = 'bigword ' + (won ? 'win' : 'loss');
    $('endCrown').textContent = won ? '\u265A' : '\u265B';
    $('endCrown').className = 'crown ' + (won ? 'win' : 'loss');
    $('endSub').textContent = won ? 'The Ember Court is yours. The Ash Regent bows.' : 'The Ash Regent keeps the throne. The embers wait for a rematch.';
    $('endStats').innerHTML = 'Turns played: <b>' + S.turn + '</b><br>Cards played: <b>' + S.cardsPlayed +
      '</b><br>Attacks made: <b>' + S.attacksMade + '</b><br>Your life: <b>' + S.player.life +
      '</b> &nbsp; Regent life: <b>' + S.enemy.life + '</b>';
    $('endScreen').classList.remove('hidden');
    playTone(won ? [523, 659, 784, 1047] : [392, 330, 262, 196]);
    render();
  }

  // ---- actions (shared by UI, AI and scripted play) ----

  function canPlay(side, card) { return side.mana >= card.cost; }

  function playCard(sideName, handIndex, target) {
    // target: {kind:'hero'} or {kind:'minion', index} for targeted spells; ignored otherwise.
    if (!S || S.over) return false;
    var side = S[sideName], foe = S[other(sideName)];
    var card = side.hand[handIndex];
    if (!card || !canPlay(side, card)) return false;
    if (card.type === 'creature' && side.board.length >= 5) return false;
    if (card.effect && card.effect.target === 'any' && !target) return false;
    side.mana -= card.cost;
    side.hand.splice(handIndex, 1);
    S.cardsPlayed++;
    if (card.type === 'creature') {
      card.canAttack = false;
      side.board.push(card);
      log(labelFor(side) + ' summon ' + card.name + ' (' + card.atk + '/' + card.hp + ').');
      if (card.effect) applyEffect(sideName, card.effect, null);
    } else {
      log(labelFor(side) + ' cast ' + card.name + '.');
      applyEffect(sideName, card.effect, target);
    }
    playTone([660]);
    selected = null; targeting = null;
    checkOver();
    render();
    return true;
  }

  function applyEffect(sideName, effect, target) {
    var side = S[sideName], foe = S[other(sideName)];
    if (!effect) return;
    if (effect.kind === 'damage') {
      if (target.kind === 'hero') { foe.life -= effect.amount; log('It burns the enemy hero for ' + effect.amount + '.'); }
      else { var m = foe.board[target.index]; if (m) { m.hp -= effect.amount; log('It burns ' + m.name + ' for ' + effect.amount + '.'); } }
      cleanupBoard(foe);
    } else if (effect.kind === 'damage-hero') {
      foe.life -= effect.amount;
      log('The phoenix scorches the enemy hero for ' + effect.amount + '.');
    } else if (effect.kind === 'damage-all-enemy') {
      foe.board.forEach(function (m) { m.hp -= effect.amount; });
      log('Wildfire scorches every enemy creature for ' + effect.amount + '.');
      cleanupBoard(foe);
    } else if (effect.kind === 'heal') {
      side.life = Math.min(30, side.life + effect.amount);
      log(labelFor(side) + ' heal for ' + effect.amount + ' life.');
    } else if (effect.kind === 'draw') {
      for (var i = 0; i < effect.amount; i++) drawCard(side, true);
      log(labelFor(side) + ' draw ' + effect.amount + ' card' + (effect.amount > 1 ? 's' : '') + '.');
    }
    checkOver();
  }

  function cleanupBoard(side) {
    side.board = side.board.filter(function (m) { return m.hp > 0; });
  }

  function attack(sideName, boardIndex, target) {
    // target: {kind:'hero'} or {kind:'minion', index}
    if (!S || S.over) return false;
    var side = S[sideName], foe = S[other(sideName)];
    var attacker = side.board[boardIndex];
    if (!attacker || !attacker.canAttack) return false;
    if (hasGuard(foe) && target.kind !== 'minion') return false;
    if (target.kind === 'minion') {
      var def = foe.board[target.index];
      if (!def) return false;
      if (hasGuard(foe) && !def.guard) return false;
      def.hp -= attacker.atk;
      attacker.hp -= def.atk;
      S.attacksMade++;
      log(labelFor(side) + ' ' + attacker.name + ' strikes ' + def.name + ' for ' + attacker.atk + '.');
      attacker.canAttack = false;
      cleanupBoard(foe); cleanupBoard(side);
      floater(target.kind === 'minion' ? 'enemyBoard' : 'enemyBar', '-' + attacker.atk, '#ff5a4e');
    } else {
      foe.life -= attacker.atk;
      S.attacksMade++;
      log(labelFor(side) + ' ' + attacker.name + ' hits the enemy hero for ' + attacker.atk + '.');
      attacker.canAttack = false;
      floater('enemyBar', '-' + attacker.atk, '#ff5a4e');
    }
    playTone([440]);
    selected = null;
    checkOver();
    render();
    return true;
  }

  function endTurn() {
    if (!S || S.over || S.active !== 'player' || aiBusy) return;
    selected = null; targeting = null;
    startTurn('enemy');
    log('The Regent takes turn ' + S.turn + '.', true);
    render();
    aiBusy = true;
    var actions = planAi(S.enemy, S.player);
    var i = 0;
    function step() {
      if (!S || S.over) { aiBusy = false; return; }
      if (i < actions.length) {
        var a = actions[i++];
        if (a.type === 'play') playCard('enemy', a.handIndex, a.target || null);
        else if (a.type === 'attack') attack('enemy', a.boardIndex, a.target);
        setTimeout(step, 550);
      } else {
        aiBusy = false;
        if (!S.over) { startTurn('player'); log('Your turn ' + S.turn + ': ' + S.player.maxMana + ' mana.', true); }
      }
    }
    setTimeout(step, 600);
  }

  // Plan the AI turn on a simulation copy, then execute the actions one by one.
  function planAi(me, foe) {
    var sim = JSON.parse(JSON.stringify({ me: me, foe: foe, over: S.over }));
    var actions = [];
    var guard = false;
    function simCleanup(board) { return board.filter(function (m) { return m.hp > 0; }); }
    // Play cards: repeat until nothing affordable is worth playing.
    var guardLoop = 0;
    while (guardLoop++ < 20) {
      var best = -1, bestScore = -1;
      for (var h = 0; h < sim.me.hand.length; h++) {
        var c = sim.me.hand[h];
        if (c.cost > sim.me.mana) continue;
        if (c.type === 'creature' && sim.me.board.length >= 5) continue;
        var score = c.cost * 2 + (c.atk || 0) + (c.hp || 0) + (c.guard ? 2 : 0);
        if (c.type === 'spell') {
          if (c.effect.kind === 'heal' && sim.me.life >= 26) score = -1;
          if (c.effect.kind === 'draw' && sim.me.hand.length >= 6) score = -1;
          if (c.effect.kind === 'damage-all-enemy' && sim.foe.board.length === 0) score = -1;
          if (c.effect.kind === 'damage' && sim.foe.board.length === 0 && sim.me.life > 12) score = c.cost;
        }
        if (score > bestScore) { bestScore = score; best = h; }
      }
      if (best < 0) break;
      var card = sim.me.hand[best];
      var target = null;
      if (card.effect && card.effect.target === 'any') {
        var biggest = -1, bigAtk = -1;
        sim.foe.board.forEach(function (m, idx) { if (m.atk > bigAtk) { bigAtk = m.atk; biggest = idx; } });
        if (biggest >= 0 && (bigAtk >= 4 || sim.foe.life <= card.effect.amount)) target = { kind: 'minion', index: biggest };
        else target = { kind: 'hero' };
      }
      actions.push({ type: 'play', handIndex: best, target: target, def: card.def });
      sim.me.mana -= card.cost;
      sim.me.hand.splice(best, 1);
      if (card.type === 'creature') { card.canAttack = false; sim.me.board.push(card); }
      else if (card.effect) {
        if (card.effect.kind === 'damage' && target) {
          if (target.kind === 'hero') sim.foe.life -= card.effect.amount;
          else if (sim.foe.board[target.index]) sim.foe.board[target.index].hp -= card.effect.amount;
        } else if (card.effect.kind === 'damage-all-enemy') {
          sim.foe.board.forEach(function (m) { m.hp -= card.effect.amount; });
        } else if (card.effect.kind === 'heal') sim.me.life = Math.min(30, sim.me.life + card.effect.amount);
        sim.foe.board = simCleanup(sim.foe.board);
      }
      if (sim.foe.life <= 0) break;
    }
    // Attack with every ready creature: guards first, then face unless a big threat sits there.
    sim.me.board.forEach(function (m, idx) {
      if (!m.canAttack) return;
      var foeGuards = sim.foe.board.map(function (x, i) { return x.guard ? i : -1; }).filter(function (i) { return i >= 0; });
      if (foeGuards.length) {
        actions.push({ type: 'attack', boardIndex: idx, target: { kind: 'minion', index: foeGuards[0] } });
        var g = sim.foe.board[foeGuards[0]];
        if (g) { g.hp -= m.atk; m.hp -= g.atk; }
        sim.foe.board = simCleanup(sim.foe.board);
        sim.me.board = simCleanup(sim.me.board);
      } else {
        var threat = -1, threatAtk = 5;
        sim.foe.board.forEach(function (x, i) { if (x.atk >= threatAtk) { threatAtk = x.atk; threat = i; } });
        if (threat >= 0 && m.hp <= sim.foe.board[threat].atk) {
          actions.push({ type: 'attack', boardIndex: idx, target: { kind: 'minion', index: threat } });
          var d = sim.foe.board[threat];
          d.hp -= m.atk; m.hp -= d.atk;
          sim.foe.board = simCleanup(sim.foe.board);
          sim.me.board = simCleanup(sim.me.board);
        } else {
          actions.push({ type: 'attack', boardIndex: idx, target: { kind: 'hero' } });
          sim.foe.life -= m.atk;
        }
      }
    });
    return actions;
  }

  // Synchronous full-game autoplay through the real rules, for testing.
  function autoPlaySync(maxTurns) {
    var turns = 0;
    while (S && !S.over && turns < (maxTurns || 200)) {
      turns++;
      // Player acts with the same planner, then the enemy acts.
      var acts = planAi(S.player, S.enemy);
      for (var i = 0; i < acts.length && !S.over; i++) {
        var a = acts[i];
        if (a.type === 'play') {
          // Hand indices shift as cards leave; re-resolve by matching the planned card name and cost.
          var idx = findPlayable(S.player, a);
          if (idx >= 0) playCard('player', idx, a.target || null);
        } else if (a.type === 'attack') {
          var bi = a.boardIndex;
          if (S.player.board[bi] && S.player.board[bi].canAttack) attack('player', bi, a.target);
        }
      }
      if (S.over) break;
      startTurn('enemy');
      if (S.over) break;
      var eacts = planAi(S.enemy, S.player);
      for (var j = 0; j < eacts.length && !S.over; j++) {
        var e = eacts[j];
        if (e.type === 'play') { var ei = findPlayable(S.enemy, e); if (ei >= 0) playCard('enemy', ei, e.target || null); }
        else if (e.type === 'attack') {
          var eb = e.boardIndex;
          if (S.enemy.board[eb] && S.enemy.board[eb].canAttack) attack('enemy', eb, e.target);
        }
      }
      if (S.over) break;
      startTurn('player');
    }
    return { over: S.over, screen: S.screen, turns: S.turn, playerLife: S.player.life, enemyLife: S.enemy.life };
  }

  function findPlayable(side, planned) {
    // Planned actions were computed on a copy; find the same card still in hand.
    if (planned.def) {
      for (var i = 0; i < side.hand.length; i++) {
        if (side.hand[i].def === planned.def && side.hand[i].cost <= side.mana) return i;
      }
    }
    for (var k = 0; k < side.hand.length; k++) {
      if (side.hand[k].cost <= side.mana) return k;
    }
    return -1;
  }

  // ---- rendering ----

  function cardEl(card, opts) {
    opts = opts || {};
    var suit = SUITS[card.suit];
    var el = document.createElement('div');
    el.className = 'card' + (opts.mini ? ' mini' : '') + (card.guard ? ' guarded' : '') + (opts.cls ? ' ' + opts.cls : '');
    var html = '<div class="cost">' + card.cost + '</div>' +
      '<div class="suitTag" style="color:' + suit.color + '">' + card.suit + '</div>' +
      '<div class="art" style="background:' + suit.grad + '">' + suit.glyph + '</div>' +
      (card.guard ? '<div class="guardTag">GUARD</div>' : '') +
      '<div class="cname">' + escapeHtml(card.name) + '</div>' +
      '<div class="ctype">' + (card.type === 'creature' ? (card.guard ? 'Guard Creature' : 'Creature') : 'Spell') + '</div>' +
      '<div class="ctext">' + escapeHtml(card.text) + '</div>';
    if (card.type === 'creature') {
      html += '<div class="atk">' + card.atk + '</div><div class="hp">' + card.hp + '</div>';
      if (opts.mini && !card.canAttack) html += '<div class="sick">RESTING</div>';
    }
    el.innerHTML = html;
    return el;
  }

  function renderBoard(container, side, isPlayer) {
    container.innerHTML = '';
    if (side.board.length === 0) {
      var slot = document.createElement('div');
      slot.className = 'emptySlot';
      slot.textContent = isPlayer ? 'Your court is empty. Play a creature.' : 'The Regent has no creatures out.';
      container.appendChild(slot);
      return;
    }
    side.board.forEach(function (m, idx) {
      var el = cardEl(m, { mini: true, cls: (!m.canAttack ? 'cantAttack' : '') });
      el.dataset.boardIndex = idx;
      el.dataset.side = isPlayer ? 'player' : 'enemy';
      if (isPlayer && S.active === 'player' && m.canAttack && !S.over) {
        el.addEventListener('click', function () { onBoardClick(idx); });
      }
      if (!isPlayer && (selected || targeting)) {
        var guard = hasGuard(S.enemy);
        if (!guard || m.guard) el.classList.add('targetable');
        el.addEventListener('click', function () { onTargetClick({ kind: 'minion', index: idx }); });
      }
      container.appendChild(el);
    });
  }

  function renderHand() {
    var hand = $('hand');
    hand.innerHTML = '';
    S.player.hand.forEach(function (c, idx) {
      var playable = S.active === 'player' && !S.over && canPlay(S.player, c) &&
        (c.type === 'spell' || S.player.board.length < 5);
      var el = cardEl(c, { cls: (selected && selected.kind === 'hand' && selected.index === idx ? 'selected' : '') +
        (playable ? ' playable' : '') });
      el.dataset.handIndex = idx;
      el.addEventListener('click', function () { onHandClick(idx); });
      hand.appendChild(el);
    });
  }

  function renderEnemyHand() {
    var row = $('enemyHandRow');
    row.innerHTML = '';
    for (var i = 0; i < S.enemy.hand.length; i++) {
      var b = document.createElement('div');
      b.className = 'miniBack';
      row.appendChild(b);
    }
  }

  function render() {
    if (!S) return;
    $('playerLife').textContent = Math.max(0, S.player.life);
    $('enemyLife').textContent = Math.max(0, S.enemy.life);
    $('playerLifeFill').style.width = Math.max(0, S.player.life / 30 * 100) + '%';
    $('enemyLifeFill').style.width = Math.max(0, S.enemy.life / 30 * 100) + '%';
    $('playerMana').textContent = S.player.mana + '/' + S.player.maxMana;
    $('enemyMana').textContent = S.enemy.mana + '/' + S.enemy.maxMana;
    $('playerDeck').textContent = S.player.deck.length;
    $('enemyDeck').textContent = S.enemy.deck.length;
    $('turnNum').textContent = S.turn;
    $('scoreYou').textContent = wins;
    $('scoreFoe').textContent = losses;
    $('turnLabel').textContent = S.over ? 'Game over' : (S.active === 'player' ? 'Your turn' : 'Regent thinking...');
    $('endTurn').disabled = S.over || S.active !== 'player' || aiBusy;
    $('hint').innerHTML = targeting ? 'Choose a target: an enemy creature or the Regent (click the red life bar area).<br>Esc cancels.' :
      (selected && selected.kind === 'board' ? 'Attacker chosen. Click an enemy creature or the Regent to strike.' :
      'Click a card, then a target.<br>Keys: 1-7 select, Enter ends turn, R restarts.');
    renderBoard($('playerBoard'), S.player, true);
    renderBoard($('enemyBoard'), S.enemy, false);
    renderHand();
    renderEnemyHand();
    renderLog();
    // Enemy hero is a target: mark the enemy bar clickable when targeting or attacking.
    var eb = $('enemyBar');
    eb.style.cursor = (selected || targeting) && !S.over ? 'crosshair' : 'default';
    eb.style.boxShadow = (selected || targeting) && !S.over ? '0 0 0 3px #ff5a4e' : 'none';
    eb.style.borderRadius = '10px';
  }

  function floater(targetId, text, color) {
    var anchor = $(targetId);
    if (!anchor) return;
    var r = anchor.getBoundingClientRect();
    var stage = $('stage').getBoundingClientRect();
    var f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    f.style.color = color;
    f.style.left = (r.left - stage.left + r.width / 2 - 10) + 'px';
    f.style.top = (r.top - stage.top + 10) + 'px';
    $('stage').appendChild(f);
    setTimeout(function () { f.remove(); }, 1150);
  }

  // ---- input ----

  function onHandClick(idx) {
    if (!S || S.over || S.active !== 'player' || aiBusy) return;
    var card = S.player.hand[idx];
    if (!card) return;
    if (selected && selected.kind === 'hand' && selected.index === idx) { selected = null; targeting = null; render(); return; }
    if (!canPlay(S.player, card)) { log('Not enough mana for ' + card.name + ' (' + card.cost + ' needed).'); render(); return; }
    if (card.type === 'creature' && S.player.board.length >= 5) { log('Your court is full (5 creatures).'); render(); return; }
    selected = { kind: 'hand', index: idx };
    if (card.type === 'spell' && card.effect && card.effect.target === 'any') {
      targeting = { handIndex: idx };
      log('Choose a target for ' + card.name + ': an enemy creature or the Regent.');
    } else if (card.type === 'spell') {
      playCard('player', idx, null);
      return;
    }
    render();
  }

  function onBoardClick(idx) {
    if (!S || S.over || S.active !== 'player' || aiBusy) return;
    var m = S.player.board[idx];
    if (!m || !m.canAttack) return;
    if (selected && selected.kind === 'board' && selected.index === idx) { selected = null; render(); return; }
    selected = { kind: 'board', index: idx };
    targeting = null;
    render();
  }

  function onTargetClick(target) {
    if (!S || S.over || S.active !== 'player' || aiBusy) return;
    if (targeting) {
      var hi = targeting.handIndex;
      playCard('player', hi, target);
      return;
    }
    if (selected && selected.kind === 'board') {
      attack('player', selected.index, target);
      return;
    }
    if (selected && selected.kind === 'hand') {
      var card = S.player.hand[selected.index];
      if (card && card.type === 'creature') {
        // Clicking an enemy while a creature is selected does nothing; creatures need no target.
        log('Creatures go straight to your court. Click the card again or press Esc to cancel.');
        render();
      }
    }
  }

  $('enemyBar').addEventListener('click', function () {
    if ((selected || targeting) && S && !S.over && S.active === 'player') {
      // Guards block creature attacks on the hero, but spells can burn past them.
      if (selected && selected.kind === 'board' && hasGuard(S.enemy)) { log('A guard blocks the way. Attack the guard first.'); render(); return; }
      onTargetClick({ kind: 'hero' });
    }
  });

  $('endTurn').addEventListener('click', endTurn);
  $('startBtn').addEventListener('click', function () { initAudio(); newGame(); });
  $('againBtn').addEventListener('click', function () { newGame(); });
  $('muteBtn').addEventListener('click', function () {
    muted = !muted;
    $('muteBtn').textContent = muted ? 'Sound: OFF' : 'Sound: ON';
  });

  document.addEventListener('keydown', function (e) {
    if (!S) return;
    if (e.key >= '1' && e.key <= '7') {
      var idx = Number(e.key) - 1;
      if (S.screen === 'game') onHandClick(idx);
    } else if (e.key === 'Enter') {
      if (S.screen === 'game') endTurn();
    } else if (e.key === 'Escape') {
      selected = null; targeting = null; render();
    } else if (e.key === 'r' || e.key === 'R') {
      if (S.over) newGame();
    }
  });

  // ---- sound (WebAudio synth only, no files) ----
  function initAudio() {
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { audioCtx = null; }
  }
  function playTone(freqs) {
    if (muted || !audioCtx) return;
    try {
      var t = audioCtx.currentTime;
      freqs.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.08, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.2);
      });
    } catch (err) { /* sound is optional */ }
  }

  // ---- ember particles (procedural canvas background) ----
  var canvas = $('embers'), ctx = canvas.getContext('2d');
  var parts = [];
  for (var p = 0; p < 64; p++) {
    parts.push({ x: Math.random() * 1280, y: Math.random() * 720, r: 1 + Math.random() * 2.5,
      s: 0.2 + Math.random() * 0.6, a: 0.15 + Math.random() * 0.4 });
  }
  function tickParticles() {
    ctx.clearRect(0, 0, 1280, 720);
    parts.forEach(function (pt) {
      pt.y -= pt.s; pt.x += Math.sin(pt.y / 60) * 0.3;
      if (pt.y < -5) { pt.y = 725; pt.x = Math.random() * 1280; }
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,150,60,' + pt.a + ')'; ctx.fill();
    });
    requestAnimationFrame(tickParticles);
  }
  tickParticles();

  // ---- stage scaling ----
  function fitStage() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    $('stage').style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // ---- screenshot states (?shot=title|table|win|loss) ----
  function presetTable() {
    newGame();
    var P = S.player, E = S.enemy;
    P.life = 22; E.life = 15;
    P.maxMana = 9; P.mana = 9; E.maxMana = 8; E.mana = 3;
    S.turn = 8;
    P.board = [makeCard('sentinel'), makeCard('wolf'), makeCard('knight'), makeCard('phoenix')];
    P.board[0].canAttack = true; P.board[1].canAttack = true; P.board[2].canAttack = true; P.board[3].canAttack = false;
    E.board = [makeCard('golem'), makeCard('serpent'), makeCard('knight')];
    E.board[0].canAttack = false; E.board[1].canAttack = false; E.board[2].canAttack = false;
    P.hand = [makeCard('bolt'), makeCard('dragon'), makeCard('spring'), makeCard('phoenix'), makeCard('sprout'), makeCard('wisdom')];
    E.hand = [makeCard('imp'), makeCard('wolf'), makeCard('bolt'), makeCard('serpent')];
    P.deck = P.deck.slice(0, 15); E.deck = E.deck.slice(0, 18);
    S.cardsPlayed = 14; S.attacksMade = 11;
    S.log = [
      { msg: 'Your turn 8: 9 mana.', turn: true },
      { msg: 'The Regent summons Tide Serpent (4/4).', turn: false },
      { msg: 'Your Flame Knight strikes the Regent for 5.', turn: false },
      { msg: 'Wildfire scorched the Regent court for 2.', turn: false }
    ];
    render();
  }

  // Cover staging: the most dramatic mid-game state the table can hold.
  // Full 7-card hand, 5 creatures against 4, 10 mana, a close life race,
  // and Ember Bolt armed with the Regent in its sights.
  function presetCover() {
    newGame();
    var P = S.player, E = S.enemy;
    P.life = 18; E.life = 12;
    P.maxMana = 10; P.mana = 10; E.maxMana = 10; E.mana = 4;
    S.turn = 9;
    wins = 2; losses = 1;
    P.board = [makeCard('golem'), makeCard('knight'), makeCard('phoenix'), makeCard('dragon'), makeCard('wolf')];
    P.board[0].canAttack = true; P.board[1].canAttack = true; P.board[2].canAttack = true;
    P.board[3].canAttack = false; P.board[4].canAttack = true;
    E.board = [makeCard('sentinel'), makeCard('serpent'), makeCard('knight'), makeCard('golem')];
    E.board[0].canAttack = false; E.board[1].canAttack = false; E.board[2].canAttack = false; E.board[3].canAttack = false;
    P.hand = [makeCard('bolt'), makeCard('dragon'), makeCard('wildfire'), makeCard('spring'), makeCard('wisdom'), makeCard('phoenix'), makeCard('imp')];
    E.hand = [makeCard('imp'), makeCard('wolf'), makeCard('bolt'), makeCard('serpent'), makeCard('dragon')];
    P.deck = P.deck.slice(0, 12); E.deck = E.deck.slice(0, 14);
    S.cardsPlayed = 18; S.attacksMade = 15;
    S.log = [
      { msg: 'EMBER COURT - turn 9: the throne hangs on this turn.', turn: true },
      { msg: 'The Regent summons Moss Golem (4/6).', turn: false },
      { msg: 'Your Ember Dragon lands (7/6).', turn: false },
      { msg: 'Your Flame Knight strikes the Regent for 5.', turn: false }
    ];
    selected = { kind: 'hand', index: 0 };
    targeting = { handIndex: 0 };
    render();
    $('turnLabel').textContent = 'EMBER COURT';
    $('hint').innerHTML = 'Turn 9 - one bolt from the throne.<br>Click a card, then a target.';
  }

  function applyShot() {
    var q = new URLSearchParams(window.location.search).get('shot');
    if (!q) return;
    if (q === 'title') {
      presetCover();
    } else if (q === 'table') {
      presetTable();
    } else if (q === 'win') {
      presetTable();
      S.enemy.life = 0;
      endGame(true);
    } else if (q === 'loss') {
      presetTable();
      S.player.life = 0;
      endGame(false);
    }
    window.__shotReady = true;
  }

  // Boot: title screen by default; shot states paint synchronously.
  S = { screen: 'title', turn: 1, active: 'player', over: false,
    player: newSide(), enemy: newSide(), log: [], cardsPlayed: 0, attacksMade: 0 };
  render();
  applyShot();
  if (!new URLSearchParams(window.location.search).get('shot')) {
    window.__shotReady = true;
  }

  // Test hooks for scripted playthroughs (used by the maker only).
  window.__ember = {
    state: function () { return S; },
    newGame: newGame,
    playCard: playCard,
    attack: attack,
    endTurn: endTurn,
    autoPlaySync: autoPlaySync,
    debugWin: function () { if (S) { S.enemy.life = 1; var m = S.player.board[0]; if (m) { m.canAttack = true; } } },
    wins: function () { return wins; },
    losses: function () { return losses; }
  };
})();
