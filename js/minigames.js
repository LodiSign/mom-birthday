/* ============================================================
   minigames.js — 공용 하네스 + 10종
   규칙: 게임 안에서는 CSS 애니메이션을 쓰지 않는다.
   모든 모션은 rAF + transform. (reduced-motion 브레이크가 게임을 멈추면 안 되므로)
   ============================================================ */

const MINIGAMES = {};
const defineGame = (id, factory) => {
  MINIGAMES[id] = factory;
};

/* 게임 기본 난이도. 여기에 나이대 밴드 배수가 곱해진다. */
const DIFF = {
  쉬움: { speed: 1.35, spawnMs: 760, lifeMs: 1700, windowPct: 17, goal: 6 },
  보통: { speed: 1.8, spawnMs: 560, lifeMs: 1250, windowPct: 11, goal: 7 },
  어려움: { speed: 2.4, spawnMs: 430, lifeMs: 950, windowPct: 8, goal: 9 },
};

function tuneDifficulty(spec, band) {
  const base = DIFF[spec.difficulty] || DIFF['보통'];
  return {
    speed: base.speed * band.speed,
    spawnMs: base.spawnMs * band.spawn,
    lifeMs: base.lifeMs * band.life,
    windowPct: Math.min(base.windowPct * band.window, 46),
    goal: Math.max(3, base.goal + band.goalShift),
    scale: band.scale,
    hazards: band.hazards,
    helpAfter: band.helpAfter,
  };
}

let session = null;

/* 같은 사람이 같은 게임을 몇 번째 도전 중인지.
   하트를 다 쓰면 다시 시작하는데, 계속 못 깨면 도움 버튼을 미리 꺼내주려고 센다. */
let lastGameKey = '';
let gameTries = 0;

const MAX_LIVES = 3;

const livesMarkup = (left) =>
  Array.from({ length: MAX_LIVES }, (_, i) => `<i class="${i < left ? '' : 'spent'}">❤️</i>`).join('');

function startLoop() {
  if (!session || session.raf) return;
  let last = performance.now();
  const step = (now) => {
    if (!session) return;
    const dt = Math.min(now - last, 50);
    last = now;
    session.tick.forEach((fn) => fn(dt));
    session.raf = requestAnimationFrame(step);
  };
  session.raf = requestAnimationFrame(step);
}

function stopGame() {
  if (!session) return;
  session.timers.forEach((t) => {
    clearInterval(t);
    clearTimeout(t);
  });
  if (session.raf) cancelAnimationFrame(session.raf);
  session.cleanup.forEach((fn) => {
    try {
      fn();
    } catch {
      /* 정리 중 오류는 무시 */
    }
  });
  session = null;
}

