/* ============================================================
   cake-game.js — 어린이 음식 만들기 플래시게임 스타일 6단계 조리 게임
   실패 상태 없음. 모든 단계가 관대하게 통과된다.
   ============================================================ */

const CAKE_STAGES = [
  { id: 'fill', emoji: '🧺', name: '재료 넣기' },
  { id: 'mix', emoji: '🥄', name: '반죽 섞기' },
  { id: 'bake', emoji: '🔥', name: '굽기' },
  { id: 'cream', emoji: '🎨', name: '크림 바르기' },
  { id: 'decorate', emoji: '🍓', name: '토핑 데코' },
  { id: 'candles', emoji: '🕯️', name: '촛불 켜기' },
];

/* 케이크 실루엣은 PNG의 알파 채널에서 직접 읽는다.
   좌표를 손으로 맞추던 방식(예전 .bowl-items의 22%/27%/34%)의 반복을 피하려는 것.
   케이크 그림을 바꾸면 마스크도 자동으로 따라온다. */

/* 크림을 이만큼 발라야 다음 단계로 넘어간다.
   어르신 주인공은 손이 덜 닿아도 넘어갈 수 있게 조금 낮춘다. */
const creamGoal = () => (hostIsSenior() ? 0.7 : 0.8);
const creamDone = () => (state.cake.cream || 0) >= creamGoal();

/* 케이크 그림은 두 장이다.
   - `-bare`: 크림을 바르기 전의 맨 시트. 4단계에서 이 위에 크림을 칠한다.
   - 기본: 크림이 다 발린 완성 케이크. 크림 단계를 넘기면 이걸로 바뀐다.
   덕분에 "이미 크림이 발린 케이크에 또 크림을 바르는" 이상함이 사라지고,
   다 바르면 곧바로 예쁜 완성본이 나온다. */
/* 모든 케이크 그림을 같은 캔버스에 하단 정렬로 넣어뒀다(scripts/install_cake.py).
   덕분에 크림 전/후 전환에 크기 점프가 없고, 이 값 하나로 충분하다.
   img에 박아두면 로드 전에도 브라우저가 자리를 잡아 촛불·토핑이 튀지 않는다. */
const CAKE_ART_SIZE = [900, 820];

const cakeArtSrc = () => {
  const id = selectedCake().id;
  return creamDone() ? `public/cakes/cake-${id}.png` : `public/cakes/cake-${id}-bare.png`;
};

let cakeMask = { key: '', w: 0, h: 0, data: null, img: null, stencil: null };

/* 케이크 그림 아래쪽 이 비율은 접시다. 크림도 토핑도 여기엔 올라가면 안 된다. */
const PLATE_TOP = 0.9;

function ensureCakeMask(done) {
  const key = cakeArtSrc();
  if (cakeMask.key === key && cakeMask.data) return done(cakeMask);
  const img = new Image();
  img.onload = () => {
    const w = 220;
    const h = Math.max(1, Math.round((w * img.height) / img.width));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(img, 0, 0, w, h);
    // 접시 영역을 잘라낸 스텐실. 크림 마스킹과 판정에 모두 이걸 쓴다.
    context.clearRect(0, Math.round(h * PLATE_TOP), w, h);
    const pixels = context.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) data[i] = pixels[i * 4 + 3] > 60 ? 1 : 0;
    cakeMask = { key, w, h, data, img, stencil: canvas, stencilUrl: canvas.toDataURL('image/png') };
    done(cakeMask);
  };
  img.onerror = () => done(null);
  img.src = key;
}

function insideCake(u, v) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (!cakeMask.data) return u > 0.16 && u < 0.84 && v > 0.06 && v < 0.7;
  const x = Math.min(cakeMask.w - 1, Math.floor(u * cakeMask.w));
  const y = Math.min(cakeMask.h - 1, Math.floor(v * cakeMask.h));
  return cakeMask.data[y * cakeMask.w + x] === 1;
}

/* 토핑은 접시가 아니라 케이크 몸통 위에만 올라가야 한다 */
const canPlaceTopping = (u, v) => v < 0.74 && insideCake(u, v);

/* 크림이 케이크 밖으로 나가지 않게 — 캔버스 자체에 CSS 마스크를 씌운다.
   예전엔 스트로크마다 destination-in으로 잘랐는데, 가장자리 안티에일리어싱 때문에
   한 번에 픽셀 몇 개씩 안쪽으로 깎여서 수백 번 반복되면 크림이 통째로 사라졌다.
   CSS 마스크는 그릴 때마다 적용되는 게 아니라 화면에 나올 때 한 번 적용되므로 누적되지 않는다. */
function applyCakeMask(element) {
  if (!element || !cakeMask.stencilUrl) return;
  const value = `url("${cakeMask.stencilUrl}")`;
  element.style.webkitMaskImage = value;
  element.style.maskImage = value;
  element.style.webkitMaskSize = '100% 100%';
  element.style.maskSize = '100% 100%';
}

let cakeRaf = 0;
const cakeTimers = new Set();

function stopCake() {
  if (cakeRaf) cancelAnimationFrame(cakeRaf);
  cakeRaf = 0;
  cakeTimers.forEach((t) => {
    clearInterval(t);
    clearTimeout(t);
  });
  cakeTimers.clear();
}

