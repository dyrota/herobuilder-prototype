// Location definitions. Every location has a trigger that normal play
// reaches; conditional triggers carry an `or` power fallback.
//
// Trigger types: total (combined power gained here), solo (one side's
// power gained here), cards (cards that entered here), lead (power
// margin), timer (turns in play), destroyed (cards destroyed here).

export const LOCATIONS = {
  // ----- Plain triggers -----
  field: { name: 'Open Field', art: '🌾', trigger: { type: 'total', n: 6 }, text: '' },
  crossroads: { name: 'Crossroads', art: '🪧', trigger: { type: 'total', n: 8 }, text: '' },
  keep: { name: 'Old Keep', art: '🏯', trigger: { type: 'total', n: 12 }, points: 2, text: 'Worth 2 points.' },
  duelPit: { name: 'Dueling Pit', art: '⚔️', trigger: { type: 'solo', n: 6 }, text: '' },
  market: { name: 'Market Square', art: '🏪', trigger: { type: 'cards', n: 4 }, text: '' },
  hourglass: { name: 'Hourglass Tower', art: '⏳', trigger: { type: 'timer', n: 2 }, text: '' },
  gallows: { name: 'Gallows', art: '🪢', trigger: { type: 'destroyed', n: 1, or: 10 }, text: '' },

  // ----- Rule-bending -----
  throne: { name: 'Usurper\'s Throne', art: '🪑', trigger: { type: 'total', n: 10 }, steal: true,
    text: 'The winner also takes 1 point from the loser.' },
  volcano: { name: 'Volcano', art: '🌋', trigger: { type: 'total', n: 7 },
    text: 'End of turn: the weakest card here is destroyed.',
    endTurn: (g, i) => {
      const all = [...g.revealedIn(i, 0), ...g.revealedIn(i, 1)];
      const t = g.weakest(all);
      if (t) g.destroy(t, -1);
    } },
  echoes: { name: 'Hall of Echoes', art: '🔔', trigger: { type: 'total', n: 10 }, doubleReveal: true,
    text: 'On Reveal effects here happen twice.' },
  sanctuary: { name: 'Sanctuary', art: '⛪', trigger: { type: 'total', n: 8 }, noDestroy: true,
    text: 'Cards here can\'t be destroyed.' },
  bog: { name: 'Sunken Bog', art: '🐸', trigger: { type: 'timer', n: 3 }, lowestWins: true,
    text: 'Lowest power wins (you need a card here).' },
};

for (const [id, d] of Object.entries(LOCATIONS)) {
  d.id = id;
  d.points = d.points || 1;
}

// One-line trigger description for the UI.
export function triggerText(d) {
  const t = d.trigger;
  let s;
  switch (t.type) {
    case 'total': s = `Resolves at ${t.n} total power`; break;
    case 'solo': s = `Resolves when a side has ${t.n} power`; break;
    case 'cards': s = `Resolves after ${t.n} cards are played here`; break;
    case 'lead': s = `Resolves when a side leads by ${t.n}`; break;
    case 'timer': s = `Resolves after ${t.n} turns`; break;
    case 'destroyed': s = `Resolves when a card is destroyed here`; break;
  }
  if (t.or) s += ` or at ${t.or} total power`;
  return s;
}