function startGame(member) {
  stopGame();
  const spec = gameForMember(member);
  const band = member.age || ageBandOf(member.ageBand);
  const d = tuneDifficulty(spec, band);
  const zone = document.querySelector('#zone');
  if (!zone) return;

  const s = { timers: new Set(), raf: 0, tick: [], cleanup: [] };
  session = s;

  const key = `${member.id}:${spec.id}`;
  if (key !== lastGameKey) {
    lastGameKey = key;
    gameTries = 0;
  }
  gameTries += 1;

  const ctx = {
    member,
    spec,
    band,
    d,
    zone,
    elder: member.ageBand === 'senior',
    hits: 0,
    misses: 0,
    goal: d.goal,
    lives: MAX_LIVES,
    won: false,
    over: false,
    W: zone.clientWidth,
    H: zone.clientHeight,
  };

  const measure = () => {
    ctx.W = zone.clientWidth;
    ctx.H = zone.clientHeight;
  };
  window.addEventListener('resize', measure);
  s.cleanup.push(() => window.removeEventListener('resize', measure));

  // 탭이 뒤로 가면 rAF는 멈추는데 setInterval은 계속 돈다.
  // 그대로 두면 화면 위에 스폰만 잔뜩 쌓이므로 숨은 동안은 건너뛴다.
  ctx.every = (ms, fn) => {
    const t = setInterval(() => {
      if (!document.hidden) fn();
    }, ms);
    s.timers.add(t);
    return t;
  };
  ctx.after = (ms, fn) => {
    const t = setTimeout(fn, ms);
    s.timers.add(t);
    return t;
  };
  ctx.frame = (fn) => {
    s.tick.push(fn);
    startLoop();
  };
  ctx.onCleanup = (fn) => s.cleanup.push(fn);

  /* 자기 노래가 있는 게임용. 배경 음악을 재우고 게임이 끝나면 되돌린다.
     소리 탭의 배경 음악 크기가 이 노래에도 먹도록 addTrack에 원래 크기와 함께 등록한다.
     (track.volume을 직접 넣으면 음악 크기 설정을 덮어쓴다) */
  ctx.music = (src, volume = 0.5) => {
    const track = addTrack(new Audio(src), volume);
    track.loop = true;
    track.preload = 'auto';
    bgmHush();
    track.play().catch(() => {});   // 자동 재생이 막히면 조용히 넘어간다
    ctx.onCleanup(() => {
      track.pause();
      dropTrack(track);
      bgmResume();
    });
    return track;
  };

  ctx.say = (text) => {
    const node = document.querySelector('#instruction');
    if (node) node.textContent = ctx.elder ? text.split('!')[0].split('.')[0] + '!' : text;
  };

  ctx.setScore = () => {
    const node = document.querySelector('#score');
    if (node) node.textContent = `성공 ${Math.min(ctx.hits, ctx.goal)} / ${ctx.goal}`;
  };

  /* 남은 하트. 쓴 자리는 회색으로 남겨서 몇 개 남았는지 한눈에 보이게 한다.
     (❤️/🤍 두 종류를 쓰면 분홍 칩 위에서 흰 하트가 안 보인다) */
  ctx.setLives = () => {
    const left = Math.max(ctx.lives, 0);
    const node = document.querySelector('#lives');
    if (node) node.innerHTML = livesMarkup(left);
  };

  ctx.hit = (n = 1, atElement) => {
    if (ctx.won) return;
    ctx.hits += n;
    ctx.setScore();
    sfx('pop');
    if (atElement) burstFrom(atElement, { count: 8, spread: 140, lift: 90 });
    if (ctx.hits >= ctx.goal) {
      ctx.won = true;
      sfx('win');
      burstFrom(zone, { count: 26 });
      ctx.after(420, () => navigate(completeMission, member));
    }
  };

  ctx.miss = () => {
    if (ctx.won || ctx.over) return;
    ctx.misses += 1;
    ctx.lives -= 1;
    ctx.setLives();
    sfx('miss');
    pulse(zone, 'shake');
    if (ctx.lives > 0) return;

    // 하트를 다 썼다. 돌던 것들을 먼저 세우고 나서 다시 시작 예약을 건다.
    ctx.over = true;
    s.tick.length = 0;
    s.timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
    s.timers.clear();

    const banner = document.createElement('div');
    banner.className = 'game-over';
    banner.innerHTML = '<b>💔 하트를 다 썼어요</b><span>눌러서 다시 시작</span>';
    zone.append(banner);

    // 누를 때까지 기다린다. 예전엔 1.5초 뒤 저절로 다시 시작해서,
    // 왜 졌는지 볼 틈도 없이 게임이 다시 굴러가 버렸다.
    let restarted = false;
    banner.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (restarted) return;
      restarted = true;
      startGame(member);
    });
  };

  /* 절대 배치 액터. transform 전용으로만 움직인다. */
  ctx.actor = (content, size = 40, className = '') => {
    const el = document.createElement('div');
    el.className = `actor ${className}`;
    const box = size * d.scale;
    const src = spriteFor(content);
    if (src) {
      el.classList.add('actor--sprite');
      el.style.width = `${box}px`;
      el.style.height = `${box}px`;
      el.innerHTML = `<img src="${src}" alt="">`;
    } else {
      el.style.fontSize = `${box}px`;
      el.textContent = content;
    }
    zone.append(el);
    const a = {
      el,
      x: 0,
      y: 0,
      r: (size * d.scale) / 2,
      dead: false,
      move(x, y) {
        a.x = x;
        a.y = y;
        el.style.transform = `translate3d(${x - a.r}px, ${y - a.r}px, 0)`;
      },
      remove() {
        a.dead = true;
        el.remove();
      },
      onTap(fn) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          fn(event);
        });
      },
    };
    return a;
  };

  /* 꾹 누른 채 끌어서 조종하는 게임(바구니·바)용.
     preventDefault + 포인터 캡처가 없으면 손가락이 세로로 조금만 흔들려도 브라우저가
     "페이지 스크롤"로 해석해 pointercancel을 던지고 조종하던 것이 손가락을 놓친다.
     .grab-zone(touch-action: none)이 그 판정 자체를 막는다. */
  ctx.drag = (onMove) => {
    const grab = (event) => {
      event.preventDefault();
      try {
        zone.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처를 못 해도 아래 pointermove로 계속 따라간다 */
      }
      onMove(event);
    };
    const move = (event) => {
      if (!event.buttons) return;
      event.preventDefault();
      onMove(event);
    };
    zone.classList.add('grab-zone');
    zone.addEventListener('pointerdown', grab);
    zone.addEventListener('pointermove', move);
    s.cleanup.push(() => {
      zone.classList.remove('grab-zone');
      zone.removeEventListener('pointerdown', grab);
      zone.removeEventListener('pointermove', move);
    });
  };

  ctx.zoneButton = (label, onPress) => {
    const button = document.createElement('button');
    // btn--big 이었을 땐 버튼 하나가 게임판 높이의 4분의 1을 먹어서 펭귄이 뛸 자리가 없었다.
    button.className = 'btn btn--primary zone-button';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // 이 버튼은 게임판 안에 있다. 막지 않으면 게임판의 pointerdown까지 같이 울려서
      // 한 번 눌렀는데 점프가 두 번 소모된다 (두 단 점프가 안 되던 원인).
      event.stopPropagation();
      onPress(event);
    });
    zone.append(button);
    return button;
  };

  zone.className = 'game-zone';
  zone.innerHTML = '';
  if (ctx.elder) zone.classList.add('elder');
  if (spec.bg) zone.classList.add(`bg-${spec.bg}`);
  ctx.setScore();
  ctx.setLives();

  const factory = MINIGAMES[spec.id] || MINIGAMES['gift-catch'];
  factory(ctx);

  // 관전 중계 — 게임 화면을 그대로 서버로 올린다. 같은 wifi의 다른 폰이 이걸 받아서 본다.
  // 주인공은 게임을 하지 않는다. 편집 모드에서 주인공을 바꾸면 예전 주인공의 게임 화면이
  // 중계될 수 있어서, 올리는 쪽에서 아예 막는다.
  const relayed = member.id !== config.hostId;

  // 응답에 실려 오는 하트 수. 첫 응답은 기준점으로만 쓴다 —
  // 그러지 않으면 게임을 다시 시작할 때마다 예전 하트가 한꺼번에 다시 터진다.
  let cheerSeen = null;

  const broadcast = () => {
    return apiFetch(api('live'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: member.id,
        name: member.name,
        game: member.game,
        zoneClass: zone.className,
        // 게임판 크기. 관전 화면은 이보다 작아서, 이 값이 없으면 받는 쪽이
        // 원래 크기로 그려 오른쪽·아래가 잘려 나간다.
        w: Math.round(zone.clientWidth),
        h: Math.round(zone.clientHeight),
        hits: ctx.hits,
        goal: ctx.goal,
        lives: ctx.lives,
        html: zone.innerHTML,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        const count = Number(data?.cheers) || 0;
        if (cheerSeen === null || count <= cheerSeen) {
          cheerSeen = Math.max(cheerSeen ?? 0, count);
          return;
        }
        // 하트 하나에 세 개씩 띄운다. 한꺼번에 여러 개가 와도 화면을 뒤덮지 않게 막아둔다.
        const gained = count - cheerSeen;
        cheerSeen = count;
        sfx('heart');
        cheerHearts(Math.min(gained * 3, 15));
      })
      .catch(() => {});
  };
  // 다 보내고 나서 다음 걸 건다. 고정 간격으로 쏘면 폰이 느릴 때 요청이 겹쳐 쌓인다.
  // 180ms(초당 5.5장)로는 관전 화면이 뚝뚝 끊겨 보여서 70ms(초당 14장)까지 올렸다.
  const pump = () => broadcast().then(() => ctx.after(70, pump));
  if (relayed) pump();
  s.cleanup.push(() => {
    if (!relayed) return;
    apiFetch(api('live'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true, memberId: member.id }),
    }).catch(() => {});
  });

  // 나이대별 도움 버튼 타이밍.
  // 세 번 지고 나면(= 네 번째 도전) 기다릴 것 없이 바로 꺼내준다.
  // gameTries는 '도전 횟수'라 실패 횟수보다 하나 크다.
  if (d.helpAfter <= 0 || gameTries > 3) showHelpDock();
  else ctx.after(d.helpAfter, showHelpDock);
}

function showHelpDock() {
  const dock = document.querySelector('#help-dock');
  if (dock) dock.classList.remove('hidden');
}

/* ============================================================
   1. 선물 풍선 POP! — 아래에서 떠오르며 흔들리는 풍선
   ============================================================ */

defineGame('balloon-pop', (ctx) => {
  ctx.zone.classList.add('sky-zone');
  ctx.say('떠오르는 풍선을 눌러 터뜨려 주세요!');
  const balloons = [];
  const maxAlive = ctx.d.hazards ? 4 : 2;

  const spawn = () => {
    if (ctx.won || balloons.filter((b) => !b.dead).length >= maxAlive) return;
    const gift = Math.random() < 0.22;
    const a = ctx.actor(gift ? '🎁' : '🎈', gift ? 40 : 44);
    a.baseX = randBetween(0.14, 0.86) * ctx.W;
    a.phase = Math.random() * Math.PI * 2;
    a.y = ctx.H + 50;
    // 나이대 모두 너무 느리다는 의견으로 기본 상승 속도를 1.5배(95~130 → 145~195)로 올렸다
    a.vy = randBetween(145, 195) * ctx.d.speed;
    a.parked = false;
    a.onTap(() => {
      if (a.dead) return;
      ctx.hit(gift ? 2 : 1, a.el);
      a.remove();
    });
    balloons.push(a);
  };

  ctx.every(ctx.d.spawnMs, spawn);
  spawn();

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    balloons.forEach((a) => {
      if (a.dead) return;
      if (!a.parked) a.y -= a.vy * seconds;
      a.phase += seconds * 1.7;
      const x = a.baseX + Math.sin(a.phase) * 26;
      const y = a.parked ? a.r + 12 + Math.sin(a.phase) * 6 : a.y;
      if (a.y < a.r + 12) {
        if (ctx.d.hazards) {
          a.remove();
          ctx.miss();
          return;
        }
        a.parked = true;
      }
      a.move(x, y);
    });
  });
});

/* ============================================================
   2. 초를 꽂아주세요! — 색깔 초 기억하기
   ① 케이크 위 자리마다 색깔 초가 잠깐 보인다 → ② 가려진다
   ③ 트레이의 색깔 초를 원래 색 자리에 꽂는다(끌어다 놓기, 또는 초를 누르고 자리를 누르기)
   ④ 다 꽂으면 케이크를 눌러 불을 켠다
   예전엔 초를 아무 자리에나 놓기만 하면 돼서 너무 쉬웠다. 색·자리를 떠올리는 기억력 게임으로 바꿨다.
   ============================================================ */