const cakeAfter = (ms, fn) => {
  const t = setTimeout(fn, ms);
  cakeTimers.add(t);
  return t;
};

/* 케이크 변경분을 모아 서버로 보낸다. 여러 필드가 섞여도 안 잃도록 누적한다. */
let cakePushTimer = null;
let pendingCake = {};

function syncCake(patch, immediate = false) {
  Object.assign(state.cake, patch);
  cakeBusyUntil = Date.now() + 2500;
  save();
  Object.assign(pendingCake, patch);
  const flush = () => {
    const payload = pendingCake;
    pendingCake = {};
    if (Object.keys(payload).length) pushParty('cake', { cake: payload });
  };
  clearTimeout(cakePushTimer);
  if (immediate) flush();
  else cakePushTimer = setTimeout(flush, 500);
}

const hostIsSenior = () => (config.ageBands || {})[config.hostId] === 'senior';

const cakeStageIndex = () => {
  const index = CAKE_STAGES.findIndex((stage) => stage.id === state.cake.stage);
  return index < 0 ? CAKE_STAGES.length : index;
};

function setCakeStage(id) {
  const patch = { stage: id };
  if (id === 'done' && !state.cake.finishedAt) patch.finishedAt = Date.now();
  syncCake(patch, true);
  navigate(renderCakeGame);
}

/* ---------- 공용 조각 ---------- */

function stageRail() {
  const now = cakeStageIndex();
  return raw(
    `<div class="stage-rail">${CAKE_STAGES.map((stage, index) => {
      const cls = index < now ? 'done' : index === now ? 'now' : '';
      const locked = index > now;
      return `<button type="button" class="stage-dot ${cls}" data-stage="${stage.id}" ${
        locked ? 'disabled' : ''
      } aria-label="${escapeHtml(stage.name)}">${stage.emoji}</button>`;
    }).join('')}</div>`
  );
}

function bindRail() {
  app.querySelectorAll('[data-stage]').forEach((dot) => {
    dot.onclick = () => {
      if (dot.disabled) return;
      setCakeStage(dot.dataset.stage);
    };
  });
}

/* 이미 끝낸 단계로 되돌아왔을 때 다음으로 넘어갈 수 있게 한다.
   (예전엔 반죽 100%인 채로 돌아오면 "저으세요"만 나오고 나갈 길이 없었다) */
function stageNext(label, nextStage) {
  return raw(
    `<button class="btn btn--primary btn--block btn--big" data-next-stage="${nextStage}">${label}</button>`
  );
}

function bindStageNext() {
  const button = app.querySelector('[data-next-stage]');
  if (button) button.onclick = () => setCakeStage(button.dataset.nextStage);
}

function cakeMarkup(extra = '') {
  const cake = selectedCake();
  const toasty = state.cake.bake?.tint === 'toasty' ? 'toasty' : '';
  return raw(`<div class="cake ${toasty}" data-type="${cake.id}" id="cake">
    <img class="cake-art" src="${cakeArtSrc()}" alt="${escapeHtml(cake.name)}"
      width="${CAKE_ART_SIZE[0]}" height="${CAKE_ART_SIZE[1]}">
    ${
      state.cake.creamPng && !creamDone()
        ? `<img class="cream-layer" src="${state.cake.creamPng}" alt="">`
        : ''
    }
    ${extra}
  </div>`);
}

/* 토핑 그림 → 없으면 이모지. 그림이 빠져도 onerror가 이모지로 조용히 되돌린다. */
function toppingSprite(slot) {
  const topping = toppingFor(slot);
  return `<img src="${topping.src}" alt=""
    onerror="this.replaceWith(document.createTextNode('${escapeHtml(topping.emoji)}'))">`;
}

function placedToppingsMarkup() {
  return (state.cake.toppings || [])
    .map(
      (topping, index) =>
        `<span class="placed-topping" data-placed="${index}" style="left:${topping.x * 100}%;top:${
          topping.y * 100
        }%;transform:rotate(${topping.rot}deg);z-index:${Math.round(topping.y * 100)}">${toppingSprite(
          topping.slot
        )}</span>`
    )
    .join('');
}

/* ---------- 진입점 ---------- */

function renderCakeGame() {
  stopCake();
  if (state.cake.finishedAt && state.cake.stage === 'done') return renderCakeFinale();
  const stage = state.cake.stage || 'fill';
  if (stage === 'mix') return renderStageMix();
  if (stage === 'bake') return renderStageBake();
  if (stage === 'cream') return renderStageCream();
  if (stage === 'decorate') return renderStageDecorate();
  if (stage === 'candles') return renderStageCandles();
  if (stage === 'done') return renderCakeFinale();
  return renderStageFill();
}

/* ============================================================
   1단계 — 재료 넣기
   ============================================================ */

