const TOURNAMENT_CONFIG = {
  name: 'CHOOZ POKER CLUB',
  startingChips: 10000,
  players: 120,           
  currentPlayers: 87,
  rebuys: 0,
  addons: 0,
  prizePool: 0,
  levels: [
    { level: 1, duration: 20, sb: 100, bb: 100, ante: 0, isBreak: false },
    { level: 2, duration: 20, sb: 100, bb: 200, ante: 0, isBreak: false },
    { level: 3, duration: 20, sb: 100, bb: 300, ante: 0, isBreak: false },
    { level: 4, duration: 20, sb: 200, bb: 400, ante: 0, isBreak: false },
    { level: 5, duration: 10, sb: 0, bb: 0, ante: 0, isBreak: true },
    { level: 5, duration: 15, sb: 300, bb: 600, ante: 600, isBreak: false },
    { level: 6, duration: 15, sb: 400, bb: 800, ante: 800, isBreak: false },
    { level: 7, duration: 15, sb: 500, bb: 1000, ante: 1000, isBreak: false },
    { level: 8, duration: 15, sb: 1000, bb: 2000, ante: 2000, isBreak: false },
    { level: 9, duration: 15, sb: 1500, bb: 3000, ante: 3000, isBreak: false },
    { level: 10, duration: 10, sb: 0, bb: 0, ante: 0, isBreak: true },
    { level: 11, duration: 15, sb: 2000, bb: 4000, ante: 4000, isBreak: false },
    { level: 12, duration: 15, sb: 3000, bb: 6000, ante: 6000, isBreak: false },
    { level: 13, duration: 15, sb: 4000, bb: 8000, ante: 8000, isBreak: false },
    { level: 14, duration: 15, sb: 5000, bb: 10000, ante: 10000, isBreak: false },
    { level: 15, duration: 15, sb: 6000, bb: 12000, ante: 12000, isBreak: false },
    { level: 16, duration: 15, sb: 8000, bb: 16000, ante: 16000, isBreak: false },
    { level: 16, duration: 10, sb: 0, bb: 0, ante: 0, isBreak: true },
    { level: 17, duration: 15, sb: 10000, bb: 20000, ante: 20000, isBreak: false },
    { level: 18, duration: 15, sb: 15000, bb: 30000, ante: 30000, isBreak: false },
    { level: 19, duration: 15, sb: 20000, bb: 40000, ante: 40000, isBreak: false },
    { level: 20, duration: 15, sb: 30000, bb: 60000, ante: 60000, isBreak: false },
    { level: 21, duration: 15, sb: 40000, bb: 80000, ante: 80000, isBreak: false },
    { level: 22, duration: 15, sb: 50000, bb: 100000, ante: 100000, isBreak: false }
  ]
};

const CHIP_COLORS = [
  { name: '100', value: 100, color: '#333333', border: '#000000', textColor: 'white' },
  { name: '500', value: 500, color: '#6A0DAD', border: '#A67FD9', textColor: 'white' },
  { name: '1000', value: 1000, color: '#FFD700', border: '#FFEB99', textColor: 'white' },
  { name: '5000', value: 5000, color: '#FF69B4', border: '#FFB3D6', textColor: 'white' },
  { name: '10000', value: 10000, color: '#8B4513', border: '#C6864A', textColor: 'white' }
];