// 색 이름은 css/screens.css 의 [data-candle="…"] 와 짝이다
const CANDLE_COLORS = ['pink', 'sky', 'lemon', 'mint', 'lav'];

defineGame('candle', (ctx) => {
  // 나이대별 초 개수 · 보여주는 시간 · 다시 보기 횟수
  const plan = ctx.d.hazards
    ? { count: 6, showMs: 3000, replays: 0 }
    : ctx.elder
      ? { count: 4, showMs: 6000, replays: 2 }
      : { count: 3, showMs: 5000, replays: 0 };
  ctx.goal = plan.count;
  ctx.setScore();

  const cake = document.createElement('div');
  cake.className = 'game-cake';
  cake.textContent = '🎂';
  ctx.zone.append(cake);

  // 색은 되도록 겹치지 않게. 다섯 색보다 많으면 그때만 한 색을 더 쓴다.
  const shuffled = (list) => list.map((item) => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  const colors = shuffled(CANDLE_COLORS).slice(0, plan.count);
  while (colors.length < plan.count) colors.push(pickOne(CANDLE_COLORS));

  const snapRadius = ctx.d.hazards ? 84 : 120;  // 초를 놓을 때 자리에 붙는 거리
  const spread = plan.count > 4 ? [0.12, 0.76] : [0.25, 0.5];
  const slots = colors.map((color, i) => {
    const el = document.createElement('div');
    el.className = 'candle-slot';
    el.dataset.candle = color;
    const t = plan.count === 1 ? 0.5 : i / (plan.count - 1);
    el.style.left = `${(spread[0] + t * spread[1]) * 100}%`;
    el.style.top = `${26 + Math.sin(t * Math.PI) * -5}%`;
    ctx.zone.append(el);
    return { el, color, filled: false, lit: false };
  });

  const tray = document.createElement('div');
  tray.className = 'candle-tray is-locked';
  ctx.zone.append(tray);

  let phase = 'show';     // show(외우기) → place(꽂기) → light(불 켜기)
  let selected = null;    // 눌러서 고른 초 (끌지 않고 누르는 사람용)
  let dragging = false;

  const reveal = (on) => {
    slots.forEach((slot) => {
      if (slot.filled) return;
      slot.el.classList.toggle('is-shown', on);
      slot.el.innerHTML = on ? spriteHtml('🕯️') : '';
    });
  };

  const startPlacing = () => {
    reveal(false);
    phase = 'place';
    tray.classList.remove('is-locked');
    ctx.say('기억한 자리에 같은 색 초를 꽂아주세요!');
  };

  ctx.say(`초 색깔과 자리를 기억하세요! ${Math.round(plan.showMs / 1000)}초 뒤에 사라져요.`);
  reveal(true);
  ctx.after(plan.showMs, startPlacing);

  // 어르신은 잊어버리면 두 번까지 다시 볼 수 있다
  if (plan.replays) {
    let left = plan.replays;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'btn btn--chip candle-replay';
    const paintReplay = () => {
      replay.textContent = `👀 다시 보기 (${left})`;
    };
    paintReplay();
    replay.addEventListener('pointerdown', (event) => event.stopPropagation());
    replay.addEventListener('click', () => {
      if (phase !== 'place' || !left) return;
      left -= 1;
      paintReplay();
      if (!left) replay.remove();
      reveal(true);
      tray.classList.add('is-locked');
      ctx.after(3000, () => {
        if (phase !== 'place') return;
        reveal(false);
        tray.classList.remove('is-locked');
      });
    });
    // 게임판 안에 두면 큰 글씨(어르신)일 때 오른쪽 초 자리를 가린다. 게임판 바로 아래에 둔다.
    ctx.zone.after(replay);
    ctx.onCleanup(() => replay.remove());
  }

  const nearestSlot = (clientX, clientY, test) => {
    let best = null;
    let bestDist = Infinity;
    slots.forEach((slot) => {
      if (!test(slot)) return;
      const box = slot.el.getBoundingClientRect();
      const dist = Math.hypot(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    });
    return { slot: best, dist: bestDist };
  };

  const select = (chip) => {
    tray.querySelectorAll('.tray-candle').forEach((each) => each.classList.toggle('picked', each === chip));
    selected = chip;
  };

  const tryPlace = (slot, chip) => {
    if (phase !== 'place' || slot.filled || !chip.isConnected) return;
    if (slot.color !== chip.dataset.candle) {
      // 틀리면 초는 트레이로 돌아가고 하트가 하나 깎인다 — 나이대와 상관없이 똑같이.
      pulse(slot.el, 'shake');
      ctx.miss();
      // 어린이·어르신에게는 그 색이 들어갈 자리를 잠깐 반짝여 알려준다
      const answer = !ctx.d.hazards && slots.find((each) => !each.filled && each.color === chip.dataset.candle);
      if (answer) {
        answer.el.classList.add('hint');
        ctx.after(900, () => answer.el.classList.remove('hint'));
      }
      return;
    }
    slot.filled = true;
    slot.el.classList.remove('is-shown', 'hint');
    slot.el.classList.add('filled');
    slot.el.innerHTML = spriteHtml('🕯️');
    chip.remove();
    select(null);
    pulse(slot.el, 'pop');
    sfx('pop');
    if (slots.every((each) => each.filled)) {
      phase = 'light';
      // 한 문장으로 쓴다. 어르신은 ctx.say가 첫 "!"까지만 보여줘서
      // "다 맞혔어요! …"라고 쓰면 불을 켜라는 말이 잘려 나갔다.
      ctx.say('다 맞혔어요, 이제 초를 터치해서 불을 켜주세요!');
      slots.forEach((each) => pulse(each.el, 'pop'));
    }
  };

  /* 불을 켤 때는 초(46px)를 정확히 맞출 필요가 없다.
     게임판 어디를 눌러도 아직 안 켜진 초 중 가장 가까운 것을 켠다 — 거리 제한은 없다.
     한 번에 하나만 켜지므로 넓어도 헷갈리지 않는다. */
  const tapZone = (event) => {
    if (dragging) return;
    if (phase === 'light') {
      const { slot } = nearestSlot(event.clientX, event.clientY, (each) => !each.lit);
      if (!slot) return;
      slot.lit = true;
      slot.el.classList.add('alight');
      ctx.hit(1, slot.el);
      return;
    }
    // 초를 먼저 누르고 자리를 누르는 방법
    if (phase === 'place' && selected) {
      const { slot, dist } = nearestSlot(event.clientX, event.clientY, (each) => !each.filled);
      if (slot && dist <= snapRadius) tryPlace(slot, selected);
    }
  };
  ctx.zone.addEventListener('pointerdown', tapZone);
  ctx.onCleanup(() => ctx.zone.removeEventListener('pointerdown', tapZone));

  shuffled(colors).forEach((color) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tray-candle';
    chip.dataset.candle = color;
    chip.innerHTML = spriteHtml('🕯️');
    tray.append(chip);

    let ghost = null;
    let start = null;
    let moved = false;
    chip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();   // 게임판의 "자리 누르기"로 번지지 않게
      if (phase !== 'place') return;
      try { chip.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등에서는 무시 */ }
      start = { x: event.clientX, y: event.clientY };
      moved = false;
    });
    chip.addEventListener('pointermove', (event) => {
      if (!start) return;
      if (!ghost && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
        moved = true;
        dragging = true;
        ghost = document.createElement('span');
        ghost.className = 'drag-ghost';
        ghost.dataset.candle = color;
        ghost.innerHTML = spriteHtml('🕯️');
        document.body.append(ghost);
        chip.style.opacity = '0.3';
      }
      if (ghost) ghost.style.transform = `translate3d(${event.clientX - 22}px, ${event.clientY - 22}px, 0)`;
    });
    const drop = (event) => {
      start = null;
      if (!ghost) return;
      ghost.remove();
      ghost = null;
      chip.style.opacity = '';
      // 떼는 순간의 탭이 게임판으로 번져 불이 켜지지 않게 한 박자 뒤에 푼다
      ctx.after(0, () => { dragging = false; });
      const { slot, dist } = nearestSlot(event.clientX, event.clientY, (each) => !each.filled);
      if (slot && dist <= snapRadius) tryPlace(slot, chip);
    };
    chip.addEventListener('pointerup', drop);
    chip.addEventListener('pointercancel', () => {
      start = null;
      if (ghost) ghost.remove();
      ghost = null;
      dragging = false;
      chip.style.opacity = '';
    });
    // 끌지 않고 눌렀으면 "고르기". 한 번 더 누르면 고르기 취소.
    chip.addEventListener('click', () => {
      if (moved || phase !== 'place' || !chip.isConnected) return;
      select(selected === chip ? null : chip);
    });
  });
});