function renderStageFill() {
  const ingredients = cakeIngredients();
  const collected = collectedIngredientIds();
  const inBowl = new Set(state.cake.ingredients || []);
  const allIn = ingredients.every((item) => inBowl.has(item.id));

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">① 재료를 볼에 넣어요</h2>
    <p class="chef-speech" id="chef">${
      allIn ? '재료가 다 모였어요! 이제 반죽을 섞어요.' : '재료를 눌러서 볼에 넣어주세요!'
    }</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="bowl-wrap" id="bowl">
        <img class="bowl-photo" src="public/ui/pixel-mixing-bowl.png" alt="큰 분홍 믹싱볼">
        <div class="bowl-items" id="bowl-items">${raw(
          ingredients
            .filter((item) => inBowl.has(item.id))
            .map((item) => `<i>${ingredientArt(item)}</i>`)
            .join('')
        )}</div>
      </div>
    </div>
    <div class="banner"><span class="chip chip--lemon" id="fill-count">재료 ${inBowl.size} / ${
    ingredients.length
  }</span></div>
    <div class="pantry" id="pantry">${raw(
      ingredients
        .map((item, index) => {
          const available = collected.has(item.id);
          const done = inBowl.has(item.id);
          return `<button type="button" class="ingredient ${done ? 'mixed' : available ? 'available' : 'locked'}"
            style="--i:${index}" data-ingredient="${item.id}" ${done ? 'disabled' : ''}>
            <b>${ingredientArt(item)}</b><span>${escapeHtml(item.name)}</span>
            <small>${done ? '완료' : available ? '넣기' : '미발견'}</small></button>`;
        })
        .join('')
    )}</div>
    ${
      allIn
        ? raw('<button class="btn btn--primary btn--block btn--big" id="next">🥄 반죽 섞으러 가기</button>')
        : raw('<button class="btn btn--ghost btn--block" id="go-watch">👀 가족들 구경하러 가기</button>')
    }
  </div>`;

  bindTop();
  bindRail();

  const bowl = document.querySelector('#bowl');
  const bowlItems = document.querySelector('#bowl-items');

  const drop = (item, chip) => {
    if (inBowl.has(item.id)) return;
    inBowl.add(item.id);
    syncCake({ ingredients: [...inBowl] });
    // 이모지가 아니라 재료 그림이 날아가고 볼에도 그대로 담겨야 한다.
    // (예전엔 item.emoji 라서 설탕을 누르면 볼에 🍬 사탕이 들어갔다. 처음 렌더링은
    //  ingredientArt를 쓰고 있었기 때문에 새로 담은 것만 그림이 달랐다.)
    flyTo(chip, bowl, ingredientArt(item), () => {
      const node = document.createElement('i');
      node.innerHTML = ingredientArt(item);
      bowlItems.append(node);
      sfx('drop');
      pulse(bowl, 'squash');
      burstFrom(bowl, { count: 5, emoji: ['✨', '💫'], spread: 110, lift: 70 });
    });
    chip.classList.remove('available');
    chip.classList.add('mixed');
    chip.disabled = true;
    chip.querySelector('small').textContent = '완료';
    document.querySelector('#fill-count').textContent = `재료 ${inBowl.size} / ${ingredients.length}`;
    if (ingredients.every((each) => inBowl.has(each.id))) {
      document.querySelector('#chef').textContent = '재료가 다 모였어요! 이제 반죽을 섞어요.';
      cakeAfter(700, () => navigate(renderCakeGame));
    }
  };

  const refuse = (item, chip) => {
    const member = memberForIngredient(item.id);
    pulse(chip, 'shake');
    toast(member ? `아직 ${member.name}님이 찾는 중이에요!` : '아직 모으는 중이에요!');
  };

  app.querySelectorAll('[data-ingredient]').forEach((chip) => {
    const item = ingredients.find((each) => each.id === chip.dataset.ingredient);
    let ghost = null;

    chip.addEventListener('click', () => {
      if (!collected.has(item.id)) return refuse(item, chip);
      drop(item, chip);
    });

    chip.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!collected.has(item.id) || inBowl.has(item.id)) return;
      try { chip.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등에서는 무시 */ }
      // 손가락 두 개로 동시에 집으면 앞의 미리보기가 화면에 남는다
      if (ghost) ghost.remove();
      ghost = document.createElement('span');
      ghost.className = 'drag-ghost';
      ghost.innerHTML = ingredientArt(item);
      ghost.style.transform = `translate3d(${event.clientX - 26}px, ${event.clientY - 26}px, 0)`;
      document.body.append(ghost);
    });
    chip.addEventListener('pointermove', (event) => {
      if (!ghost) return;
      ghost.style.transform = `translate3d(${event.clientX - 26}px, ${event.clientY - 26}px, 0)`;
    });
    chip.addEventListener('pointerup', (event) => {
      if (!ghost) return;
      ghost.remove();
      ghost = null;
      const box = bowl.getBoundingClientRect();
      const over =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (over) drop(item, chip);
    });
    chip.addEventListener('pointercancel', () => {
      if (ghost) ghost.remove();
      ghost = null;
    });
  });

  watchParty(() => {
    if (!document.querySelector('.drag-ghost')) renderStageFill();
  });
  document.querySelector('#next')?.addEventListener('click', () => setCakeStage('mix'));
  document.querySelector('#go-watch')?.addEventListener('click', () =>
    state.active
      ? navigate(renderWatch, members.find((member) => member.id === state.active))
      : navigate(allComplete() ? renderFinale : renderMom)
  );
}

/* ============================================================
   2단계 — 반죽 섞기 (원형 드래그 + 직선 문지르기 관용 밸브)
   ============================================================ */

function renderStageMix() {
  const turns = hostIsSenior() ? 3 : 6;
  const done = (state.cake.mix || 0) >= 1;
  const items = cakeIngredients().filter((item) => (state.cake.ingredients || []).includes(item.id));

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">② 반죽을 섞어요</h2>
    <p class="chef-speech" id="chef">${
      done ? '반죽이 다 됐어요! 오븐으로 가요.' : '볼 위에서 손가락을 동그랗게 돌려주세요!'
    }</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="bowl-wrap" id="bowl" style="--mix:${state.cake.mix}">
        <img class="bowl-photo" src="public/ui/pixel-mixing-bowl.png" alt="큰 분홍 믹싱볼">
        <div class="bowl-items">${raw(items.map((item) => `<i>${ingredientArt(item)}</i>`).join(''))}</div>
        <i class="batter"><img src="public/game/batter.png" alt=""
          onerror="this.remove()" onload="this.parentElement.classList.add('has-art')"></i>
        <span class="whisk" id="whisk">🥄</span>
        <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="ring-track" cx="100" cy="100" r="92"></circle>
          <circle class="ring-fill" id="ring" cx="100" cy="100" r="92"
            stroke-dasharray="578" stroke-dashoffset="578"></circle>
        </svg>
        <span class="ghost-hand hidden" id="hint">👆</span>
      </div>
    </div>
    <div class="banner"><span class="chip chip--mint" id="mix-count">반죽 ${Math.round(
      state.cake.mix * 100
    )}%</span></div>
    ${done ? stageNext('🔥 오븐으로 가기', 'bake') : ''}
  </div>`;

  bindTop();
  bindRail();
  bindStageNext();

  const bowl = document.querySelector('#bowl');
  const ring = document.querySelector('#ring');
  const whisk = document.querySelector('#whisk');
  const label = document.querySelector('#mix-count');
  const hint = document.querySelector('#hint');

  let progress = state.cake.mix || 0;
  let stirring = false;
  let lastAngle = null;
  let lastPoint = null;
  let idle = null;
  let lastStir = 0;

  const paint = () => {
    ring.setAttribute('stroke-dashoffset', String(578 * (1 - Math.min(progress, 1))));
    bowl.style.setProperty('--mix', String(Math.min(progress, 1)));
    label.textContent = `반죽 ${Math.round(Math.min(progress, 1) * 100)}%`;
  };
  paint();

  const nudge = () => {
    clearTimeout(idle);
    hint.classList.add('hidden');
    idle = cakeAfter(4000, () => {
      hint.classList.remove('hidden');
      document.querySelector('#chef').textContent = '동그랗게 저어주세요! 좌우로 문질러도 돼요.';
    });
    cakeTimers.add(idle);
  };
  nudge();

  const finish = () => {
    syncCake({ mix: 1 }, true);
    document.querySelector('#chef').textContent = '반죽 완성! 이제 오븐에 구워요.';
    sfx('ding');
    burstFrom(bowl, { count: 20, emoji: ['✨', '🌟', '💛'] });
    cakeAfter(800, () => setCakeStage('bake'));
  };

  bowl.addEventListener('pointerdown', (event) => {
    if (progress >= 1) return;
    stirring = true;
    sfx('whisk');
    try { bowl.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등에서는 무시 */ }
    const p = pointerPos(event, bowl);
    lastAngle = Math.atan2(p.y - p.box.height / 2, p.x - p.box.width / 2);
    lastPoint = p;
    nudge();
  });

  bowl.addEventListener('pointermove', (event) => {
    if (!stirring || progress >= 1) return;
    const p = pointerPos(event, bowl);
    const angle = Math.atan2(p.y - p.box.height / 2, p.x - p.box.width / 2);

    // 원형: ±π 이음매에서 손떨림이 한 바퀴로 계산되지 않도록 |Δθ|<1.2rad 만 인정
    let delta = angle - lastAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 1.2) progress += Math.abs(delta) / (Math.PI * 2 * turns);

    // 관용 밸브: 직선으로 문질러도 40px마다 0.25바퀴를 적립한다
    const travel = Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y);
    if (travel > 4) progress += (travel / 40) * (0.25 / turns);

    // 저을 때마다 찰박찰박. 움직일 때마다 내면 지지직거려서 0.15초에 한 번만.
    const now = performance.now();
    if ((travel > 4 || Math.abs(delta) > 0.05) && now - lastStir > 150) {
      lastStir = now;
      sfx('stir');
    }

    lastAngle = angle;
    lastPoint = p;
    whisk.style.setProperty('--whisk', `${(angle * 180) / Math.PI + 90}deg`);
    paint();
    nudge();

    if (progress >= 1) {
      stirring = false;
      finish();
    }
  });

  const release = () => {
    if (!stirring) return;
    stirring = false;
    syncCake({ mix: Math.min(progress, 1) });
  };
  bowl.addEventListener('pointerup', release);
  bowl.addEventListener('pointercancel', release);
}

