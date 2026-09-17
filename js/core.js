/* ============================================================
   core.js — 데이터, 설정, 상태, 셀렉터, 마크업 헬퍼, 연출, navigate()
   ============================================================ */

/* ---------- 가족 기본값 ---------- */

/* 기본 가족 일곱 명. 주인공(mom)은 목록 맨 아래로 간다.
   인원은 편집 모드에서 자유롭게 지우고 추가한다 — 여기는 처음 열었을 때의 기본값일 뿐이다. */
const baseMembers = [
  ['grandma', '할머니', '👵', 'balloon-pop', 'senior'],
  ['grandpa', '할아버지', '👴', 'candle', 'senior'],
  ['uncle', '삼촌', '🧔', 'gift-catch', 'adult'],
  ['dad', '아빠', '👨', 'brick-breaker', 'adult'],
  ['me', '나', '👑', 'timing', 'adult'],
  ['sibling', '동생', '🧒', 'bubble-pop', 'kid'],
  ['mom', '엄마', '🎂', 'balloon-pop', 'adult'],
].map(([id, name, emoji, gameId, ageBand]) => ({
  id,
  name,
  originalName: name,
  emoji,
  defaultGame: gameId,
  defaultAge: ageBand,
}));

let members = baseMembers.map((member) => ({ ...member }));

/* ---------- 케이크 종류 ---------- */

const cakes = [
  { id: 'strawberry', name: '딸기 생크림' },
  { id: 'chocolate', name: '초코 케이크' },
  { id: 'sweet-potato', name: '고구마 케이크' },
  { id: 'fruit-cream', name: '과일 생크림' },
];

/* ---------- 나이대 밴드 ----------
   요청: "나이대마다 난이도를 다양하게".
   게임의 기본 난이도(쉬움/보통/어려움)에 이 배수가 곱해진다. */

const AGE_BANDS = [
  {
    id: 'kid',
    name: '어린이',
    emoji: '🧒',
    hint: '느리고 큼직하게, 방해물 없음',
    speed: 0.58,
    spawn: 1.4,
    life: 1.6,
    window: 1.6,
    goalShift: -1,
    scale: 1.25,
    hazards: false,
    helpAfter: 30000,
  },
  {
    id: 'adult',
    name: '어른&청소년',
    emoji: '🧔',
    hint: '게임 기본 난이도 그대로',
    speed: 1,
    spawn: 1,
    life: 1,
    window: 1,
    goalShift: 0,
    scale: 1,
    hazards: true,
    helpAfter: 45000,
  },
  {
    id: 'senior',
    name: '어르신',
    emoji: '🧓',
    hint: '아주 느리게, 글씨 크게, 도움 버튼 항상',
    speed: 0.4,
    spawn: 1.9,
    life: 2.4,
    window: 2.2,
    goalShift: -2,
    scale: 1.55,
    hazards: false,
    helpAfter: 0,
  },
];

const ageBandOf = (id) =>
  AGE_BANDS.find((band) => band.id === id) || AGE_BANDS.find((band) => band.id === 'adult');

/* ---------- 게임 목록 ---------- */

/* bg: public/game/bg/<이름>.png 를 게임판 배경으로 깐다.
   그림이 없으면 예전 그라데이션이 그대로 보인다 (css/screens.css의 --zone-bg). */
const gameCatalog = [
  { id: 'balloon-pop', name: '선물 풍선 POP!', difficulty: '쉬움', bg: 'sky' },
  { id: 'candle', name: '초를 꽂아주세요!', difficulty: '쉬움', bg: 'table' },
  { id: 'gift-catch', name: '선물 캐치!', difficulty: '쉬움', bg: 'party' },
  { id: 'bubble-pop', name: '버블 버블 팡!', difficulty: '쉬움', bg: 'sea' },
  { id: 'heart-catch', name: '하트 잡기', difficulty: '보통', bg: 'heart' },
  { id: 'timing', name: '타이밍 게임', difficulty: '어려움', bg: 'spotlight' },
  { id: 'spot-difference', name: '고전 틀린 그림 찾기', difficulty: '보통', bg: 'gallery' },
  { id: 'antarctic', name: '남극 탐험 펭귄 레이스', difficulty: '보통', bg: 'ice' },
  { id: 'brick-breaker', name: '벽돌 깨기', difficulty: '보통', bg: 'space' },
  { id: 'circus-charlie', name: '서커스 찰리 불꽃 점프', difficulty: '어려움', bg: 'circus' },
  { id: 'rhythm', name: '생일 축하 리듬', difficulty: '어려움', bg: 'stage' },
];

/* 미니게임이 잘 안 풀릴 때 대신 하는 오프라인 미션.
   화면 안에서 끝나는 게 아니라 파티장에서 몸으로 하는 일이라, 주인공 이름을 넣어 만든다.
   문구는 hostMember()로 그때그때 만든다 — 편집 모드에서 주인공을 바꾸면 같이 바뀌어야 한다. */
const offlineMissions = () => {
  const host = hostMember().name;
  const 가 = particle(host, '이', '가');
  return [
    { emoji: '🎨', text: `${host}${가} 좋아하는 색깔 맞추기` },
    { emoji: '🤗', text: `${host}에게 축하한다고 꼭 안아주기` },
    { emoji: '💐', text: `${host}에게 고마웠던 일 하나 말해주기` },
    { emoji: '🌟', text: `${host}의 장점 3가지 말하기` },
  ];
};

/* ---------- 상태 ---------- */

const KEY = 'mom-birthday-game-v6';
const OLD_KEY = 'mom-birthday-game-v5';

function newCake() {
  return {
    stage: 'fill',
    ingredients: [],
    mix: 0,
    bake: null,
    cream: 0,
    creamPng: '',
    toppings: [],
    // 하트 초 하나. x,y는 케이크 기준 0..1 이라 드래그로 옮겨도 폰을 돌려서 어긋나지 않는다.
    candle: { x: 0.5, y: 0.2, lit: false, out: false },
    finishedAt: 0,
  };
}

function defaultState() {
  return {
    completed: [],
    active: null,
    cheers: 0,
    letters: {},
    viewer: null,
    cake: newCake(),
  };
}