/* ============================================================
   3. 선물 캐치! — 바구니가 손가락을 따라간다
   ============================================================ */

defineGame('gift-catch', (ctx) => {
  ctx.zone.classList.add('sky-zone');
  ctx.say('바구니를 움직여 떨어지는 선물을 받아주세요!');

  const basketSize = 54 * ctx.d.scale;
  const basket = document.createElement('div');
  basket.className = 'basket';
  const basketSprite = spriteFor('🧺');
  if (basketSprite) {
    basket.classList.add('basket--sprite');
    basket.style.width = `${basketSize}px`;
    basket.style.height = `${basketSize}px`;
    basket.innerHTML = `<img src="${basketSprite}" alt="">`;
  } else {
    basket.style.fontSize = `${basketSize}px`;
    basket.textContent = '🧺';
  }
  ctx.zone.append(basket);

  const magnet = ctx.d.hazards ? 16 : 60;
  let bx = ctx.W / 2;
  const setBasket = () => {
    basket.style.transform = `translate3d(${bx - basketSize / 2}px, 0, 0)`;
  };
  setBasket();

  const track = (event) => {
    const box = ctx.zone.getBoundingClientRect();
    bx = clamp(event.clientX - box.left, basketSize / 2, ctx.W - basketSize / 2);
    setBasket();
  };
  ctx.drag(track);

  const keys = (event) => {
    if (event.key === 'ArrowLeft') bx = clamp(bx - 34, basketSize / 2, ctx.W - basketSize / 2);
    if (event.key === 'ArrowRight') bx = clamp(bx + 34, basketSize / 2, ctx.W - basketSize / 2);
    setBasket();
  };
  window.addEventListener('keydown', keys);
  ctx.onCleanup(() => window.removeEventListener('keydown', keys));

  const drops = [];
  const spawn = () => {
    if (ctx.won) return;
    // 폭탄 비율. 올려도 선물이 절반 가까이 남아서 목표(goal)에는 닿을 수 있다.
    const bomb = ctx.d.hazards ? Math.random() < 0.75 : Math.random() < 0.55;
    const a = ctx.actor(bomb ? '💣' : pickOne(['🎁', '⭐', '🍬']), 36);
    a.bomb = bomb;
    a.vy = randBetween(165, 235) * ctx.d.speed;
    a.move(randBetween(0.12, 0.88) * ctx.W, -30);
    drops.push(a);
  };
  ctx.every(ctx.d.spawnMs, spawn);
  spawn();

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    const floor = ctx.H - basketSize * 0.7;
    drops.forEach((a) => {
      if (a.dead) return;
      a.move(a.x, a.y + a.vy * seconds);
      if (a.y >= floor) {
        const caught = Math.abs(a.x - bx) < basketSize / 2 + magnet;
        if (caught && !a.bomb) ctx.hit(1, a.el);
        else if (caught && a.bomb) {
          ctx.hits = Math.max(0, ctx.hits - 1);
          ctx.setScore();
          ctx.miss();
        }
        a.remove();
      } else if (a.y > ctx.H + 40) {
        a.remove();
      }
    });
  });
});

/* ============================================================
   4. 하트 잡기 — 곡선으로 떠다니며 점점 작아진다
   ============================================================ */

defineGame('heart-catch', (ctx) => {
  ctx.say('작아지기 전에 하트를 눌러주세요!');
  const hearts = [];
  const maxAlive = ctx.d.hazards ? 4 : 3;

  const spawn = () => {
    if (ctx.won || hearts.filter((x) => !x.dead).length >= maxAlive) return;
    const broken = ctx.d.hazards && Math.random() < 0.2;
    const size = 46;
    const a = ctx.actor(broken ? '💔' : pickOne(['❤️', '💖', '💝']), size);
    a.life = 0;
    a.max = ctx.d.lifeMs * 0.85;
    a.phase = Math.random() * Math.PI * 2;
    a.baseX = randBetween(0.18, 0.82) * ctx.W;
    a.baseY = randBetween(0.2, 0.78) * ctx.H;
    // 하트마다 도는 속도·반경을 다르게 줘서 궤적이 예측되지 않게
    a.spin = randBetween(1.5, 2.3) * ctx.d.speed;
    a.rx = randBetween(44, 80);
    a.ry = randBetween(32, 58);
    a.shrink = true;
    a.onTap(() => {
      if (a.dead) return;
      if (broken) {
        ctx.hits = Math.max(0, ctx.hits - 1);
        ctx.setScore();
        ctx.miss();
      } else {
        ctx.hit(1, a.el);
      }
      a.remove();
    });
    hearts.push(a);
  };

  ctx.every(ctx.d.spawnMs, spawn);
  spawn();

  ctx.frame((dt) => {
    hearts.forEach((a) => {
      if (a.dead) return;
      a.life += dt;
      a.phase += (dt / 1000) * a.spin;
      const t = a.life / a.max;
      if (t >= 1) {
        // 놓친 하트는 나이대와 상관없이 하트 한 칸을 가져간다.
        // 예전엔 어른(hazards)에게만 깎여서, 어린이·어르신은 가만히 둬도 손해가 없었다.
        // 난이도는 하트가 살아있는 시간(d.lifeMs)이 이미 조절한다.
        a.remove();
        ctx.miss();
        return;
      }
      a.el.style.transformOrigin = 'center';
      // 끝에 가면 1/4 크기까지 줄어든다. 늦게 누르면 정말 작다.
      const scale = 1 - t * 0.76;
      const x = a.baseX + Math.cos(a.phase) * a.rx;
      const y = a.baseY + Math.sin(a.phase * 1.37) * a.ry;
      a.x = x;
      a.y = y;
      a.el.style.transform = `translate3d(${x - a.r}px, ${y - a.r}px, 0) scale(${scale})`;
    });
  });

  // 소프트 타이머: 실패시키지 않고 격려 문구만 바꾼다
  let left = 30;
  ctx.every(1000, () => {
    left -= 1;
    if (left === 10) ctx.say('조금만 더! 하트를 모아주세요!');
    if (left <= 0) {
      left = 30;
      ctx.say('천천히 해도 괜찮아요. 하트를 눌러주세요!');
    }
  });
});

/* ============================================================
   5. 타이밍 게임 — 핑퐁 바늘, 성공할수록 밴드가 좁아진다
   ============================================================ */

