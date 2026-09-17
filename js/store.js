/* =========================================================
   store.js — 저장소 (Supabase)

   예전엔 PC에서 serve.cjs 가 파티 설정·진행 상황·관전 중계를 들고 있었다.
   PC가 꺼져도 돌아가게 Supabase 로 옮겼다.

   화면 코드는 예전 그대로 fetch('api/…') 모양으로 부른다. apiFetch 가
   같은 모양의 응답(Response)을 Supabase 에서 만들어 돌려준다.
   서버가 하던 입력 정리(sanitize)도 여기서 한다.

   누가 뭘 고칠 수 있나 (supabase/schema.sql 참고)
     설정·얼굴  : 파티를 만든 기기만 (주최자 열쇠)
     진행 상황  : 코드를 아는 가족 누구나
     관전 중계  : 저장하지 않는다. Realtime 방송으로 흘려보낸다

   core.js 뒤, 화면 스크립트 앞에 싣는다. partyCode·partyRev·config 를 core.js 에서 빌려 쓴다.
   ========================================================= */

const db = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const OWNER_KEY_PREFIX = 'mom-birthday-owner:';

/* ---------- 주최자 열쇠 ----------
   파티를 만든 기기에만 있다. 이 열쇠가 있어야 설정·얼굴을 저장할 수 있다. */
function ownerKey(code = partyCode) {
  try { return localStorage.getItem(OWNER_KEY_PREFIX + code) || ''; } catch { return ''; }
}

function randomText(length, chars) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => chars[byte % chars.length]).join('');
}

/* 새 파티. 코드와 열쇠만 이 기기에 만들어 둔다 — 저장하기 전까진 서버에 아무것도 없다.
   코드가 이미 있으면 다시 뽑는다. 32글자 5자리라 거의 안 겹친다. */
async function mintParty() {
  for (let tries = 0; tries < 5; tries += 1) {
    const code = randomText(5, CODE_CHARS);
    const { data, error } = await db.rpc('mbg_config', { p_code: code });
    if (error) throw new Error('서버에 닿지 못했어요.');
    if (data) continue;
    try {
      localStorage.setItem(OWNER_KEY_PREFIX + code, randomText(40, CODE_CHARS + 'abcdefghijkmnopqrstuvwxyz'));
    } catch {
      throw new Error('이 브라우저에는 저장할 수 없어요. 비공개 창이면 일반 창에서 열어주세요.');
    }
    return code;
  }
  throw new Error('파티방을 만들지 못했어요. 다시 시도해주세요.');
}

/* ---------- 입력 정리 (예전 serve.cjs 에 있던 것) ---------- */

const MEMBER_IDS = new Set(['grandma', 'grandpa', 'uncle', 'dad', 'me', 'sibling', 'mom']);
const AGE_BAND_IDS = new Set(['kid', 'adult', 'senior']);
const GAME_IDS = new Set(['balloon-pop', 'candle', 'gift-catch', 'heart-catch', 'timing', 'spot-difference', 'antarctic', 'circus-charlie', 'bubble-pop', 'brick-breaker', 'rhythm']);
const THEMES = new Set(['party', 'garden', 'lake', 'seaside']);
const CAKE_TYPES = new Set(['strawberry', 'chocolate', 'sweet-potato', 'fruit-cream']);

// 화면 쪽 sanitizeCustomMembers 와 다르다: 잘못된 줄은 새 id 를 만들지 않고 버리고, 저장할 칸만 남긴다
function cleanCustomMembers(value) {
  const used = new Set(MEMBER_IDS);
  return (Array.isArray(value) ? value : []).slice(0, 20).flatMap((member, index) => {
    if (!member || typeof member.id !== 'string' || !/^guest-[a-z0-9-]+$/.test(member.id) || used.has(member.id)) return [];
    used.add(member.id);
    const name = typeof member.name === 'string' ? member.name.trim().slice(0, 30) : '';
    const emoji = typeof member.emoji === 'string' ? member.emoji.trim().slice(0, 8) : '';
    return [{ id: member.id, name: name || `새 가족 ${index + 1}`, emoji: emoji || '🙂' }];
  });
}