function loadState() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    stored = null;
  }
  if (stored) {
    return { ...defaultState(), ...stored, cake: { ...newCake(), ...(stored.cake || {}) } };
  }
  let old = null;
  try {
    old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
  } catch {
    old = null;
  }
  if (!old) return defaultState();
  return {
    ...defaultState(),
    completed: old.completed || [],
    cheers: old.cheers || 0,
    letters: old.letters || {},
    viewer: old.viewer || null,
    active: null,
    cake: {
      ...newCake(),
      ingredients: old.mixedIngredients || [],
      stage: (old.mixedIngredients || []).length ? 'mix' : 'fill',
    },
  };
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    state.cake.creamPng = '';
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      toast('저장 공간이 가득 찼어요');
    }
  }
}

/* ---------- 파티 동기화 ----------
   진행 상황(클리어한 사람, 케이크, 편지, 하트)은 서버가 원본이다.
   state.viewer(이 폰을 쓰는 사람)만 기기별로 localStorage에 남는다.
   서버에 못 붙으면(파일을 그냥 열었을 때 등) 조용히 로컬 전용으로 동작한다.

   상태를 통째로 덮어쓰지 않고 동작(op) 단위로 보낸다.
   폰 여러 대가 동시에 쓰기 때문에, 통째 교체는 남의 결과를 지운다. */

let partyRev = -1;
let partyOnline = false;
let syncTimer = null;
let onPartyChange = null;
// 케이크를 만드는 동안에는 서버 응답이 편집 중인 케이크를 되돌리지 못하게 막는다.
// (cake-game.js의 syncCake가 이 값을 밀어준다)
let cakeBusyUntil = 0;

function applyParty(party) {
  const enabled = config.enabledIds || [];
  state.completed = (Array.isArray(party.completed) ? party.completed : []).filter(
    (id) => !enabled.length || enabled.includes(id)
  );
  state.active = party.active || null;
  state.cheers = party.cheers || 0;
  state.letters = party.letters || {};
  if (Date.now() > cakeBusyUntil) state.cake = { ...newCake(), ...(party.cake || {}) };
  save();
}

async function pullParty() {
  try {
    const response = await apiFetch(api('party'));
    const { party } = await response.json();
    partyOnline = true;
    if (!party || party.rev === partyRev) return false;
    partyRev = party.rev;
    applyParty(party);
    return true;
  } catch {
    partyOnline = false;
    return false;
  }
}

async function pushParty(op, payload = {}) {
  if (!partyOnline) return;
  try {
    const response = await apiFetch(api('party'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, ...payload }),
    });
    const { party } = await response.json();
    if (party) {
      partyRev = party.rev;
      applyParty(party);
    }
  } catch {
    partyOnline = false;
  }
}

async function syncTick() {
  const changed = await pullParty();
  if (changed && typeof onPartyChange === 'function') onPartyChange();
}

function startSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncTick, 1500);
  // 화면이 꺼졌다 돌아오면 브라우저가 타이머를 늦추므로 즉시 한 번 당겨온다
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncTick();
  });
}

/* 화면이 바뀌면 구독은 초기화된다(navigate가 끊는다). 필요한 화면만 다시 등록한다.
   게임·편지·조리 중인 화면은 등록하지 않는다 — 작업 중에 다시 그리면 안 되니까. */
function watchParty(handler) {
  onPartyChange = handler;
}

/* ---------- 설정 ---------- */

function defaultConfig() {
  return {
    names: {},
    imageFiles: {},
    imageVersions: {},
    enabledIds: baseMembers.filter((m) => m.id !== 'mom').map((m) => m.id),
    targetAmount: 500000,
    backgroundTheme: 'garden',
    backgroundFile: null,
    backgroundVersion: 0,
    cakeType: 'strawberry',
    toppings: [],
    memberGames: {},
    ageBands: {},
    customMembers: [],
    elderIds: [],
    removedIds: [],
    hostId: 'mom',
    faces: {},
  };
}

let config = defaultConfig();
// 공유 링크(?view=family)로 들어온 가족은 family.html이 테스트용 편집 모드여도 가족 화면으로 연다
const isEditor =
  window.GAME_OPTIONS?.editor !== false && new URLSearchParams(location.search).get('view') !== 'family';
const app = document.querySelector('#app');
const liveRegion = document.querySelector('#live');

/* ---------- 초대 코드 ----------
   한 서버가 여러 파티를 받는다. 주소의 ?code= 로 방이 갈린다.
   한 번 들어온 폰은 저장해뒀다가 다음에 주소 없이 열어도 그 방으로 들어간다. */
const CODE_KEY = 'mom-birthday-code';
const validCode = (value) => (/^[A-HJ-NP-Z2-9]{5}$/.test(String(value || '')) ? String(value) : '');

let partyCode = (() => {
  const fromUrl = validCode(new URLSearchParams(location.search).get('code'));
  if (fromUrl) {
    try { localStorage.setItem(CODE_KEY, fromUrl); } catch { /* 저장 못 해도 이번 판은 된다 */ }
    return fromUrl;
  }
  try { return validCode(localStorage.getItem(CODE_KEY)); } catch { return ''; }
})();

function setPartyCode(code) {
  partyCode = validCode(code);
  try {
    if (partyCode) localStorage.setItem(CODE_KEY, partyCode);
    else localStorage.removeItem(CODE_KEY);
  } catch { /* 무시 */ }
}

// 모든 api 호출에 코드를 붙인다. 빠뜨리면 서버가 400으로 돌려보낸다.
const api = (path) => `api/${path}${path.includes('?') ? '&' : '?'}code=${encodeURIComponent(partyCode)}`;

// 방마다 사진 폴더가 따로다. 코드가 없으면 아무것도 안 가리킨다.
const partyAsset = (kind, name) => `public/parties/${partyCode}/${kind}/${name}`;

/* 새 가족은 이모지를 직접 고르지 않고 여기서 하나 뽑아 쓴다 */
const GUEST_EMOJI = ['🙂', '😀', '😄', '🥳', '😎', '🤗', '😺', '🐶', '🐻', '🐰',
                     '🦊', '🐨', '🐯', '🦁', '🐼', '🐧', '🐥', '🌟', '🌈', '🍀'];
const randomGuestEmoji = () => GUEST_EMOJI[Math.floor(Math.random() * GUEST_EMOJI.length)];