defineGame('timing', (ctx) => {
  ctx.goal = Math.max(2, Math.round(ctx.goal * 0.6));
  ctx.setScore();
  ctx.say('바늘이 초록 칸에 왔을 때 STOP을 눌러주세요!');

  const meter = document.createElement('div');
  meter.className = 'timing-meter';
  meter.innerHTML = '<i class="timing-band"></i><i class="timing-needle"></i>';
  ctx.zone.append(meter);

  const band = meter.querySelector('.timing-band');
  const needle = meter.querySelector('.timing-needle');
  // 난이도를 어려움으로 올리면서 칸이 너무 좁아졌다. 넉넉하게 깔고 시작한다.
  let width = ctx.d.windowPct * 2.1;
  let pos = 0;
  let dir = 1;

  const layout = () => {
    band.style.left = `${50 - width / 2}%`;
    band.style.width = `${width}%`;
  };
  layout();

  ctx.frame((dt) => {
    pos += dir * (dt / 1000) * 62 * ctx.d.speed;
    if (pos >= 100) {
      pos = 100;
      dir = -1;
    }
    if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    needle.style.transform = `translate3d(${(pos / 100) * (meter.clientWidth - 10)}px, 0, 0)`;
  });

  ctx.zoneButton('STOP!', () => {
    if (ctx.won) return;
    const good = Math.abs(pos - 50) <= width / 2;
    if (good) {
      ctx.hit(1, needle);
      if (ctx.d.hazards) width = Math.max(11, width * 0.92);
      layout();
    } else {
      ctx.miss();
      ctx.say('조금 아쉬워요! 초록 칸을 노려봐요');
    }
  });
});

/* ============================================================
   6. 고전 틀린 그림 찾기 — 매 라운드 무작위 칸이 달라진다
   ============================================================ */

defineGame('spot-difference', (ctx) => {
  const cols = ctx.d.hazards ? 4 : 3;
  const rows = ctx.d.hazards ? 3 : 2;
  const pool = ['🐧', '🍰', '🌸', '🎁', '⭐', '🐟', '🍓', '🎈', '🍭', '🌈', '🐥', '🍀'];
  const grid = document.createElement('div');
  grid.className = 'diff-grid';
  ctx.zone.append(grid);

  let roundTimer = null;

  const round = () => {
    if (ctx.won) return;
    const cells = shuffle(pool).slice(0, cols * rows);
    const oddIndex = Math.floor(Math.random() * cells.length);
    const replacement = shuffle(pool.filter((item) => !cells.includes(item)))[0] || '❤️';

    grid.innerHTML = '';
    const panels = [0, 1].map((side) => {
      const panel = document.createElement('div');
      panel.className = 'diff-panel';
      panel.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      cells.forEach((emoji, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'diff-cell';
        cell.textContent = side === 1 && index === oddIndex ? replacement : emoji;
        cell.onclick = () => {
          if (ctx.won) return;
          if (index === oddIndex) {
            clearInterval(roundTimer);
            cell.classList.add('reveal');
            ctx.hit(1, cell);
            if (!ctx.won) ctx.after(340, round);
          } else {
            ctx.miss();
          }
        };
        panel.append(cell);
      });
      return panel;
    });
    grid.append(panels[0], panels[1]);

    // 제한 시간은 3~5초. 오래 들여다보는 게임이 아니라 순간 포착 게임이다.
    let seconds = ctx.d.hazards ? 5 : 7;
    ctx.say(`달라진 그림을 찾아주세요! ${seconds}초`);
    clearInterval(roundTimer);
    roundTimer = ctx.every(1000, () => {
      seconds -= 1;
      ctx.say(`달라진 그림을 찾아주세요! ${seconds}초`);
      if (seconds > 0) return;
      clearInterval(roundTimer);
      // 시간 안에 못 찾으면 정답을 보여주고 하트가 하나 깎인다
      grid.querySelectorAll('.diff-panel')[1].children[oddIndex].classList.add('reveal');
      toast('⏰ 여기였어요!');
      ctx.miss();
      ctx.after(900, round);
    });
  };

  round();
});

/* ============================================================
   7. 불꽃 점프 (서커스 찰리) — 옆에서 보는 점프 러너
   ============================================================ */

defineGame('circus-charlie', (ctx) => {
  ctx.zone.classList.add('circus-zone');
  ctx.say('불꽃을 뛰어넘어요! 두 번 눌러 두 단 점프!');

  // 원본은 36MB짜리 모음집이라 8초 지점부터 2분만 잘라 넣었다(scripts/mp3slice.py).
  // 파일 자체가 8초부터 시작하므로 반복해도 인트로로 되돌아가지 않는다.
  ctx.music(chiptuneSrc('circus'));

  const line = document.createElement('div');
  line.className = 'ground-line';
  ctx.zone.append(line);

  const groundY = () => ctx.H * 0.66;
  const heroSize = 46 * ctx.d.scale;
  const hero = ctx.actor('🤹', 46);
  let heroY = 0;
  let vy = 0;
  let jumpsLeft = 2;
  const gravity = 2000;
  const jumpV = 660;

  const obstacles = [];
  let sinceSpawn = 0;
  const spacing = () => 1150 / ctx.d.speed;
  let nextGap = spacing();

  const jump = () => {
    if (ctx.won || ctx.over || jumpsLeft <= 0) return;
    jumpsLeft -= 1;
    // 두 번째 점프는 살짝 약하게 — 그래야 두 단으로 넘는 맛이 산다
    vy = -jumpV * (jumpsLeft === 1 ? 1 : 0.85);
    burstFrom(hero.el, { count: 5, emoji: ['✨'], spread: 70, lift: 40 });
  };

  const tap = (event) => {
    event.preventDefault();
    jump();
  };
  ctx.zone.addEventListener('pointerdown', tap);
  ctx.onCleanup(() => ctx.zone.removeEventListener('pointerdown', tap));
  const keys = (event) => {
    if (event.key === ' ' || event.key === 'ArrowUp') {
      event.preventDefault();
      jump();
    }
  };
  window.addEventListener('keydown', keys);
  ctx.onCleanup(() => window.removeEventListener('keydown', keys));

  ctx.zoneButton('불꽃 점프! 🔥', jump);

  let stumble = 0;

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    const heroX = ctx.W * 0.18;

    if (heroY < 0 || vy !== 0) {
      vy += gravity * seconds;
      heroY += vy * seconds;
      if (heroY >= 0) {
        heroY = 0;
        vy = 0;
        jumpsLeft = 2;
      }
    }
    if (stumble > 0) stumble -= dt;
    hero.el.style.transform = `translate3d(${heroX - heroSize / 2}px, ${
      groundY() + heroY - heroSize
    }px, 0) rotate(${stumble > 0 ? (stumble / 500) * 360 : 0}deg)`;
    hero.x = heroX;

    sinceSpawn += dt;
    if (sinceSpawn >= nextGap && !ctx.won && !ctx.over) {
      sinceSpawn = 0;
      nextGap = spacing();
      // 가끔 불꽃 두 개짜리가 나온다. 한 번 점프로는 못 넘고 두 단 점프가 필요하다.
      const wide = ctx.d.hazards ? Math.random() < 0.4 : Math.random() < 0.2;
      const group = wide ? 2 : 1;
      const id = Math.random();
      for (let i = 0; i < group; i += 1) {
        const bonus = group === 1 && Math.random() < 0.16;
        const a = ctx.actor(bonus ? '🦁' : '🔥', 40);
        a.bonus = bonus;
        a.group = id;
        a.scored = false;
        a.hitDone = false;
        a.move(ctx.W + 40 + i * 54, groundY() - a.r);
        obstacles.push(a);
      }
    }

    const speedPx = 210 * ctx.d.speed;
    const cleared = new Set();
    obstacles.forEach((a) => {
      if (a.dead) return;
      a.move(a.x - speedPx * seconds, groundY() - a.r);
      const dx = Math.abs(a.x - heroX);
      const airborne = heroY < -30;
      if (!a.hitDone && dx < 32) {
        if (airborne) {
          // 넘었다. 한 묶음(불꽃 두 개)은 한 번만 점수를 준다.
          a.hitDone = true;
          if (!cleared.has(a.group)) {
            cleared.add(a.group);
            ctx.hit(a.bonus ? 2 : 1, a.el);
          }
        } else {
          // 부딪혔다 — 나이대와 상관없이 하트가 깎인다
          a.hitDone = true;
          stumble = 500;
          pulse(ctx.zone, 'shake');
          ctx.miss();
        }
      }
      if (a.x < -60) a.remove();
    });
  });
});