function cleanConfig(body, existing) {
  const customMembers = cleanCustomMembers(body.customMembers === undefined ? existing.customMembers : body.customMembers);
  const removedIds = (Array.isArray(body.removedIds) ? [...new Set(body.removedIds)] : existing.removedIds || [])
    .filter((id) => MEMBER_IDS.has(id) && id !== 'mom');
  const allIds = new Set([...MEMBER_IDS].filter((id) => !removedIds.includes(id)).concat(customMembers.map((m) => m.id)));
  const names = Object.fromEntries(Object.entries(body.names || {})
    .filter(([id, name]) => allIds.has(id) && typeof name === 'string')
    .map(([id, name]) => [id, name.trim().slice(0, 30)]));
  const requestedHost = typeof body.hostId === 'string' ? body.hostId : existing.hostId;
  const hostId = allIds.has(requestedHost) ? requestedHost : 'mom';
  const enabledIds = (Array.isArray(body.enabledIds) ? body.enabledIds : existing.enabledIds || [])
    .filter((id) => allIds.has(id) && id !== hostId);
  const memberGames = Object.fromEntries(Object.entries(body.memberGames || existing.memberGames || {})
    .filter(([id, gameId]) => allIds.has(id) && GAME_IDS.has(gameId)));
  const ageBands = Object.fromEntries(Object.entries(body.ageBands || existing.ageBands || {})
    .filter(([id, band]) => allIds.has(id) && AGE_BAND_IDS.has(band)));
  const elderIds = (Array.isArray(body.elderIds) ? [...new Set(body.elderIds)] : existing.elderIds || [])
    .filter((id) => allIds.has(id));
  // 편집기에서 ▲▼로 정한 가족 순서 (주인공이 맨 아래로 가는 건 화면 쪽에서 처리)
  const memberOrder = (Array.isArray(body.memberOrder) ? [...new Set(body.memberOrder)] : existing.memberOrder || [])
    .filter((id) => allIds.has(id));
  // 한 번 연 방은 계속 열려 있다 (서버도 한 번 더 지킨다)
  const open = body.open === true || existing.open === true;
  const targetAmount = Number(body.targetAmount);
  if (!enabledIds.length) throw new Error('최소 한 명의 게임 참가자가 필요해요.');
  if (!Number.isInteger(targetAmount) || targetAmount < 10000 || targetAmount > 10000000 || targetAmount % 1000 !== 0) {
    throw new Error('금액은 10,000원 이상 10,000,000원 이하, 1,000원 단위로 입력해주세요.');
  }
  const backgroundTheme = THEMES.has(body.backgroundTheme) ? body.backgroundTheme : existing.backgroundTheme;
  const cakeType = CAKE_TYPES.has(body.cakeType) ? body.cakeType : existing.cakeType;
  // 토핑 줄: '케이크/번호' 목록. 그림은 public/toppings/<케이크>/<번호>.png (케이크마다 0~7)
  const toppings = Array.isArray(body.toppings)
    ? body.toppings.filter((ref) => typeof ref === 'string' && /^(strawberry|chocolate|sweet-potato|fruit-cream)\/[0-7]$/.test(ref)).slice(0, 30)
    : existing.toppings || [];
  return { names, enabledIds, targetAmount, backgroundTheme, cakeType, toppings, memberOrder, open, memberGames, ageBands, customMembers, elderIds, removedIds, hostId };
}

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