function sanitizeCustomMembers(value) {
  const used = new Set(baseMembers.map((member) => member.id));
  return (Array.isArray(value) ? value : []).slice(0, 20).map((member, index) => {
    const id =
      typeof member?.id === 'string' && /^guest-[a-z0-9-]+$/.test(member.id) && !used.has(member.id)
        ? member.id
        : `guest-${Date.now()}-${index}`;
    used.add(id);
    const name = String(member?.name || '새 가족').trim().slice(0, 30) || '새 가족';
    const emoji = String(member?.emoji || '').trim().slice(0, 8) || randomGuestEmoji();
    return { id, name, originalName: name, emoji, defaultGame: 'gift-catch', defaultAge: 'adult' };
  });
}

/* 저장된 참가자 목록에 지금 없는 사람만 들어 있으면(예전 기본 가족이 바뀐 방) 아무도 참가자가 아니게 된다.
   그러면 편집기가 "최소 한 명" 오류로 막히므로, 그럴 때는 주인공을 뺀 전원을 참가자로 되돌린다. */
function pickEnabled(wanted, allIds, hostId) {
  const kept = [...new Set(wanted)].filter((id) => allIds.has(id) && id !== hostId);
  if (kept.length) return kept;
  return [...allIds].filter((id) => id !== hostId);
}

function applyConfig(next) {
  const defaults = defaultConfig();
  const customMembers = sanitizeCustomMembers(next.customMembers);
  const removedIds = [...new Set(next.removedIds || [])].filter(
    (id) => baseMembers.some((member) => member.id === id) && id !== 'mom'
  );
  members = [
    ...baseMembers.filter((member) => !removedIds.includes(member.id)).map((member) => ({ ...member })),
    ...customMembers,
  ];
  const allIds = new Set(members.map((member) => member.id));
  const hostId = allIds.has(next.hostId) ? next.hostId : 'mom';
  // 편집기에서 정한 순서(memberOrder)대로 줄 세운다. 순서에 없는 사람(방금 추가 등)은 뒤에 붙는다.
  // 주인공은 어느 목록에서든 항상 맨 아래 — 주인공을 바꾸면 새 주인공이 자동으로 내려간다.
  // Array.sort는 안정 정렬이라 같은 순위끼리는 원래 순서가 유지된다.
  const order = Array.isArray(next.memberOrder) ? next.memberOrder : [];
  const rank = (member) => {
    const index = order.indexOf(member.id);
    return index < 0 ? order.length : index;
  };
  members.sort((a, b) => rank(a) - rank(b));
  members.sort((a, b) => (a.id === hostId) - (b.id === hostId));
  const memberGames = Object.fromEntries(
    Object.entries(next.memberGames || {}).filter(
      ([id, gameId]) => allIds.has(id) && gameCatalog.some((game) => game.id === gameId)
    )
  );
  const elderIds = [...new Set(next.elderIds || [])].filter((id) => allIds.has(id));
  // 나이대: 새 필드가 없으면 예전 고령자 체크에서 승격시킨다.
  const ageBands = {};
  members.forEach((member) => {
    const stored = (next.ageBands || {})[member.id];
    if (AGE_BANDS.some((band) => band.id === stored)) ageBands[member.id] = stored;
    else if (elderIds.includes(member.id)) ageBands[member.id] = 'senior';
    else ageBands[member.id] = member.defaultAge || 'adult';
  });

  config = {
    ...defaults,
    ...next,
    hostId,
    customMembers,
    memberGames,
    ageBands,
    elderIds,
    removedIds,
    enabledIds: pickEnabled(next.enabledIds || defaults.enabledIds, allIds, hostId),
  };

  document.body.dataset.theme = config.backgroundTheme;
  document.body.dataset.uploadedBackground = config.backgroundFile ? 'true' : 'false';
  if (config.backgroundFile) {
    document.body.style.setProperty(
      '--uploaded-background',
      `url("${partyAsset('background', `custom${config.backgroundFile}`)}?v=${config.backgroundVersion || 0}")`
    );
  } else {
    document.body.style.removeProperty('--uploaded-background');
  }

  members.forEach((member) => {
    member.name = config.names[member.id] || member.originalName;
    member.ageBand = config.ageBands[member.id] || 'adult';
    member.age = ageBandOf(member.ageBand);
    member.elder = member.ageBand === 'senior';
    const game = gameForMember(member);
    member.gameId = game.id;
    member.game = game.name;
    member.difficulty = game.difficulty;
  });

  state.completed = state.completed.filter((id) => config.enabledIds.includes(id));
  state.cake.ingredients = (state.cake.ingredients || []).filter((id) =>
    cakeIngredients().some((ingredient) => ingredient.id === id)
  );
  if (state.active === hostId) state.active = null;
  save();
}

/* after: 다 읽고 나서 열 화면. 코드를 막 넣은 사람은 이름 고르기로, 새로 만든 사람은 편집 모드로 간다. */
async function loadConfig(after = renderLobby) {
  // 코드가 없으면 어느 파티인지 모른다. 로비에서 "게임방 입장하기"를 누르면 코드 화면으로 간다.
  if (!partyCode) return renderLobby();
  await loadFaceKit();
  try {
    const response = await apiFetch(api('config'));
    // 서버에서 지워진 방일 수 있다. 저장해둔 코드를 놓아주고 처음 화면으로.
    if (response.status === 404) {
      setPartyCode('');
      return renderEntry('그 초대 코드는 이제 없어요. 코드를 다시 확인해주세요.');
    }
    if (response.ok) applyConfig(await response.json());
    else applyConfig({});
  } catch {
    applyConfig({});
  }
  // 아직 "파티 생성하기"를 누르지 않은 방은 가족이 들어올 수 없다(편집 중인 방)
  if (!isEditor && config.open === false) {
    setPartyCode('');
    return renderEntry('아직 준비 중인 파티예요. 잠시 뒤에 다시 들어와 주세요.');
  }
  await pullParty();
  startSync();
  // 첫 화면(로비)은 기록의 바닥이라 그냥 그린다.
  // 그 외(코드를 넣고 들어온 이름 고르기 등)는 navigate로 열어야 폰 뒤로가기가 한 칸씩 돌아간다.
  if (after === renderLobby) after();
  else navigate(after);
}

