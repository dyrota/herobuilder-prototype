// Classes. Every deck is the 8 core cards plus the class's 8 cards.

export const CORE = ['squire', 'courier', 'militia', 'duelist', 'sellsword', 'brute', 'giant', 'colossus'];

const CLASS_CARDS = {
  mind: ['apprentice', 'trickster', 'ambusher', 'scout', 'sage', 'timekeeper', 'tidecaller', 'puppetMaster'],
  body: ['brawler', 'raider', 'hothead', 'drummer', 'vanguard', 'berserker', 'warchief', 'titan'],
  soul: ['wisp', 'seedkeeper', 'spirit', 'thornback', 'guardian', 'bloodmage', 'tender', 'worldTree'],
};

export const CLASSES = {
  mind: {
    name: 'Mind', color: 'M', art: 'puppetmaster', cards: CLASS_CARDS.mind,
    blurb: 'Read where they commit, save your energy, then move their whole lane away.',
  },
  body: {
    name: 'Body', color: 'B', art: 'warchief', cards: CLASS_CARDS.body,
    blurb: 'Flood the board with cheap cards, then drop a Titan for almost nothing.',
  },
  soul: {
    name: 'Soul', color: 'S', art: 'worldtree', cards: CLASS_CARDS.soul,
    blurb: 'Grow your energy and your cards every turn, then plant the World Tree.',
  },
};
for (const c of Object.values(CLASSES)) c.deck = [...CORE, ...c.cards];