/* ============================================================
   3단계 — 굽기 (길게 눌렀다 떼기). 실패 사다리로 반드시 통과된다.
   ============================================================ */

function renderStageBake() {
  const baked = Boolean(state.cake.bake);
  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">③ 오븐에 구워요</h2>
    <p class="chef-speech" id="chef">${
      baked ? '이미 잘 구워졌어요! 크림을 바르러 가요.' : '버튼을 꾹 누르고, 초록 칸에서 손을 떼세요!'
    }</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="oven">
        <div class="oven-shell">
          <img class="oven-art" src="public/ui/oven.png" alt="오븐">
          <div class="oven-window" id="window">
            <span class="steam">💨</span>
            <img class="oven-cake" id="oven-cake" src="${cakeArtSrc()}" alt="">
          </div>
        </div>
        <div class="thermo">
          <div class="thermo-tube">
            <i class="thermo-fill" id="fill"></i>
            <i class="thermo-band"></i>
          </div>
          <img class="thermo-art" src="public/game/thermo.png" alt=""
            onerror="this.closest('.thermo').classList.add('no-art'); this.remove()">
        </div>
      </div>
    </div>
    ${
      baked
        ? stageNext('🎨 크림 바르러 가기', 'cream')
        : raw('<button class="btn btn--primary btn--block btn--big" id="bake">🔥 꾹 눌러서 굽기</button>')
    }
    <p class="card-note" id="tries"></p>
  </div>`;

  bindTop();
  bindRail();
  bindStageNext();

  const oven = document.querySelector('#window');
  const fill = document.querySelector('#fill');
  const cake = document.querySelector('#oven-cake');
  const button = document.querySelector('#bake');
  const chef = document.querySelector('#chef');
  const tries = document.querySelector('#tries');
  if (!button) return;

  let heat = 0;
  let holding = false;
  let attempts = 0;
  let stopSizzle = () => {};

  const paint = () => {
    fill.style.setProperty('--bake', String(heat));
    cake.style.setProperty('--bake', String(heat));
  };

  const done = (stars, tint, message) => {
    stopSizzle();
    sfx('ding');
    holding = false;
    if (cakeRaf) cancelAnimationFrame(cakeRaf);
    cakeRaf = 0;
    oven.classList.remove('hot');
    syncCake({ bake: { stars, tint } }, true);
    chef.textContent = message;
    burstFrom(oven, { count: 22, emoji: ['⭐', '✨', '🍰'] });
    cakeAfter(900, () => setCakeStage('cream'));
  };

  const start = (event) => {
    event.preventDefault();
    if (holding || state.cake.bake) return;
    holding = true;
    heat = 0;
    attempts += 1;
    oven.classList.add('hot');
    stopSizzle = sfxLoop('sizzle');   // 누르고 있는 동안 치이익
    let last = performance.now();
    const step = (now) => {
      if (!holding) return;
      heat = Math.min(heat + (now - last) / 3500, 1.15);
      last = now;
      paint();
      if (heat >= 1.15) {
        done(2, 'toasty', '조금 노릇하지만 그래도 맛있어요!');
        return;
      }
      cakeRaf = requestAnimationFrame(step);
    };
    cakeRaf = requestAnimationFrame(step);
  };

  const release = () => {
    if (!holding) return;
    holding = false;
    stopSizzle();
    if (cakeRaf) cancelAnimationFrame(cakeRaf);
    cakeRaf = 0;
    oven.classList.remove('hot');

    if (heat >= 0.7 && heat <= 0.92) return done(3, 'perfect', '완벽해요! 최고의 케이크!');
    if (heat > 0.92) return done(2, 'toasty', '조금 노릇하지만 그래도 맛있어요!');
    if (attempts >= 3) return done(2, 'perfect', '완벽해요! 잘 구워졌어요!');

    chef.textContent = '조금 덜 익었어요! 초록 칸까지 더 눌러주세요.';
    tries.textContent = `${attempts}번 해봤어요 · 3번째부터는 언제 떼도 완성돼요`;
    pulse(oven, 'shake');
    heat = 0;
    paint();
  };

  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

/* ============================================================
   4단계 — 크림 바르기 (캔버스 페인팅)
   ============================================================ */

function renderStageCream() {
  const goal = creamGoal();
  const creamed = creamDone();

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">④ 크림을 발라요</h2>
    <p class="chef-speech" id="chef">${
      creamed ? '크림이 예쁘게 발렸어요! 토핑을 올리러 가요.' : '손가락으로 케이크 위를 문질러 크림을 발라주세요!'
    }</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="cake-holder" id="holder">
        ${cakeMarkup('<canvas class="cream-canvas" id="cream"></canvas>')}
      </div>
    </div>
    <div class="banner"><span class="chip chip--pink" id="cream-count">크림 ${Math.round(
      (state.cake.cream || 0) * 100
    )}%</span></div>
    ${creamed ? stageNext('🍓 토핑 올리러 가기', 'decorate') : ''}
  </div>`;

  bindTop();
  bindRail();
  bindStageNext();

  const cakeEl = document.querySelector('#cake');
  const canvas = document.querySelector('#cream');
  const label = document.querySelector('#cream-count');
  const chef = document.querySelector('#chef');

  const setup = () => {
    const box = cakeEl.getBoundingClientRect();
    canvas.width = Math.max(120, Math.round(box.width));
    canvas.height = Math.max(90, Math.round(box.height));
  };
  setup();
  ensureCakeMask(() => {
    applyCakeMask(canvas);
    applyCakeMask(document.querySelector('.cream-layer'));
  });

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(18, canvas.width * 0.085);
  context.strokeStyle = getComputedStyle(cakeEl).getPropertyValue('--cake-cream').trim() || '#fff';
  context.globalAlpha = 1;
  context.shadowBlur = 0;

  if (state.cake.creamPng) {
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = state.cake.creamPng;
  }

  let painting = false;
  // 이미 다 바른 뒤 되돌아왔으면 더 못 칠하게 막는다.
  // 막지 않으면 빈 캔버스에서 커버리지를 다시 재서 완성 값(80%)을 몇 %로 덮어써 버렸다
  // → 케이크가 "안 바른 상태"로 돌아가 빵 위에 붓자국만 남는 버그.
  let finished = creamed;

  const coverage = () => {
    const { width: w, height: hgt } = canvas;
    const data = context.getImageData(0, 0, w, hgt).data;
    let inside = 0;
    let painted = 0;
    for (let i = 0; i < w * hgt; i += 8) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (!insideCake(x / w, y / hgt)) continue;
      inside += 1;
      if (data[i * 4 + 3] > 40) painted += 1;
    }
    return painted / Math.max(inside, 1);
  };

  const exportCream = () => {
    const out = document.createElement('canvas');
    out.width = 260;
    out.height = 200;
    out.getContext('2d').drawImage(canvas, 0, 0, 260, 200);
    return out.toDataURL('image/png');
  };

  const check = () => {
    if (finished) return;
    const value = coverage();
    state.cake.cream = value;
    label.textContent = `크림 ${Math.round(value * 100)}%`;
    if (value < goal) return;
    finished = true;
    painting = false;
    // 완성본 케이크 그림으로 바뀌므로 칠한 레이어는 더 들고 있지 않는다
    syncCake({ cream: value, creamPng: '' }, true);
    sfx('ding');
    chef.textContent = '크림이 예쁘게 발렸어요!';
    pulse(cakeEl, 'pop');
    burstFrom(cakeEl, { count: 20, emoji: ['✨', '🤍', '💗'] });
    cakeAfter(800, () => setCakeStage('decorate'));
  };

  // 손을 뗄 때만 재면 "드래그하다 떼야 퍼센트가 오른다"가 된다.
  // 칠하는 동안에도 재되, getImageData가 비싸니 120ms 간격으로만 잰다.
  let lastCheck = 0;
  const checkLive = () => {
    const now = performance.now();
    if (now - lastCheck < 120) return;
    lastCheck = now;
    check();
  };

  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * canvas.width) / box.width,
      y: ((event.clientY - box.top) * canvas.height) / box.height,
    };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (finished) return;
    painting = true;
    sfx('spray');   // 붓을 댈 때 한 번. 움직일 때마다 내면 지지직거린다
    try { canvas.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등에서는 무시 */ }
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + 0.1, p.y);
    context.stroke();
    context.beginPath();
    context.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!painting) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
    context.beginPath();
    context.moveTo(p.x, p.y);
    checkLive();
  });
  const stop = () => {
    if (!painting) return;
    painting = false;
    state.cake.creamPng = exportCream();
    check();
    if (!finished) syncCake({ cream: state.cake.cream, creamPng: state.cake.creamPng });
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

/* ============================================================
   5단계 — 토핑 데코. 토핑 하나가 가족 한 명.
   ============================================================ */

function renderStageDecorate() {
  const placed = state.cake.toppings || [];
  const shelf = toppingList();

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">⑤ 토핑을 올려요</h2>
    <p class="chef-speech" id="chef">토핑을 끌어다 케이크 위에 올려주세요! 눌러서 올려도 돼요.</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="cake-holder" id="holder">
        ${cakeMarkup(`<div class="topping-layer" id="layer">${placedToppingsMarkup()}</div>`)}
      </div>
    </div>
    <div class="banner">
      <span class="chip chip--lemon" id="topping-count">올린 토핑 ${placed.length}개</span>
      <button class="btn btn--chip" id="undo-topping">↩︎ 하나 빼기</button>
    </div>
    <div class="topping-tray" id="tray">${raw(
      shelf
        .map(
          (topping, slot) =>
            `<button type="button" class="tray-topping" data-topping="${slot}" title="${escapeHtml(
              topping.name
            )}">${toppingSprite(slot)}</button>`
        )
        .join('')
    )}</div>
    ${stageNext('🕯️ 촛불 켜러 가기', 'candles')}
  </div>`;

  bindTop();
  bindRail();
  bindStageNext();
  ensureCakeMask(() => {});

  const cakeEl = document.querySelector('#cake');
  const layer = document.querySelector('#layer');
  const counter = document.querySelector('#topping-count');
  let picked = null;

  const refresh = () => {
    counter.textContent = `올린 토핑 ${(state.cake.toppings || []).length}개`;
  };

  /* 다시 그리지 않고 노드만 붙인다 — 올리는 즉시 보이게 */
  const place = (slot, u, v) => {
    if (!canPlaceTopping(u, v)) return false;
    const topping = { slot, x: u, y: v, rot: Math.round(randBetween(-14, 14)) };
    const list = [...(state.cake.toppings || []), topping];
    syncCake({ toppings: list });
    sfx('sparkle');
    const node = document.createElement('span');
    node.className = 'placed-topping';
    node.dataset.placed = String(list.length - 1);
    node.style.left = `${u * 100}%`;
    node.style.top = `${v * 100}%`;
    node.style.transform = `rotate(${topping.rot}deg)`;
    node.style.zIndex = String(Math.round(v * 100));
    node.innerHTML = toppingSprite(slot);
    layer.append(node);
    refresh();
    return true;
  };

  app.querySelectorAll('[data-topping]').forEach((chip) => {
    const slot = Number(chip.dataset.topping);
    let ghost = null;

    chip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try {
        chip.setPointerCapture(event.pointerId);
      } catch {
        /* 합성 이벤트 등에서는 무시 */
      }
      // 손가락 두 개로 동시에 집으면 앞의 미리보기가 화면에 남는다
      if (ghost) ghost.remove();
      ghost = document.createElement('span');
      ghost.className = 'drag-ghost';
      ghost.innerHTML = chip.innerHTML;
      ghost.style.transform = `translate3d(${event.clientX - 26}px, ${event.clientY - 26}px, 0)`;
      document.body.append(ghost);
    });
    chip.addEventListener('pointermove', (event) => {
      if (!ghost) return;
      ghost.style.transform = `translate3d(${event.clientX - 26}px, ${event.clientY - 26}px, 0)`;
    });
    chip.addEventListener('pointerup', (event) => {
      if (!ghost) return;
      ghost.remove();
      ghost = null;
      const box = cakeEl.getBoundingClientRect();
      const u = (event.clientX - box.left) / box.width;
      const v = (event.clientY - box.top) / box.height;
      // 트레이 위에서 뗀 건 드래그가 아니라 그냥 탭 — 선택만 해둔다
      if (event.target.closest('.topping-tray') && Math.abs(u - 0.5) > 2) return;
      if (!place(slot, u, v)) {
        app.querySelectorAll('.tray-topping').forEach((each) => each.classList.remove('picked'));
        picked = slot;
        chip.classList.add('picked');
      }
    });
    chip.addEventListener('pointercancel', () => {
      if (ghost) ghost.remove();
      ghost = null;
    });
    chip.addEventListener('click', () => {
      app.querySelectorAll('.tray-topping').forEach((each) => each.classList.remove('picked'));
      picked = slot;
      chip.classList.add('picked');
    });
  });

  cakeEl.addEventListener('click', (event) => {
    if (picked === null) return;
    const box = cakeEl.getBoundingClientRect();
    place(picked, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  });

  document.querySelector('#undo-topping').onclick = () => {
    const list = [...(state.cake.toppings || [])];
    if (!list.length) return;
    list.pop();
    syncCake({ toppings: list });
    layer.lastElementChild?.remove();
    refresh();
  };
}

/* ============================================================
   6단계 — 하트 초 꽂고 후 불기
   초는 하나만. 위치가 애매하다는 지적이 있어서 드래그로 직접 옮길 수 있게 했다.
   ============================================================ */

const candleArt = () =>
  `<img src="public/game/heart-candle.png" alt=""
     onerror="this.replaceWith(document.createTextNode('🕯️'))">`;

function renderStageCandles() {
  const candle = state.cake.candle || { x: 0.5, y: 0.2, lit: false, out: false };

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🥣 케이크 만들기')}
    ${stageRail()}
    <h2 class="stage-title">⑥ 초를 꽂고 후 불어요</h2>
    <p class="chef-speech" id="chef">${
      candle.out
        ? '촛불을 껐어요! 케이크 완성이에요.'
        : candle.lit
        ? '이제 아래 버튼을 꾹 눌러 후~ 불어요!'
        : '초를 끌어서 원하는 자리에 놓고, 눌러서 불을 켜주세요!'
    }</p>
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <span class="wind" id="wind">💨</span>
      <div class="cake-holder">
        ${cakeMarkup(
          `<div class="topping-layer">${placedToppingsMarkup()}</div>
           <button type="button" class="heart-candle ${candle.lit ? 'lit' : ''} ${
            candle.out ? 'out' : ''
          }" id="candle" style="left:${candle.x * 100}%;top:${candle.y * 100}%">${candleArt()}</button>`
        )}
      </div>
    </div>
    ${
      candle.out
        ? stageNext('🎂 완성한 케이크 보기', 'done')
        : candle.lit
        ? raw('<button class="btn btn--primary btn--block btn--big" id="blow">💨 꾹 눌러서 후~ 불기</button>')
        : ''
    }
  </div>`;

  bindTop();
  bindRail();
  bindStageNext();
  ensureCakeMask(() => {});

  const cakeEl = document.querySelector('#cake');
  const button = document.querySelector('#candle');
  let dragging = false;
  let moved = false;

  button.addEventListener('pointerdown', (event) => {
    if (candle.out) return;
    event.preventDefault();
    dragging = true;
    moved = false;
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      /* 합성 이벤트 등에서는 무시 */
    }
  });

  button.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const box = cakeEl.getBoundingClientRect();
    const u = clamp((event.clientX - box.left) / box.width, 0.05, 0.95);
    const v = clamp((event.clientY - box.top) / box.height, 0.02, 0.72);
    if (Math.abs(u - candle.x) > 0.01 || Math.abs(v - candle.y) > 0.01) moved = true;
    candle.x = u;
    candle.y = v;
    button.style.left = `${u * 100}%`;
    button.style.top = `${v * 100}%`;
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    // 끌었으면 위치만 저장하고, 그냥 눌렀으면 불을 켠다
    if (moved) {
      syncCake({ candle: { ...candle } });
      return;
    }
    if (candle.lit) return;
    candle.lit = true;
    sfx('light');
    button.classList.add('lit');
    pulse(button, 'pop');
    syncCake({ candle: { ...candle } }, true);
    cakeAfter(450, () => navigate(renderCakeGame));
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', () => {
    dragging = false;
  });

  const blow = document.querySelector('#blow');
  if (!blow) return;

  const wind = document.querySelector('#wind');
  let holding = false;
  const start = (event) => {
    event.preventDefault();
    if (holding) return;
    holding = true;
    wind.classList.add('blowing');
    sfx('blow');
    document.querySelector('#chef').textContent = '후~~~ 조금만 더!';
    cakeAfter(1100, () => {
      if (!holding) return;
      candle.out = true;
      syncCake({ candle: { ...candle }, stage: 'done', finishedAt: Date.now() }, true);
      navigate(renderCakeGame);
    });
  };
  const stop = () => {
    holding = false;
    wind.classList.remove('blowing');
  };
  blow.addEventListener('pointerdown', start);
  blow.addEventListener('pointerup', stop);
  blow.addEventListener('pointercancel', stop);
}

/* ============================================================
   완성 — 감상 모드
   ============================================================ */

/* 완성 화면에도 꽂아둔 초를 그대로 보여준다 (불은 끈 상태) */
function finaleCandleMarkup() {
  const candle = state.cake.candle;
  if (!candle) return '';
  // out을 붙이면 회색 필터가 걸린다. 완성 사진에서는 초가 주인공이라 그대로 둔다.
  return `<span class="heart-candle finale-candle" style="left:${candle.x * 100}%;top:${
    candle.y * 100
  }%">${candleArt()}</span>`;
}