/* ---------- 셀렉터 ---------- */

const hostMember = () =>
  members.find((m) => m.id === config.hostId) || members.find((m) => m.id === 'mom') || members[0];
const playerMembers = () =>
  members.filter((m) => m.id !== config.hostId && config.enabledIds.includes(m.id));
const gameForMember = (member) =>
  gameCatalog.find((game) => game.id === config.memberGames?.[member.id]) ||
  gameCatalog.find((game) => game.id === member.defaultGame) ||
  gameCatalog[0];
const targetAmount = () => config.targetAmount || 500000;

function rewardFor(id) {
  const players = playerMembers();
  const index = players.findIndex((m) => m.id === id);
  if (index < 0 || !players.length) return 0;
  const base = Math.floor(targetAmount() / players.length / 1000) * 1000;
  const extra = Math.round((targetAmount() - base * players.length) / 1000);
  return base + (index < extra ? 1000 : 0);
}

const money = () => state.completed.reduce((sum, id) => sum + rewardFor(id), 0);
const pct = () => Math.round((money() / targetAmount()) * 100);
const statusOf = (id) =>
  state.completed.includes(id) ? 'clear' : state.active === id ? 'playing' : 'ready';
const allComplete = () => {
  const players = playerMembers();
  return players.length > 0 && players.every((m) => state.completed.includes(m.id));
};

/* ---------- 재료 모델 ---------- */

const foodIngredients = [
  { id: 'flour', emoji: '🌾', name: '밀가루' },
  { id: 'egg', emoji: '🥚', name: '달걀' },
  { id: 'sugar', emoji: '🍬', name: '설탕' },
  { id: 'butter', emoji: '🧈', name: '버터' },
  { id: 'cream', emoji: '🥛', name: '생크림' },
  { id: 'vanilla', emoji: '🌼', name: '바닐라' },
];

const magicIngredients = [
  { id: 'love', emoji: '💗', name: '사랑 한 스푼' },
  { id: 'cheer', emoji: '📣', name: '응원 한 줌' },
  { id: 'stardust', emoji: '✨', name: '별가루' },
  { id: 'smile', emoji: '😊', name: '웃음 가득' },
  { id: 'wish', emoji: '🌟', name: '소원 한 조각' },
];

const flavorIngredients = {
  strawberry: [
    { id: 'strawberry', emoji: '🍓', name: '딸기' },
    { id: 'jam', emoji: '🫐', name: '딸기 잼' },
  ],
  chocolate: [
    { id: 'cocoa', emoji: '🍫', name: '코코아' },
    { id: 'choco-chip', emoji: '🍪', name: '초코칩' },
  ],
  'sweet-potato': [
    { id: 'sweet-potato', emoji: '🍠', name: '고구마' },
    { id: 'nut', emoji: '🌰', name: '밤' },
  ],
  'fruit-cream': [
    { id: 'fruit', emoji: '🍑', name: '복숭아' },
    { id: 'peach', emoji: '🍊', name: '상큼한 과일' },
  ],
};

function cakeIngredients() {
  const flavor = flavorIngredients[config.cakeType] || flavorIngredients.strawberry;
  const actual = [...foodIngredients, ...flavor];
  const total = Math.max(playerMembers().length, actual.length);
  return Array.from({ length: total }, (_, index) => {
    const ingredient = actual[index] || magicIngredients[(index - actual.length) % magicIngredients.length];
    return { ...ingredient, id: `${ingredient.id}-${index}` };
  });
}

const ingredientFor = (memberId) => {
  const index = playerMembers().findIndex((member) => member.id === memberId);
  return index < 0 ? null : cakeIngredients()[index] || null;
};

const memberForIngredient = (ingredientId) => {
  const index = cakeIngredients().findIndex((item) => item.id === ingredientId);
  return index < 0 ? null : playerMembers()[index] || null;
};

const starterIngredients = () => cakeIngredients().slice(playerMembers().length);

const collectedIngredientIds = () =>
  new Set([
    ...starterIngredients().map((ingredient) => ingredient.id),
    ...state.completed.map((id) => ingredientFor(id)?.id).filter(Boolean),
  ]);

/* ---------- 토핑 ----------
   재료(밀가루·달걀)와는 완전히 별개다. 케이크 위에 올릴 수 있는 것만 넣는다.
   그림은 public/toppings/<케이크>/<번호>.png — 케이크마다 8종.
   config.toppings = ['strawberry/0', 'chocolate/3', …] 는 편집기에서 고른 토핑 줄이다.
   인원수와 상관없이 +/−로 늘리고 줄이며, 칸마다 모든 케이크의 토핑 중 하나로 바꿀 수 있다.
   비어 있으면 완성할 케이크의 기본 8종을 쓴다. 케이크를 바꾸면 기본으로 돌아간다. */

const toppingSets = {
  strawberry: [
    { id: 'strawberry', emoji: '🍓', name: '딸기' },
    { id: 'blueberry', emoji: '🫐', name: '블루베리' },
    { id: 'cherry', emoji: '🍒', name: '체리' },
    { id: 'flower', emoji: '🌸', name: '슈가 플라워' },
    { id: 'candy', emoji: '🍬', name: '별사탕' },
    { id: 'cupcake', emoji: '🧁', name: '미니 컵케이크' },
    { id: 'macaron', emoji: '🍥', name: '마카롱' },
    { id: 'lollipop', emoji: '🍭', name: '롤리팝' },
  ],
  chocolate: [
    { id: 'cream-rose', emoji: '🍦', name: '생크림 로제트' },
    { id: 'strawberry', emoji: '🍓', name: '딸기' },
    { id: 'choco-curl', emoji: '🍫', name: '초콜릿 컬' },
    { id: 'cherry', emoji: '🍒', name: '체리' },
    { id: 'raspberry', emoji: '🍓', name: '라즈베리' },
    { id: 'blueberry', emoji: '🫐', name: '블루베리' },
    { id: 'mint', emoji: '🌿', name: '민트 잎' },
    { id: 'choco-plate', emoji: '🍫', name: '초콜릿 장식' },
  ],
  'sweet-potato': [
    { id: 'sweet-potato', emoji: '🍠', name: '고구마칩' },
    { id: 'chestnut', emoji: '🌰', name: '밤' },
    { id: 'walnut', emoji: '🥜', name: '호두' },
    { id: 'honey', emoji: '🍯', name: '꿀 드리즐' },
    { id: 'leaf', emoji: '🍁', name: '시나몬 잎' },
    { id: 'cookie', emoji: '🍪', name: '크럼블' },
    { id: 'cherry', emoji: '🍒', name: '체리' },
    { id: 'flower', emoji: '🌼', name: '데이지 장식' },
  ],
  'fruit-cream': [
    { id: 'kiwi', emoji: '🥝', name: '키위' },
    { id: 'orange', emoji: '🍊', name: '오렌지' },
    { id: 'grape', emoji: '🍇', name: '포도' },
    { id: 'peach', emoji: '🍑', name: '복숭아' },
    { id: 'cherry', emoji: '🍒', name: '체리' },
    { id: 'mango', emoji: '🥭', name: '망고' },
    { id: 'blueberry', emoji: '🫐', name: '블루베리' },
    { id: 'mint', emoji: '🌿', name: '민트 잎' },
  ],
};