/* ============================================================
   8. 남극 탐험 — 1983년 고전처럼 펭귄 뒷모습을 보며 달린다
   길이 지평선으로 좁아지고, 얼음 구멍은 뛰어넘고 물고기는 줍는다.
   ============================================================ */

defineGame('antarctic', (ctx) => {
  ctx.zone.classList.add('ice-zone');
  ctx.say('좌우를 눌러 옮기고, 구덩이는 점프! 물고기를 주우세요');

  ctx.music(chiptuneSrc('antarctic'));

  const road = document.createElement('div');
  road.className = 'ice-road';
  // 길 그림(ice-road.png)이 양옆 테두리선과 차선 점선을 이미 담고 있어서
  // 예전의 .road-edge 두 개는 그 위에 겹쳐 그려질 뿐이라 뺐다.
  ctx.zone.append(road);

  // 길은 왼쪽·중앙·오른쪽 세 칸뿐이다. 펭귄도 구덩이도 물고기도 이 셋 위에만 선다.
  const LANES = [-0.62, 0, 0.62];
  const MID = 1;

  const HORIZON = () => ctx.H * 0.34;
  const nearHalf = () => ctx.W * 0.42;
  // 발 앞에서 잰 칸과 칸 사이 거리. 구덩이·물고기 크기의 기준이 된다.
  const laneGap = () => (LANES[1] - LANES[0]) * nearHalf();
  // z=1 지평선, z=0 발 앞. 멀수록 작고 가운데로 모인다.
  const persp = (z) => 1 / (1 + Math.max(z, 0) * 3.2);
  const projY = (z) => HORIZON() + (FLOOR() - HORIZON()) * persp(z);
  const projHalf = (z) => nearHalf() * persp(z);

  // 달려오는 눈금 — 속도감이 없으면 그냥 서 있는 그림이 된다
  const marks = [0.15, 0.4, 0.65, 0.9].map((z) => {
    const el = document.createElement('i');
    el.className = 'road-mark';
    road.append(el);
    return { el, z };
  });

  const penguin = document.createElement('div');
  penguin.className = 'penguin-runner';
  penguin.innerHTML =
    '<img src="public/game/penguin-back.png" alt="" ' +
    'onerror="this.replaceWith(document.createTextNode(\'🐧\'))">';
  ctx.zone.append(penguin);

  let lane = MID;
  let heroX = LANES[MID]; // 화면상 위치. lane 쪽으로 부드럽게 따라간다.
  let heroY = 0;
  let vy = 0;
  const gravity = 2100;
  const jumpV = 620;
  let onGround = true;

  const jump = () => {
    if (!onGround || ctx.won || ctx.over) return;
    onGround = false;
    vy = -jumpV;
  };

  const step = (dir) => {
    if (ctx.won || ctx.over) return;
    lane = clamp(lane + dir, 0, LANES.length - 1);
  };

  // 게임판 왼쪽 절반을 누르면 왼쪽 칸으로, 오른쪽 절반을 누르면 오른쪽 칸으로 한 칸씩.
  // 점프는 아래 점프 버튼이 맡는다(예전엔 아무 데나 누르면 점프까지 같이 됐다).
  const down = (event) => {
    event.preventDefault();
    const box = ctx.zone.getBoundingClientRect();
    step(event.clientX - box.left < box.width / 2 ? -1 : 1);
  };
  ctx.zone.addEventListener('pointerdown', down);
  ctx.onCleanup(() => ctx.zone.removeEventListener('pointerdown', down));

  const keys = (event) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
    if (event.key === ' ' || event.key === 'ArrowUp') {
      event.preventDefault();
      jump();
    }
  };
  window.addEventListener('keydown', keys);
  ctx.onCleanup(() => window.removeEventListener('keydown', keys));

  const jumpButton = ctx.zoneButton('점프! ⬆️', jump);

  // 펭귄이 점프 버튼을 밟고 서 있으면 안 된다.
  // 버튼 높이만 빼면 버튼의 bottom 여백·게임판 테두리를 빠뜨려 어긋난다.
  // 버튼이 실제로 그려진 자리를 그대로 읽어서 그 위에 세운다.
  const FLOOR = () => {
    const zb = ctx.zone.getBoundingClientRect();
    const bb = jumpButton.getBoundingClientRect();
    if (!bb.height) return ctx.H * 0.78;
    return bb.top - zb.top - 10;
  };

  const things = [];
  let sinceSpawn = 0;
  // 구덩이를 더 자주 만나게 한다. 물고기 비율만 낮추면 목표(goal)까지 하염없이 길어지므로,
  // 전체 스폰 간격을 함께 줄여 물고기 빈도는 그대로 두고 구덩이만 늘렸다.
  const spacing = () => 620 / ctx.d.speed;
  let nextGap = spacing();

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    const flow = 0.42 * ctx.d.speed;

    marks.forEach((m) => {
      m.z -= flow * seconds;
      if (m.z <= 0) m.z += 1;
      const y = projY(m.z);
      const half = projHalf(m.z);
      m.el.style.transform = `translate3d(${ctx.W / 2 - half}px, ${y}px, 0)`;
      m.el.style.width = `${half * 2}px`;
      m.el.style.opacity = String(0.25 + (1 - m.z) * 0.45);
    });

    if (!onGround) {
      vy += gravity * seconds;
      heroY += vy * seconds;
      if (heroY >= 0) {
        heroY = 0;
        vy = 0;
        onGround = true;
      }
    }
    const size = 66 * ctx.d.scale;
    penguin.style.width = `${size}px`;
    // 칸 사이를 미끄러지듯 옮겨간다. 순간이동하면 어디로 갔는지 눈이 못 따라간다.
    heroX += (LANES[lane] - heroX) * Math.min(1, seconds * 14);
    penguin.style.transform = `translate3d(${
      ctx.W / 2 + heroX * nearHalf() - size / 2
    }px, ${projY(0) + heroY - size}px, 0)`;

    sinceSpawn += dt;
    if (sinceSpawn >= nextGap && !ctx.won && !ctx.over) {
      sinceSpawn = 0;
      nextGap = spacing() * randBetween(0.75, 1.25);
      const fish = Math.random() < 0.31;
      const el = document.createElement('div');
      el.className = `road-thing ${fish ? 'road-fish' : 'road-hole'}`;
      el.innerHTML = fish
        ? `<img src="${spriteFor('🐟') || ''}" alt="" onerror="this.replaceWith(document.createTextNode('🐟'))">`
        : '';
      road.append(el);
      // 세 칸 중 하나에만 놓는다. 칸 밖에 걸치면 피할 수도 주울 수도 없다.
      const at = Math.floor(Math.random() * LANES.length);
      things.push({ el, z: 1, lane: at, x: LANES[at], fish, done: false });
    }

    things.forEach((t) => {
      if (t.gone) return;
      t.z -= flow * seconds;
      const half = projHalf(t.z);
      const scale = persp(t.z);
      // 한 칸 폭을 기준으로 잡는다. 예전 고정 크기는 세 칸을 다 덮어버려서
      // 어느 칸에 놓인 건지 눈으로 구분할 수 없었다.
      const w = (t.fish ? 0.58 : 0.96) * laneGap() * scale;
      // 구덩이 그림 비율(css/screens.css 의 ice-hole.png). 안 맞추면 금이 납작하게 늘어난다.
      const h = t.fish ? w : w / 2.097;
      t.el.style.width = `${w}px`;
      t.el.style.height = `${h}px`;
      t.el.style.transform = `translate3d(${ctx.W / 2 + t.x * half - w / 2}px, ${
        projY(t.z) - h / 2
      }px, 0)`;
      t.el.style.zIndex = String(10 + Math.round((1 - t.z) * 20));

      if (!t.done && t.z <= 0.06) {
        t.done = true;
        // 같은 칸이면 맞은 것이다. 거리로 재던 예전 방식은 칸 사이에 걸치면 애매했다.
        const near = t.lane === lane;
        if (t.fish) {
          if (near && heroY > -28) ctx.hit(1, t.el);
        } else if (near && heroY > -28) {
          // 구멍에 빠졌다 — 하트가 깎인다 (예전엔 그냥 통과했다)
          pulse(ctx.zone, 'shake');
          ctx.miss();
        }
      }
      if (t.z < -0.12) {
        t.gone = true;
        t.el.remove();
      }
    });
  });

  ctx.onCleanup(() => things.forEach((t) => t.el.remove()));
});