function cleanFace(value) {
  const face = value && typeof value === 'object' ? value : {};
  const parts = {};
  const color = {};
  const adjust = {};
  for (const layer of faceKit?.layers || []) {
    const files = new Set(layer.items.map((item) => item.file));
    const wanted = face.parts?.[layer.id];
    const picked = layer.multi
      ? [...new Set([].concat(wanted || []).filter((entry) => typeof entry === 'string').map((entry) => (layer.repeat ? entry : entry.split('#')[0])))]
          .filter((entry) => /^[^#]+(#[a-z0-9]{1,12})?$/.test(entry) && files.has(entry.split('#')[0]))
          .slice(0, 20)
      : (files.has(wanted) ? [wanted] : []);
    if (layer.multi) parts[layer.id] = picked;
    else if (picked.length) parts[layer.id] = picked[0];
    for (const file of picked) {
      const key = layer.multi ? `${layer.id}/${file}` : layer.id;
      const hex = face.color?.[key];
      if (layer.color && /^#[0-9a-f]{6}$/i.test(hex || '')) color[key] = hex.toLowerCase();
      const a = face.adjust?.[key];
      if (layer.adjust && a && typeof a === 'object') {
        adjust[key] = { x: clampNumber(a.x, -20, 20, 0), y: clampNumber(a.y, -20, 20, 0), sx: clampNumber(a.sx, 0.5, 2, 1), sy: clampNumber(a.sy, 0.5, 2, 1), gap: clampNumber(a.gap, -15, 15, 0) };
      }
    }
  }
  return { parts, color, adjust, flip: face.flip === true };
}

// 서버가 돌려주던 설정 모양: 기본값 위에 저장된 값
const withDefaults = (saved) => ({ ...defaultConfig(), open: true, ...saved });

/* ---------- 관전 중계 (Realtime 방송) ----------
   예전 서버는 메모리에 사람마다 마지막 화면 한 장을 두고, 관전자가 "rev 번까지 봤다"고
   물으면 새 화면이 올 때까지 붙잡아 뒀다(롱폴링). 같은 약속을 이 기기 안에서 지킨다 —
   방송으로 받은 화면을 여기 모아두고, 물어보면 바뀔 때까지 기다렸다 준다. */

const LIVE_TTL = 6000;
const LIVE_WAIT = 4000;
/* ponytail: 무료 요금제는 초당·월간 메시지 수에 한도가 있다. 예전 서버는 초당 14장을 보냈지만
   관전자 수만큼 곱해서 세어지므로 초당 4장으로 줄이고, 화면이 그대로면 2초에 한 번만 보낸다.
   더 부드럽게 하려면 이 값을 줄이되 Supabase 사용량(Realtime messages)을 같이 볼 것 */
const LIVE_SEND_GAP = 250;
const LIVE_KEEPALIVE = 2000;

const live = { code: '', channel: null, frames: new Map(), cheers: new Map(), rev: 0, waiters: new Set(), sent: new Map() };

function liveBump() {
  live.rev += 1;
  for (const wake of live.waiters) wake();
  live.waiters.clear();
}

function livePrune() {
  const now = Date.now();
  let dropped = false;
  for (const [id, frame] of live.frames) {
    if (now - frame.ts >= LIVE_TTL) { live.frames.delete(id); dropped = true; }
  }
  if (dropped) live.rev += 1;
}

// 남이 보낸 HTML 을 그대로 화면에 꽂으므로, 받는 쪽에서 스크립트를 걸러낸다 (예전엔 서버가 했다)
const cleanLiveHtml = (html) =>
  String(html || '').slice(0, 24000).replace(/<script/gi, '&lt;script').replace(/\son\w+\s*=/gi, ' data-x=');

function liveChannel() {
  if (live.channel && live.code === partyCode) return live.channel;
  if (live.channel) db.removeChannel(live.channel);
  live.code = partyCode;
  live.frames.clear();
  live.cheers.clear();
  live.sent.clear();
  live.channel = db
    .channel(`mbg-live-${partyCode}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'frame' }, ({ payload: p }) => {
      if (!p || typeof p.memberId !== 'string') return;
      live.frames.set(p.memberId, {
        memberId: p.memberId.slice(0, 40),
        name: String(p.name || '').slice(0, 40),
        game: String(p.game || '').slice(0, 60),
        zoneClass: String(p.zoneClass || '').slice(0, 120),
        w: clampNumber(p.w, 0, 4000, 0),
        h: clampNumber(p.h, 0, 4000, 0),
        hits: Number(p.hits) || 0,
        goal: Number(p.goal) || 5,
        lives: clampNumber(p.lives, 0, 3, 3),
        html: cleanLiveHtml(p.html),
        ts: Date.now(),
      });
      liveBump();
    })
    .on('broadcast', { event: 'clear' }, ({ payload: p }) => {
      if (p?.memberId) live.frames.delete(String(p.memberId));
      else live.frames.clear();
      liveBump();
    })
    .on('broadcast', { event: 'cheer' }, ({ payload: p }) => {
      const id = String(p?.memberId || '');
      if (id) live.cheers.set(id, (live.cheers.get(id) || 0) + 1);
    })
    .subscribe();
  return live.channel;
}

const liveSend = (event, payload) => liveChannel().send({ type: 'broadcast', event, payload }).catch(() => {});

async function liveGet(wantRev) {
  liveChannel();
  livePrune();
  if (!Number.isFinite(wantRev) || wantRev !== live.rev) return { frames: [...live.frames.values()], rev: live.rev };
  await new Promise((resolve) => {
    const timer = setTimeout(() => { live.waiters.delete(wake); resolve(); }, LIVE_WAIT);
    const wake = () => { clearTimeout(timer); resolve(); };
    live.waiters.add(wake);
  });
  livePrune();
  return { frames: [...live.frames.values()], rev: live.rev };
}

async function livePost(body) {
  liveChannel();
  const memberId = String(body.memberId || '').slice(0, 40);
  if (body.clear) {
    if (memberId) live.frames.delete(memberId);
    else live.frames.clear();
    liveBump();
    await liveSend('clear', { memberId: memberId || null });
    return { ok: true };
  }
  // 보내는 쪽은 70ms마다 부른다. 간격이 찰 때까지 여기서 기다리게 해서 속도를 맞춘다.
  const last = live.sent.get(memberId) || { at: 0, html: null };
  const wait = LIVE_SEND_GAP - (Date.now() - last.at);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const html = String(body.html || '').slice(0, 24000);
  if (html !== last.html || Date.now() - last.at >= LIVE_KEEPALIVE) {
    live.sent.set(memberId, { at: Date.now(), html });
    await liveSend('frame', { ...body, memberId, html });
  }
  return { ok: true, cheers: live.cheers.get(memberId) || 0 };
}

/* ---------- api/… 대신 ---------- */

const reply = (status, value) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const rpc = async (name, args) => {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
};

// Postgres 가 던진 한국어 문구는 그대로 보여주고, 연결 문제면 공통 문구
const failText = (error, fallback) => (/[가-힣]/.test(error?.message || '') ? error.message : fallback);

async function apiFetch(path, init = {}) {
  const url = new URL(path, 'http://x/');
  const route = url.pathname.replace(/^\/api\//, '');
  const code = validCode(url.searchParams.get('code')) || partyCode;
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : {};

  try {
    if (route === 'config' && method === 'GET') {
      const saved = await rpc('mbg_config', { p_code: code });
      if (saved) return reply(200, withDefaults(saved));
      // 이 기기가 만든, 아직 저장 안 한 파티는 기본값을 닫힌 채로
      if (isEditor && ownerKey(code)) return reply(200, { ...withDefaults({}), open: false });
      return reply(404, { ok: false, error: '그런 초대 코드가 없어요. 다시 확인해주세요.' });
    }

    if (route === 'config' && method === 'POST') {
      let clean;
      try { clean = cleanConfig(body, config); } catch (error) { return reply(400, { ok: false, error: error.message }); }
      const saved = await rpc('mbg_save_config', { p_code: code, p_key: ownerKey(code), p_config: clean });
      return reply(200, { ok: true, config: withDefaults(saved) });
    }

    const faceMatch = route.match(/^face\/([a-z0-9-]+)$/);
    if (faceMatch && method === 'POST') {
      const saved = await rpc('mbg_save_face', {
        p_code: code, p_key: ownerKey(code), p_member: faceMatch[1], p_face: cleanFace(body.face),
      });
      return reply(200, { ok: true, config: withDefaults(saved) });
    }

    if (route === 'party' && method === 'GET') {
      return reply(200, await rpc('mbg_state', { p_code: code, p_rev: partyRev }));
    }

    if (route === 'party' && method === 'POST') {
      const memberId = typeof body.memberId === 'string' ? body.memberId : null;
      if (body.op === 'cheer' && memberId) liveSend('cheer', { memberId });
      const result = await rpc('mbg_op', {
        p_code: code, p_op: String(body.op || ''), p_member: memberId, p_payload: body,
      });
      return reply(200, result);
    }

    if (route === 'live' && method === 'GET') {
      return reply(200, await liveGet(Number(url.searchParams.get('rev'))));
    }
    if (route === 'live' && method === 'POST') {
      return reply(200, await livePost(body));
    }
  } catch (error) {
    const fallback = route === 'party' ? '진행 상황을 저장하지 못했어요.' : '서버에 닿지 못했어요.';
    return reply(400, { ok: false, error: failText(error, fallback) });
  }

  return reply(404, { ok: false, error: '없는 주소예요.' });
}