function defaultToppings(cake = config.cakeType) {
  const set = toppingSets[cake] ? cake : 'strawberry';
  return toppingSets[set].map((_, index) => `${set}/${index}`);
}

function toppingOf(ref) {
  const [cake, index] = String(ref).split('/');
  const base = toppingSets[cake]?.[Number(index)];
  return base ? { ...base, ref, src: `public/toppings/${cake}/${index}.png` } : null;
}

/* 교체 목록용 전체 토핑. 체리는 케이크마다 들어 있어서 네 번 겹쳐 보였다 — 첫 번째만 남긴다. */
const allToppings = () =>
  Object.keys(toppingSets)
    .flatMap((cake) => defaultToppings(cake).map(toppingOf))
    .filter((topping, index, all) => topping.id !== 'cherry' || all.findIndex((each) => each.id === 'cherry') === index);

function toppingList() {
  const chosen = (config.toppings || []).map(toppingOf).filter(Boolean);
  return chosen.length ? chosen : defaultToppings().map(toppingOf);
}

/* 이름과 그림이 한 객체라 따로 놀 수 없다. 줄이 줄어 예전 번호가 넘치면 앞에서부터 다시 쓴다. */
const toppingFor = (slot) => {
  const list = toppingList();
  return list[Number(slot) % list.length];
};

const selectedCake = () => cakes.find((cake) => cake.id === config.cakeType) || cakes[0];

/* ---------- 게임 스프라이트 ----------
   이모지는 OS마다 모양이 달라서 기기별로 게임 화면이 바뀐다.
   여기에 등록된 이모지는 public/game/ 의 그림으로 대체된다.
   등록되지 않은 건 이모지 그대로 — 그림이 없어도 게임은 그대로 돈다. */

const GAME_SPRITES = {
  '🎈': 'balloon',
  '🎁': 'gift',
  '❤️': 'heart',
  '💖': 'heart',
  '💝': 'heart',
  '⭐': 'star',
  '🍬': 'candy',
  '💣': 'bomb',
  '🧺': 'basket',
  '🫧': 'bubble',
  '🐧': 'penguin',
  '🧊': 'ice',
  '🐟': 'fish',
  '🔥': 'ring',
  '🤹': 'clown',
  '🦁': 'lion',
  '🕯️': 'candle',
  '💔': 'broken-heart',
};

const spriteFor = (emoji) => (GAME_SPRITES[emoji] ? `public/game/${GAME_SPRITES[emoji]}.png` : '');

/* 케이크 재료 그림. 그림이 있는 재료만 <img>를 낸다.
   (딸기 잼인데 블루베리 이모지가 나오던 문제를 그림으로 해결.
    없는 재료까지 그리면 화면을 그릴 때마다 404가 쌓여서 콘솔이 못 쓰게 된다) */
const INGREDIENT_ART = new Set([
  'flour', 'egg', 'sugar', 'butter', 'cream', 'vanilla', 'strawberry', 'jam',
]);

const ingredientArt = (ingredient) => {
  const base = String(ingredient.id).replace(/-\d+$/, '');
  if (!INGREDIENT_ART.has(base)) return escapeHtml(ingredient.emoji);
  return `<img src="public/game/ingredients/${base}.png" alt="">`;
};

/* 그림이 있으면 <img>, 없으면 이모지 그대로. 마크업 안에서 바로 쓴다. */
const spriteHtml = (emoji) => {
  const src = spriteFor(emoji);
  return src ? `<img class="sprite" src="${src}" alt="">` : escapeHtml(emoji);
};

/* ---------- 마크업 헬퍼 ---------- */

// 받침이 있으면 '을', 없으면 '를'. 한글 음절은 (코드 - 0xac00) % 28 이 0이 아니면 받침이 있다.
// 재료 이름이 설정에서 바뀌므로 "을(를)"로 얼버무리면 화면에 그대로 나온다.
// 한글이 아닌 글자로 끝나면 판단할 수 없으니 원래대로 "을(를)"을 쓴다.
const particle = (word, withFinal, withoutFinal) => {
  const last = String(word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (!last || code < 0 || code > 11171) return `${withFinal}(${withoutFinal})`;
  return code % 28 ? withFinal : withoutFinal;
};

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );

const RAW = Symbol('raw');
const raw = (html) => ({ [RAW]: String(html) });
const isRaw = (value) => value !== null && typeof value === 'object' && RAW in value;

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (isRaw(value)) return value[RAW];
  return escapeHtml(value);
}

function h(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += renderValue(values[i]) + strings[i + 1];
  return out;
}

const sticker = (content, { size = '', bg = '', tilt = -3, cls = '' } = {}) =>
  raw(
    `<span class="sticker ${size} ${cls}" style="--tilt:${tilt}deg${
      bg ? `;--sticker-bg:var(--${bg})` : ''
    }">${renderValue(content)}</span>`
  );

/* 네모 칩도 기울기도 없이 이모지만 크게. 칩에 담으면 기울어져 보인다는 지적. */
const art = (emoji, size = 'art--lg') => raw(`<span class="art ${size}">${escapeHtml(emoji)}</span>`);