function renderCakeFinale() {
  const host = hostMember();
  const stars = state.cake.bake?.stars || 3;

  app.innerHTML = h`<div class="screen cake-game">
    ${baseTop('🎂 케이크 완성!')}
    <div class="cake-stage">
      <i class="counter-stripes"></i>
      <div class="cake-holder finale-cake">
        ${cakeMarkup(
          `<div class="topping-layer">${placedToppingsMarkup()}</div>${finaleCandleMarkup()}`
        )}
      </div>
    </div>
    <section class="card final-card">
      <div class="star-row">${raw('⭐'.repeat(stars) + '☆'.repeat(3 - stars))}</div>
      <h2>${host.name}님의 케이크 완성!</h2>
      <p>가족 ${state.completed.length}명이 재료를 모아 만든 케이크예요.</p>
      <button class="btn btn--primary btn--block btn--big" id="letters">🎁 선물이 도착했어요</button>
      <div class="btn-row">
        <button class="btn btn--lemon" id="save-photo">📸 케이크 저장</button>
        <button class="btn btn--ghost" id="again">🔄 다시 만들기</button>
      </div>
    </section>
  </div>`;

  bindTop();
  cakeAfter(200, () => burstFrom(document.querySelector('.cake-holder'), { count: 34 }));

  // 편지를 바로 열지 않고 선물 상자를 거친다. 케이크를 다 만든 직후의 한 방을 위해서다.
  document.querySelector('#letters').onclick = () =>
    navigate(allComplete() ? renderGiftBox : renderFinale);
  document.querySelector('#save-photo').onclick = saveCakePhoto;
  document.querySelector('#again').onclick = () => {
    askConfirm('케이크를 처음부터 다시 만들까요?', () => {
      state.cake = newCake();
      syncCake({ ...newCake() }, true);
      navigate(renderCakeGame);
    }, '다시 만들기');
  };
}