/* ============================================================
   9. 버블 버블 팡! — 방울이 합쳐지면 점수가 커진다
   ============================================================ */

defineGame('bubble-pop', (ctx) => {
  ctx.zone.classList.add('water-zone');
  ctx.say('떠오르는 방울을 눌러 터뜨려요! 합쳐진 방울은 2점!');
  const bubbles = [];

  const makeBubble = (x, y, big) => {
    const a = ctx.actor(big ? '🫧' : '🫧', big ? 62 : 40);
    a.big = big;
    a.phase = Math.random() * Math.PI * 2;
    a.vy = randBetween(70, 100) * ctx.d.speed * (big ? 0.8 : 1);
    a.move(x, y);
    a.onTap(() => {
      if (a.dead) return;
      ctx.hit(a.big ? 2 : 1, a.el);
      burstFrom(a.el, { count: 6, emoji: ['💧', '✨'], spread: 90, lift: 70 });
      a.remove();
    });
    bubbles.push(a);
    return a;
  };

  const spawn = () => {
    if (ctx.won || bubbles.filter((b) => !b.dead).length >= (ctx.d.hazards ? 5 : 3)) return;
    makeBubble(randBetween(0.15, 0.85) * ctx.W, ctx.H + 40, false);
  };
  ctx.every(ctx.d.spawnMs, spawn);
  spawn();
  spawn();

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    bubbles.forEach((a) => {
      if (a.dead) return;
      a.phase += seconds * 1.4;
      const y = a.y - a.vy * seconds;
      const x = a.x + Math.sin(a.phase) * 0.7;
      if (y < a.r) {
        // 천장까지 올라가면 놓친 것 — 하트가 깎인다
        burstFrom(a.el, { count: 4, emoji: ['💧'], spread: 70, lift: 50 });
        a.remove();
        ctx.miss();
        return;
      }
      a.move(x, y);
    });

    // 합체
    const alive = bubbles.filter((b) => !b.dead && !b.big);
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const a = alive[i];
        const b = alive[j];
        if (a.dead || b.dead) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 6) {
          const x = (a.x + b.x) / 2;
          const y = (a.y + b.y) / 2;
          a.remove();
          b.remove();
          makeBubble(x, y, true);
        }
      }
    }
  });
});

/* ============================================================
   10. 벽돌 깨기 — 목숨 없음. 바닥에 닿으면 튕겨 올라온다.
   ============================================================ */

defineGame('brick-breaker', (ctx) => {
  ctx.say('바를 움직여 공을 튕기고 벽돌을 모두 깨주세요!');

  let paddleW = 96 * ctx.d.scale;
  const paddle = document.createElement('div');
  paddle.className = 'paddle';
  paddle.style.width = `${paddleW}px`;
  ctx.zone.append(paddle);

  let px = ctx.W / 2;
  const setPaddle = () => {
    paddle.style.width = `${paddleW}px`;
    paddle.style.transform = `translate3d(${px - paddleW / 2}px, 0, 0)`;
  };
  setPaddle();

  const track = (event) => {
    const box = ctx.zone.getBoundingClientRect();
    px = clamp(event.clientX - box.left, paddleW / 2, ctx.W - paddleW / 2);
    setPaddle();
  };
  // 꾹 누른 채로 끌어서 바를 움직인다
  ctx.drag(track);

  const BRICK_SKINS = 5; // css/screens.css 의 .brick--0 ~ .brick--4
  const bricks = [];
  const cols = ctx.d.hazards ? 7 : 5;
  const rows = ctx.d.hazards ? 4 : 3;
  // 벽돌 그림은 가로:세로가 약 1.57:1 이다. 칸이 그보다 납작하면 외곽선이 옆으로 늘어난다.
  const brickH = Math.max(22, Math.round((ctx.W - 20 - (cols - 1) * 6) / cols / 1.9));
  const brickW = (ctx.W - 20 - (cols - 1) * 6) / cols;
  for (let r = 0; r < rows; r += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = 10 + i * (brickW + 6);
      const y = 26 + r * (brickH + 6);
      const brick = document.createElement('i');
      brick.className = `brick brick--${(r + i) % BRICK_SKINS}`;
      brick.style.width = `${brickW}px`;
      brick.style.height = `${brickH}px`;
      brick.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ctx.zone.append(brick);
      bricks.push({ el: brick, x, y, w: brickW, h: brickH, dead: false });
    }
  }
  const totalBricks = bricks.length;
  const startPaddleW = paddleW;
  let baseSpeed = 1;

  // 벽돌을 다 깨야 끝난다
  ctx.goal = totalBricks;
  ctx.setScore();

  const ball = document.createElement('i');
  ball.className = 'ball';
  ctx.zone.append(ball);
  const R = 10;
  let bx = ctx.W / 2;
  let by = ctx.H * 0.55;
  let vx = 150 * ctx.d.speed;
  let vy = -190 * ctx.d.speed;

  ctx.frame((dt) => {
    const seconds = dt / 1000;
    bx += vx * seconds;
    by += vy * seconds;

    if (bx < R) {
      bx = R;
      vx = Math.abs(vx);
    }
    if (bx > ctx.W - R) {
      bx = ctx.W - R;
      vx = -Math.abs(vx);
    }
    if (by < R) {
      by = R;
      vy = Math.abs(vy);
    }

    // css/screens.css 의 .paddle { bottom: 12px; height: 22px } 과 짝이다. 한쪽만 바꾸면 어긋난다.
    const paddleTop = ctx.H - 34;
    if (by > paddleTop - R && vy > 0) {
      if (Math.abs(bx - px) < paddleW / 2 + R) {
        by = paddleTop - R;
        vy = -Math.abs(vy);
        vx += (bx - px) * 2.4;
        vx = clamp(vx, -320, 320);
      }
    }

    if (by > ctx.H - R) {
      // 목숨은 없다. 바닥에서 각도를 줄여 튕겨 올린다.
      // 바를 놓쳐 바닥에 닿았다 — 한 번에 하트 하나. (예전엔 세 번 쳐야 깎였다)
      // 게임오버는 없다. 튕겨 올린 뒤 계속 친다.
      by = ctx.H - R;
      vy = -Math.abs(vy) * 0.92;
      vx *= 0.85;
      ctx.miss();
    }

    bricks.forEach((brick) => {
      if (brick.dead) return;
      if (bx + R > brick.x && bx - R < brick.x + brick.w && by + R > brick.y && by - R < brick.y + brick.h) {
        brick.dead = true;
        burstFrom(brick.el, { count: 7, spread: 130, lift: 90 });
        brick.el.remove();
        vy = Math.abs(vy);
        ctx.hit(1);

        // 벽돌이 줄수록 바는 짧아지고 공은 빨라진다
        const left = bricks.filter((b) => !b.dead).length;
        const cleared = 1 - left / totalBricks;
        paddleW = Math.max(38, startPaddleW * (1 - cleared * 0.55));
        setPaddle();
        const want = 1 + cleared * 0.8;
        const boost = want / baseSpeed;
        baseSpeed = want;
        vx *= boost;
        vy *= boost;
      }
    });

    ball.style.transform = `translate3d(${bx - R}px, ${by - R}px, 0)`;
  });
});