/* 얼굴을 꾸민 사람은 파츠를 겹쳐 그리고(js/face.js), 아직이면 이모지.
   파츠 목록을 못 받았으면(file:// 등) 전부 이모지로 둔다. */
const avatar = (member, size = '') => {
  const face = typeof faceOf === 'function' ? faceOf(member) : null;
  return raw(`<span class="avatar ${size}">${face ? faceMarkup(face) : escapeHtml(member.emoji)}</span>`);
};

const progressBar = () =>
  raw(
    h`<div class="progress-top"><span>🎁 선물 게이지</span><span class="amount" id="money-amount">${money().toLocaleString()} / ${targetAmount().toLocaleString()}원</span></div><div class="progress"><i style="--fill:${pct()}%"></i></div>`
  );

const baseTop = (title) =>
  raw(
    h`<div class="topbar"><div class="topbar-side"><button class="btn btn--icon" id="back" aria-label="가족 목록으로">←</button></div><h1>${title}</h1><div class="topbar-side topbar-side--end"><span class="topbar-mute"></span>${
      isEditor ? raw('<button class="btn btn--icon" id="reset" aria-label="처음부터">↻</button>') : ''
    }</div></div>`
  );

/* 브라우저 confirm() 대신 화면 안에서 물어본다.

   confirm()은 같은 페이지에서 몇 번 뜨면 크롬이 "이 페이지에서 추가 대화상자를
   표시하지 않음"을 걸어버리고, 그 뒤로는 사용자가 누르지도 못한 채 무조건 false를
   돌려준다. 카카오톡·인스타 같은 인앱 브라우저에서도 그냥 무시되는 일이 많다.
   그러면 버튼이 "안 눌리는" 것처럼 보인다 — 실제로 재설정과 케이크 다시 만들기가
   그래서 죽어 있었다. */
function askConfirm(message, onYes, yesLabel = '네, 할게요') {
  document.querySelector('.ask')?.remove();

  const sheet = document.createElement('div');
  sheet.className = 'ask';
  sheet.innerHTML = h`<div class="ask-card" role="dialog" aria-modal="true">
    <p class="ask-text">${message}</p>
    <div class="btn-row">
      <button class="btn btn--ghost" type="button" data-no>취소</button>
      <button class="btn btn--primary" type="button" data-yes>${yesLabel}</button>
    </div>
  </div>`;
  document.body.append(sheet);
  sheet.querySelector('[data-yes]').focus();

  const close = () => {
    document.removeEventListener('keydown', onKey);
    sheet.remove();
  };
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  sheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-yes]')) {
      close();
      onYes();
      return;
    }
    // 취소 버튼이거나, 카드 바깥(어두운 배경)을 눌렀을 때
    if (event.target.closest('[data-no]') || !event.target.closest('.ask-card')) close();
  });
}

function bindReset() {
  const reset = document.querySelector('#reset');
  if (!reset) return;
  reset.onclick = () => {
    const scope = partyOnline ? ' 모든 가족의 폰에서 함께 초기화돼요.' : '';
    askConfirm('모든 진행 상황을 처음으로 되돌릴까요?' + scope, () => {
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
      state = defaultState();
      save();
      pushParty('reset');
      apiFetch(api('live'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      }).catch(() => {});
      toast('🔄 처음 상태로 되돌렸어요!');
      navigate(renderLobby);
    }, '처음부터 다시');
  };
}

function bindTop() {
  const back = document.querySelector('#back');
  if (back) back.onclick = () => navigate(renderIdentity);
  bindReset();
}

/* ---------- 연출 ---------- */

const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  document.body.dataset.motion === 'calm';

function announce(text) {
  if (liveRegion) liveRegion.textContent = text;
}

/* ---------- 배경 음악 ----------
   브라우저는 사용자가 화면을 한 번 건드리기 전에는 소리를 못 내게 막는다.
   그래서 첫 터치를 기다렸다가 튼다 — 로비의 "게임방 입장하기"가 보통 그 첫 터치다.
   리듬 게임처럼 자기 노래가 있는 화면에서는 bgmHush()로 잠깐 재운다. */
const bgm = new Audio('public/audio/bgm.mp3');
bgm.loop = true;
bgm.preload = 'auto';
let bgmHushed = 0;  // 재워둔 곳의 수. 겹쳐 불려도 한 번만 깨어나게 센다.

/* 소리 설정은 이 기기만의 것이다. 파티 상태로 올리지 않는다 —
   한 사람이 끄면 온 가족 폰이 같이 꺼지면 곤란하다.
   sound.music(배경 음악·게임 노래)과 sound.sfx(효과음, sfx.js가 읽는다)는 0~1. 0이면 꺼짐. */
const SOUND_KEY = 'mom-birthday-sound';
const sound = { music: 1, sfx: 1 };
try {
  const stored = localStorage.getItem(SOUND_KEY);
  if (stored) Object.assign(sound, JSON.parse(stored));
  // 예전 음소거 버튼으로 꺼 두었던 기기는 둘 다 꺼진 채로 이어간다
  else if (localStorage.getItem('mom-birthday-mute') === '1') Object.assign(sound, { music: 0, sfx: 0 });
} catch { /* 못 읽으면 기본값 */ }

// 지금 살아 있는 음악들. 음악 크기를 바꾸면 게임 노래까지 같이 따라가야 한다.
// 곡마다 원래 크기(baseVolume)가 있고, 거기에 음악 설정을 곱한다.
const tracks = new Set();
const applyTrackVolume = (audio) => {
  audio.volume = Math.min(Math.max((audio.baseVolume ?? 1) * sound.music, 0), 1);
  audio.muted = sound.music === 0;
};
const addTrack = (audio, baseVolume = 1) => {
  audio.baseVolume = baseVolume;
  applyTrackVolume(audio);
  tracks.add(audio);
  return audio;
};
const dropTrack = (audio) => tracks.delete(audio);
addTrack(bgm, 0.3);   // 게임 소리와 목소리를 덮지 않을 만큼만

const bgmPlay = () => {
  if (bgmHushed || !sound.music) return;
  const started = bgm.play();
  if (started && started.catch) started.catch(() => {});  // 아직 막혀 있으면 다음 터치를 기다린다
};