function saveCakePhoto() {
  const host = hostMember();
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');

  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffe9f4');
  bg.addColorStop(1, '#fff6d9');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  const caption = () => {
    c.fillStyle = '#2b1a4d';
    c.textAlign = 'center';
    c.font = '700 76px Jua, sans-serif';
    c.fillText(`${host.name}님, 생일 축하해요!`, W / 2, 140);
    c.font = '44px Jua, sans-serif';
    c.fillText(
      `가족 ${state.completed.length}명이 함께 만든 케이크 · 하트 ${state.cheers}개`,
      W / 2,
      H - 120
    );
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'birthday-cake.png';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('📸 케이크 사진을 저장했어요!');
    }, 'image/png');
  };

  const art = new Image();
  art.onload = () => {
    const boxW = W - 200;
    const boxH = (boxW * art.height) / art.width;
    const boxX = 100;
    const boxY = (H - boxH) / 2;
    c.drawImage(art, boxX, boxY, boxW, boxH);

    const drawToppings = () => {
      c.font = '70px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      let remaining = (state.cake.toppings || []).length;
      if (!remaining) return caption();
      (state.cake.toppings || []).forEach((topping) => {
        const x = boxX + topping.x * boxW;
        const y = boxY + topping.y * boxH;
        const pick = toppingFor(topping.slot);
        const done = () => {
          remaining -= 1;
          if (!remaining) caption();
        };
        const sprite = new Image();
        sprite.onload = () => {
          c.drawImage(sprite, x - 46, y - 46, 92, 92);
          done();
        };
        sprite.onerror = () => {
          c.fillText(pick.emoji, x, y);
          done();
        };
        sprite.src = pick.src;
      });
    };

    if (state.cake.creamPng) {
      const cream = new Image();
      cream.onload = () => {
        c.drawImage(cream, boxX, boxY, boxW, boxH);
        drawToppings();
      };
      cream.onerror = drawToppings;
      cream.src = state.cake.creamPng;
    } else {
      drawToppings();
    }
  };
  art.onerror = caption;
  art.src = cakeArtSrc();
}