/* ============================================================
   11. 생일 축하 리듬 — 생일 축하 노래에 맞춰 음표가 내려온다

   노트 시각은 js/happy-birthday-beats.js 의 박자표를 그대로 쓰고,
   위치는 속도를 적분하지 않고 노래 시각에서 바로 계산한다.
   그래야 프레임이 끊겨도 음표가 노래와 어긋나지 않는다.
   ============================================================ */

defineGame('rhythm', (ctx) => {
  ctx.zone.classList.add('rhythm-zone');
  ctx.say('노래에 맞춰 음표가 손가락 칸에 닿을 때 눌러주세요!');

  const LANES = 3;
  const NOTE_ICONS = ['🎵', '🎶', '🎼'];
  const lineY = () => ctx.H * 0.78;

  // 음표가 화면 위에서 판정선까지 오는 데 걸리는 시간.
  // 짧을수록 빠르고 어렵다. 어린이·어르신은 조금 더 여유를 준다.
  const travel = ctx.d.hazards ? 0.85 : 1.35;
  const fallSpeed = () => (lineY() + 60) / travel;
  // 판정은 시간으로 잡는다 (픽셀로 잡으면 속도를 올릴 때마다 좁아진다)
  const hitSeconds = ctx.d.hazards ? 0.2 : 0.3;

  const board = document.createElement('div');
  board.className = 'rhythm-board';
  board.style.setProperty('--lanes', String(LANES));
  board.innerHTML =
    `<i class="rhythm-line"></i>` +
    Array.from(
      { length: LANES },
      (_, i) => `<button type="button" class="rhythm-lane" data-lane="${i}"><i class="rhythm-pad">👆</i></button>`
    ).join('');
  ctx.zone.append(board);

  /* ---- 노래 ---- */
  // 이 게임은 자기 노래로 박자를 맞춘다. 배경 음악이 겹치면 박자가 안 들린다.
  bgmHush();
  ctx.onCleanup(bgmResume);
  const song = addTrack(new Audio('public/audio/happy-birthday.mp3'), 0.75);
  song.preload = 'auto';
  let songOk = false;
  song.play().then(
    () => {
      songOk = true;
    },
    () => {
      // 브라우저가 자동 재생을 막으면 노래 없이 박자표만으로 진행한다
      ctx.say('음표가 손가락 칸에 닿을 때 눌러주세요! (소리는 화면을 한 번 누르면 나와요)');
      const kick = () => {
        song.play().then(() => {
          songOk = true;
        }, () => {});
      };
      ctx.zone.addEventListener('pointerdown', kick, { once: true });
    }
  );
  ctx.onCleanup(() => {
    dropTrack(song);
    song.pause();
    song.src = '';
  });

  // 노래를 못 틀어도 게임은 굴러가야 하므로 자체 시계를 함께 돌린다
  let clock = 0;
  const now = () => (songOk && song.currentTime > 0 ? song.currentTime : clock);

  /* ---- 박자표 ---- */
  const beats = typeof HAPPY_BIRTHDAY_BEATS !== 'undefined' ? HAPPY_BIRTHDAY_BEATS : [];
  // 어른&청소년은 50개를 맞춰야 끝난다. 20개는 너무 금방 채워져서 올렸다.
  // 노래 한 곡에 박자가 450개 넘게 있어 놓치는 게 있어도 한 곡 안에 채울 수 있다.
  if (ctx.d.hazards) {
    ctx.goal = 50;
    ctx.setScore();
  }

  // 어린이·어르신은 박자표를 한 칸 걸러 써서 밀도를 낮춘다
  // 시작하자마자 첫 음표가 판정선에 닿으면 손 쓸 새가 없다.
  // 노래 앞부분은 흘려보내고 준비 시간을 준다.
  const leadIn = travel + 1.4;
  const chart = (ctx.d.hazards ? beats : beats.filter((_, i) => i % 2 === 0))
    .filter(([t]) => t >= leadIn)
    .map(([t, lane]) => ({ t, lane }));
  let cursor = 0;
  const live = [];

  const spawnDue = (time) => {
    while (cursor < chart.length && chart[cursor].t - travel <= time) {
      const beat = chart[cursor];
      cursor += 1;
      if (beat.t < time) continue; // 이미 지나간 박자는 건너뛴다
      const a = ctx.actor(NOTE_ICONS[cursor % NOTE_ICONS.length], 40);
      a.lane = beat.lane;
      a.at = beat.t;
      a.judged = false;
      live.push(a);
    }
  };

  const judge = (lane) => {
    if (ctx.won || ctx.over) return;
    const time = now();
    let best = null;
    let bestGap = Infinity;
    live.forEach((a) => {
      if (a.dead || a.judged || a.lane !== lane) return;
      const gap = Math.abs(a.at - time);
      if (gap < bestGap) {
        bestGap = gap;
        best = a;
      }
    });
    if (best && bestGap <= hitSeconds) {
      best.judged = true;
      ctx.hit(1, best.el);
      best.remove();
      return;
    }
    // 헛손질은 하트를 깎지 않는다. 놓친 음표만 깎인다.
    pulse(board.querySelector(`[data-lane="${lane}"]`), 'shake');
  };

  board.querySelectorAll('[data-lane]').forEach((button) => {
    let strikeTimer = 0;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.classList.remove('struck');
      void button.offsetWidth;
      button.classList.add('struck');
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(() => button.classList.remove('struck'), 120);
      judge(Number(button.dataset.lane));
    });
    ctx.onCleanup(() => clearTimeout(strikeTimer));
  });

  ctx.frame((dt) => {
    clock += dt / 1000;
    const time = now();
    spawnDue(time);

    const speed = fallSpeed();
    const laneW = ctx.W / LANES;
    let missed = 0;
    live.forEach((a) => {
      if (a.dead) return;
      // 위치를 시간에서 바로 뽑는다 — 노래와 절대 어긋나지 않는다
      const y = lineY() - (a.at - time) * speed;
      a.move((a.lane + 0.5) * laneW, y);
      if (!a.judged && time - a.at > hitSeconds) {
        a.judged = true;
        missed += 1;
      }
      if (y > ctx.H + 40) a.remove();
    });
    if (live.some((a) => a.dead)) live.splice(0, live.length, ...live.filter((a) => !a.dead));
    // 놓친 음표는 나이대와 상관없이 하트를 깎는다 (그래야 게임오버가 있다)
    for (let i = 0; i < missed; i += 1) ctx.miss();

    if (cursor >= chart.length && !live.length && !ctx.won && !ctx.over) {
      // 노래가 끝났는데 아직 목표를 못 채웠으면 처음부터 다시 흐른다
      cursor = 0;
      clock = 0;
      if (songOk) song.currentTime = 0;
    }
  });
});