// 소리가 날 때까지 첫 터치마다 다시 시도한다(한 번 성공하면 뗀다)
const bgmWake = () => {
  bgmPlay();
  if (!bgm.paused) document.removeEventListener('pointerdown', bgmWake);
};
document.addEventListener('pointerdown', bgmWake);

function bgmHush() {
  bgmHushed += 1;
  bgm.pause();
}

function bgmResume() {
  bgmHushed = Math.max(bgmHushed - 1, 0);
  bgmPlay();
}

/* 소리 버튼. 누르면 배경 음악·효과음 크기를 고르는 작은 탭이 열린다.
   버튼은 body에 한 번만 만들어 두고, 화면마다 상단바가 새로 그려질 때 그 자리로 옮겨 담는다.
   상단바가 없는 로비에서는 body에 붙어 오른쪽 아래에 뜬다.
   예전엔 계속 오른쪽 아래에 떠 있게 했는데, 게임의 "도와주세요"와 케이크 재료 버튼,
   완성 화면의 "다시 만들기"를 가려서 눌리지 않았다. */
const muteButton = document.createElement('button');
muteButton.type = 'button';
muteButton.className = 'mute-btn';
muteButton.id = 'mute';
muteButton.setAttribute('aria-label', '소리 설정');
muteButton.setAttribute('aria-haspopup', 'dialog');
muteButton.setAttribute('aria-expanded', 'false');

const SOUND_LABELS = { music: '🎵 배경 음악', sfx: '🔔 효과음' };
const soundPanel = document.createElement('div');
soundPanel.className = 'sound-panel hidden';
soundPanel.setAttribute('role', 'dialog');
soundPanel.setAttribute('aria-label', '소리 설정');
soundPanel.innerHTML = Object.entries(SOUND_LABELS)
  .map(
    ([kind, label]) => `<div class="sound-row">
      <span>${label}</span>
      <button class="btn btn--chip" type="button" data-sound-toggle="${kind}"></button>
      <input type="range" min="0" max="100" step="5" data-sound="${kind}" aria-label="${label} 크기">
    </div>`
  )
  .join('');
document.body.append(soundPanel);

// 껐다가 다시 켤 때 돌아갈 크기
const lastLevel = { music: sound.music || 1, sfx: sound.sfx || 1 };

const closeSound = () => {
  soundPanel.classList.add('hidden');
  muteButton.setAttribute('aria-expanded', 'false');
};

function mountMute() {
  closeSound();
  const slot = document.querySelector('.topbar-mute');
  (slot || document.body).append(muteButton);
}

const paintMute = () => {
  const total = sound.music + sound.sfx;
  muteButton.textContent = total === 0 ? '🔇' : total < 2 ? '🔉' : '🔊';
  soundPanel.querySelectorAll('[data-sound]').forEach((input) => {
    input.value = String(Math.round(sound[input.dataset.sound] * 100));
  });
  soundPanel.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    button.textContent = sound[button.dataset.soundToggle] ? '끄기' : '켜기';
  });
};

function setSound(kind, level) {
  sound[kind] = Math.min(Math.max(level, 0), 1);
  if (sound[kind]) lastLevel[kind] = sound[kind];
  try { localStorage.setItem(SOUND_KEY, JSON.stringify(sound)); } catch { /* 저장 못 해도 이번 판은 먹힌다 */ }
  if (kind === 'music') {
    tracks.forEach(applyTrackVolume);
    bgmPlay();
  }
  paintMute();
}

muteButton.addEventListener('click', () => {
  if (!soundPanel.classList.contains('hidden')) return closeSound();
  // 버튼 오른쪽 끝에 맞춰 연다. 상단바 버튼이면 아래로, 로비의 오른쪽 아래 버튼이면 위로.
  const box = muteButton.getBoundingClientRect();
  const below = box.top < window.innerHeight / 2;
  soundPanel.style.setProperty('--panel-right', `${Math.max(window.innerWidth - box.right, 8)}px`);
  soundPanel.style.setProperty('--panel-y', `${below ? box.bottom + 8 : window.innerHeight - box.top + 8}px`);
  soundPanel.classList.toggle('sound-panel--up', !below);
  soundPanel.classList.remove('hidden');
  muteButton.setAttribute('aria-expanded', 'true');
});

soundPanel.addEventListener('input', (event) => {
  const kind = event.target.dataset.sound;
  if (kind) setSound(kind, Number(event.target.value) / 100);
});

// 효과음 크기를 정하고 손을 떼면 한 번 들려준다
soundPanel.addEventListener('change', (event) => {
  if (event.target.dataset.sound === 'sfx' && typeof sfx === 'function') sfx('pop');
});

soundPanel.addEventListener('click', (event) => {
  const kind = event.target.closest('[data-sound-toggle]')?.dataset.soundToggle;
  if (kind) setSound(kind, sound[kind] ? 0 : lastLevel[kind]);
});

// 탭 바깥을 누르거나 Esc면 닫는다
document.addEventListener(
  'pointerdown',
  (event) => {
    if (soundPanel.classList.contains('hidden')) return;
    if (soundPanel.contains(event.target) || muteButton.contains(event.target)) return;
    closeSound();
  },
  true
);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSound();
});

paintMute();
mountMute();   // 첫 화면(로비)은 상단바가 없어서 body에 붙는다

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  announce(message);
  setTimeout(() => node.remove(), 2200);
}

const CONFETTI = ['🎉', '🎈', '⭐', '💗', '✨', '🎁'];

function burst(x, y, { count = 16, emoji = CONFETTI, spread = 260, lift = 200 } = {}) {
  if (reduceMotion()) return;
  for (let index = 0; index < count; index += 1) {
    const node = document.createElement('i');
    node.className = 'particle';
    node.textContent = emoji[index % emoji.length];
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.fontSize = `${14 + Math.random() * 16}px`;
    node.style.setProperty('--dx', `${(Math.random() - 0.5) * spread}px`);
    node.style.setProperty('--dy', `${-lift - Math.random() * lift}px`);
    node.style.setProperty('--rot', `${(Math.random() - 0.5) * 900}deg`);
    node.style.animationDelay = `${Math.random() * 90}ms`;
    document.body.append(node);
    setTimeout(() => node.remove(), 1150);
  }
}

/* 응원 하트. 화면 좌우 가장자리에서만 떠오른다.
   문구로 알리면 게임 중에 읽을 틈이 없고, 가운데로 띄우면 하던 걸 가린다.
   그래서 가장자리 띠 안에서만, 반투명으로. */
const CHEER_HEARTS = ['❤️', '💗', '💖', '💕', '🩷'];

function cheerHearts(count = 8) {
  if (reduceMotion()) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (let index = 0; index < count; index += 1) {
    const node = document.createElement('i');
    node.className = 'cheer-heart';
    node.textContent = CHEER_HEARTS[index % CHEER_HEARTS.length];
    const size = 22 + Math.random() * 18;
    // 좌우 번갈아. 가장자리에서 화면 폭의 14% 안쪽까지만 쓴다.
    const inset = Math.random() * width * 0.14;
    const right = index % 2 === 1;
    node.style.left = `${right ? Math.max(width - inset - size, 0) : inset}px`;
    node.style.top = `${height - size}px`;
    node.style.fontSize = `${size}px`;
    node.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    node.style.setProperty('--dy', `${-height * (0.6 + Math.random() * 0.35)}px`);
    node.style.setProperty('--tilt', `${(Math.random() - 0.5) * 50}deg`);
    node.style.animationDelay = `${index * 80}ms`;
    document.body.append(node);
    setTimeout(() => node.remove(), 2400 + index * 80);
  }
}

function burstFrom(element, options) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  burst(box.left + box.width / 2, box.top + box.height / 2, options);
}

function pulse(element, kind = 'pop') {
  if (!element || reduceMotion()) return;
  const cls = `pulse-${kind}`;
  element.classList.remove(cls);
  void element.offsetWidth;
  element.classList.add(cls);
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true;
    element.classList.remove(cls);
  };
  element.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, 700);
}

/* content 는 마크업이다. 재료처럼 그림이 있는 것은 <img>가 날아가야 하기 때문이다.
   호출부는 이모지 리터럴이나 ingredientArt() 결과만 넘긴다 — 사용자 문자열을 그대로 넣지 말 것. */
function flyTo(fromElement, toElement, content, done) {
  const finish = () => {
    if (typeof done === 'function') done();
  };
  if (!fromElement || !toElement) return finish();
  const from = fromElement.getBoundingClientRect();
  const to = toElement.getBoundingClientRect();
  if (reduceMotion()) return finish();
  const node = document.createElement('span');
  node.className = 'flyer';
  node.innerHTML = content;
  node.style.left = `${from.left + from.width / 2}px`;
  node.style.top = `${from.top + from.height / 2}px`;
  node.style.setProperty('--dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
  node.style.setProperty('--dy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
  node.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
  document.body.append(node);
  setTimeout(() => {
    node.remove();
    finish();
  }, 850);
}

function countUp(element, to, suffix = '') {
  if (!element) return;
  if (reduceMotion()) {
    element.textContent = to.toLocaleString() + suffix;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 700, 1);
    const eased = 1 - (1 - t) * (1 - t);
    element.textContent = Math.round(to * eased).toLocaleString() + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 화면 전환 ---------- */

let navBusy = false;

/* 화면 연출용 타이머. 게임(ctx.after)도 케이크(cakeAfter)도 아닌,
   그냥 화면 하나에서 순서대로 뭔가 일어나게 할 때 쓴다.
   navigate()가 화면을 바꿀 때 한 번에 정리되므로 누수가 발생할 수 없다. */
const screenTimers = new Set();
function screenAfter(ms, fn) {
  const t = setTimeout(() => {
    screenTimers.delete(t);
    fn();
  }, ms);
  screenTimers.add(t);
  return t;
}
function stopScreenTimers() {
  screenTimers.forEach(clearTimeout);
  screenTimers.clear();
}

/* 폰 자체 뒤로가기 버튼으로 앱 안에서 한 칸씩 돌아간다.
   화면을 열 때마다 어떤 화면이었는지 쌓아두고 방문 기록도 하나 남긴다.
   뒤로가기가 오면 바로 직전 화면을 다시 그린다(기록을 새로 쌓지 않게 goingBack으로 표시).
   첫 화면에서 또 누르면 남은 기록이 없으니 원래대로 브라우저가 앱을 닫는다. */
const screenTrail = [];
let goingBack = false;

window.addEventListener('popstate', () => {
  if (screenTrail.length < 2) return;
  screenTrail.pop();
  const previous = screenTrail[screenTrail.length - 1];
  goingBack = true;
  navigate(previous.render, ...previous.args);
});

function navigate(render, ...args) {
  if (navBusy) return;
  navBusy = true;
  if (typeof stopGame === 'function') stopGame();
  if (typeof stopCake === 'function') stopCake();
  if (typeof stopWatch === 'function') stopWatch();
  stopScreenTimers();
  onPartyChange = null;
  const leaving = app.firstElementChild;
  const done = () => {
    // render가 던져도 navBusy는 반드시 풀어야 한다.
    // 안 그러면 화면 전환이 영영 잠겨서 모든 버튼이 안 눌리는 것처럼 보인다.
    try {
      app.innerHTML = '';
      render(...args);
      const entered = app.firstElementChild;
      if (entered && !reduceMotion()) entered.classList.add('screen-enter');
      if (goingBack) {
        goingBack = false;
      } else {
        // 첫 화면(로비)은 navigate를 거치지 않고 그려지므로 기록의 바닥으로 깔아둔다.
        // 이게 없으면 첫 이동 때 기록이 안 쌓여서 폰 뒤로가기가 바로 앱을 닫아버린다.
        if (!screenTrail.length) screenTrail.push({ render: renderLobby, args: [] });
        screenTrail.push({ render, args });
        history.pushState({ depth: screenTrail.length }, '');
      }
      mountMute();
      announce(app.querySelector('h1')?.textContent || '');
    } finally {
      navBusy = false;
    }
  };
  if (!leaving || reduceMotion()) {
    done();
    return;
  }
  leaving.classList.add('screen-exit');
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    done();
  };
  leaving.addEventListener('animationend', go, { once: true });
  setTimeout(go, 220);
}

/* ---------- 공용 유틸 ---------- */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randBetween = (min, max) => min + Math.random() * (max - min);
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pointerPos(event, element) {
  const box = element.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top, box };
}
