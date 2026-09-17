/* ============================================================
   screens.js — 모든 화면. 각 화면은 단일 루트 <div class="screen">를 낸다.
   ============================================================ */

/* ---------- 로비 ---------- */

/* ---------- 들어가기 (초대 코드) ----------
   한 서버가 여러 생일파티를 받는다. 코드가 없으면 여기서 시작한다:
   파티를 새로 만들어 코드를 받거나, 받은 코드로 남의 파티에 들어가거나. */
function renderEntry(problem = '') {
  app.innerHTML = h`<div class="screen entry-screen">
    <div class="birthday-hero">
      <h1 aria-label="Happy Birthday">
        <img class="title-art" src="public/ui/title-happy-birthday.png" alt="HAPPY BIRTHDAY!"
          onerror="this.closest('h1').classList.add('no-art'); this.remove()">
        <span class="title-line">HAPPY</span>
        <span class="title-line">BIRTHDAY!</span>
      </h1>
    </div>
    ${
      partyCode
        ? raw(h`<section class="card card--lemon">
            <h2 class="center">지난번 파티로 들어가기</h2>
            <p class="center">초대 코드 <b>${partyCode}</b></p>
            <button class="btn btn--primary btn--block btn--big" id="resume-party">🎈 이 파티로 들어가기</button>
          </section>`)
        : ''
    }
    <section class="card">
      <h2 class="center">초대 코드가 있나요?</h2>
      <p class="center">가족에게 받은 다섯 글자를 넣어주세요.</p>
      <input class="code-input" id="code-input" type="text" inputmode="latin" autocomplete="off"
        maxlength="5" placeholder="ABCDE" aria-label="초대 코드">
      <button class="btn btn--primary btn--block btn--big" id="join-party">🎈 파티 들어가기</button>
      ${problem ? raw(`<p class="center code-problem">${escapeHtml(problem)}</p>`) : ''}
    </section>
    ${
      // 파티를 만드는 건 준비하는 사람(편집 모드)만. 코드를 받고 들어온 가족에게는 안 보인다.
      isEditor
        ? raw(`<section class="card card--mint">
            <h2 class="center">처음 여는 건가요?</h2>
            <p class="center">파티를 만들면 초대 코드가 나와요. 이어서 편집 모드로 들어갑니다.</p>
            <button class="btn btn--lemon btn--block btn--big" id="new-party">🎉 새 파티 만들기</button>
          </section>`)
        : ''
    }
  </div>`;

  const input = document.querySelector('#code-input');
  // 소문자로 쳐도 되게 올려주고, 코드에 없는 글자는 아예 안 들어가게 막는다
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.querySelector('#join-party').click();
  });

  document.querySelector('#resume-party')?.addEventListener('click', () => loadConfig(renderIdentity));

  document.querySelector('#join-party').onclick = async () => {
    const code = input.value.trim();
    if (code.length !== 5) return toast('초대 코드는 다섯 글자예요.');
    try {
      const response = await apiFetch(`api/config?code=${encodeURIComponent(code)}`);
      if (!response.ok) return renderEntry('그런 초대 코드가 없어요. 다시 확인해주세요.');
      const found = await response.json();
      // 준비 중인 방(아직 "파티 생성하기" 전)에는 가족이 못 들어간다
      if (!isEditor && found.open === false) return renderEntry('아직 준비 중인 파티예요. 잠시 뒤에 다시 시도해주세요.');
      setPartyCode(code);
      loadConfig(renderIdentity);
    } catch {
      toast('서버에 닿지 못했어요. 인터넷 연결을 확인해주세요.');
    }
  };

  document.querySelector('#new-party')?.addEventListener('click', async () => {
    try {
      // 코드와 주최자 열쇠만 이 기기에 만든다. 저장하거나 "파티 생성하기"를 눌러야 서버에 생긴다.
      setPartyCode(await mintParty());
      loadConfig(renderEditor);
    } catch (error) {
      toast(error.message || '서버에 닿지 못했어요.');
    }
  });
}

function renderLobby() {
  const letters = (word) =>
    raw(
      word
        .split('')
        .map((letter, index) => `<b style="--i:${index}">${escapeHtml(letter)}</b>`)
        .join('')
    );

  app.innerHTML = h`<div class="screen start-screen">
    <div class="birthday-hero">
      <h1 aria-label="Happy Birthday">
        <img class="title-art" src="public/ui/title-happy-birthday.png" alt="HAPPY BIRTHDAY!"
          onerror="this.closest('h1').classList.add('no-art'); this.remove()">
        <span class="title-line">${letters('HAPPY')}</span>
        <span class="title-line">${letters('BIRTHDAY!')}</span>
      </h1>
      <p>가족들과 함께 재료를 모아<br>특별한 케이크를 완성해보세요!</p>
    </div>
    <button class="btn btn--primary btn--big" id="enter">🎮 게임방 입장하기</button>
  </div>`;

  // 코드를 넣거나 새로 만드는 화면부터 — 이미 들어와 있던 사람은 거기서 한 번에 이어서 들어간다
  document.querySelector('#enter').onclick = () => navigate(renderEntry);
  document.querySelector('.start-screen').addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    burst(event.clientX, event.clientY, { count: 20 });
  });
}

/* ---------- 당신은 누구인가요? ---------- */

function renderIdentity(openList = false) {
  const host = hostMember();
  const people = [...playerMembers(), host].filter(Boolean);

  const row = (member, index) => {
    const isHost = member.id === config.hostId;
    const isClear = !isHost && state.completed.includes(member.id);
    const meta = isHost
      ? '👑 주인공'
      : isClear
      ? '👀 관전'
      : `+${rewardFor(member.id).toLocaleString()}원`;
    return raw(h`<button class="btn person-choice ${isClear ? 'is-clear' : ''}" style="--i:${index}" data-member="${member.id}">
      ${avatar(member)}
      <span class="person-name">${isClear ? raw('<img class="clear-stamp" src="public/ui/great-job-stamp.png" alt="참 잘했어요 도장">') : ''}${member.name}</span>
      <small class="person-meta">${meta}</small>
    </button>`);
  };

  app.innerHTML = h`<div class="screen identity-screen">
    <div class="topbar">
      <div class="topbar-side">
        ${
          // 홈 버튼은 테스트(편집 모드)에서만. 가족 화면에서는 눌렀다가 파티에서 나가지므로 없앤다.
          // 나가려면 폰 자체 뒤로가기를 쓴다.
          isEditor ? raw('<button class="btn btn--icon" id="go-home" aria-label="편집 모드로">⌂</button>') : ''
        }
      </div>
      <span></span>
      <div class="topbar-side topbar-side--end">
        <span class="topbar-mute"></span>
        ${
          // 진행 상황 초기화는 준비하는 사람만. 코드로 들어온 가족 화면에는 없다.
          isEditor ? raw('<button class="btn btn--icon" id="reset" aria-label="진행 상황 처음으로">↻</button>') : ''
        }
      </div>
    </div>
    <div class="identity-head">
      <h1>당신은 누구인가요?</h1>
      <p>아래 칸을 눌러 이름을 선택해주세요.</p>
    </div>
    <button class="btn btn--lemon btn--block btn--big" id="answer-input">이름을 선택하세요 ▾</button>
    <div class="person-list hidden" id="person-list">${people.map(row)}</div>
  </div>`;

  const input = document.querySelector('#answer-input');
  const list = document.querySelector('#person-list');
  const openIt = () => {
    if (!list.classList.contains('hidden')) return;
    list.classList.remove('hidden');
    input.disabled = true;
  };
  input.onclick = openIt;
  if (openList) openIt();
  // 테스트 중(편집 모드)일 때만 있는 버튼 — 편집 화면으로 돌아간다
  const home = document.querySelector('#go-home');
  if (home) home.onclick = () => navigate(renderEditor);
  bindReset();
  // 다른 폰에서 누가 클리어하면 목록이 바로 갱신된다
  watchParty(() => renderIdentity(!list.classList.contains('hidden')));
  app.querySelectorAll('[data-member]').forEach((button) => {
    button.onclick = () => openMember(button.dataset.member);
  });
}

/* ---------- 라우터 ---------- */

function openMember(id) {
  const member = members.find((x) => x.id === id);
  if (!member) return;
  state.viewer = id;
  save();

  if (id === config.hostId) {
    // 주인공: 전원 완료면 피날레 허브, 아니면 관전 라운지.
    // (예전 코드는 전원 완료 시 편지 화면으로 하드컷돼서 케이크를 만들 수 없었다)
    return navigate(allComplete() ? renderFinale : renderMom);
  }
  if (allComplete()) return navigate(renderGameEnded);
  if (state.completed.includes(id)) return navigate(renderMemberSuccess, member);
  if (statusOf(id) === 'playing' && id !== state.active) return navigate(renderWatch, member);
  state.active = id;
  save();
  pushParty('active', { memberId: id });
  navigate(renderGame, member);
}

/* ---------- 미니게임 화면 ---------- */

function renderGame(member) {
  app.innerHTML = h`<div class="screen ${member.elder ? 'elder' : ''}">
    ${baseTop(`${member.emoji} ${member.name}의 도전`)}
    <div class="banner">
      <span>${member.game}</span>
      <span class="chip chip--pink">성공하면 +${rewardFor(member.id).toLocaleString()}원</span>
    </div>
    <p class="instruction" id="instruction">준비 중…</p>
    <div class="game-zone" id="zone"></div>
    <div class="scoreline">
      <span class="chip" id="score">성공 0 / 5</span>
      <span class="chip chip--pink lives" id="lives"></span>
    </div>
    <div class="help-dock ${isEditor ? '' : 'hidden'}" id="help-dock">
      ${
        // 편집 모드는 진행자 버튼과 가족용 도와주세요 흐름을 둘 다 띄워서 같이 시험해 볼 수 있게 한다.
        // btn-row는 2열 그리드다. 버튼이 하나뿐인데 그걸 쓰면 왼쪽 칸에만 붙어 삐뚤어 보인다.
        raw(`${isEditor ? '<button class="btn btn--ghost" id="skip">진행자: 바로 미션 완료</button>' : ''}
             <button class="btn btn--lav" id="offline">🙋 도와주세요 · 다른 미션 할래요</button>`)
      }
    </div>
  </div>`;

  bindTop();
  // 진행자용 #skip은 그대로 바로 완료. 가족용 #offline은 한 번 눌러 바로 오프라인 미션으로 간다.
  // (예전엔 "도와주세요" → "바로 미션 완료 할래요" 두 번 눌러야 해서 한 단계 줄였다)
  document.querySelector('#skip')?.addEventListener('click', () => navigate(completeMission, member));
  document.querySelector('#offline')?.addEventListener('click', () =>
    navigate(renderOfflineMission, member)
  );
  startGame(member);
}

/* ---------- 게임 대신 하는 오프라인 미션 ---------- */

function renderOfflineMission(member) {
  const list = offlineMissions();
  const pick = list[Math.floor(Math.random() * list.length)];

  app.innerHTML = h`<div class="screen">
    ${baseTop('미션을 바꿨어요!')}
    <section class="card card--mint offline-card">
      ${art(pick.emoji)}
      <h2>게임 대신 이걸 해요</h2>
      <p class="offline-mission">${pick.text}</p>
      <p class="offline-hint">가족들 앞에서 해주세요.<br>다 하고 나면 아래 버튼을 눌러요.</p>
      <button class="btn btn--primary btn--block btn--big" id="offline-done">완료하고 넘어가기</button>
    </section>
  </div>`;

  bindTop();
  // 미션을 한 뒤에 눌러야 통과다. 누르기 전까지는 아직 클리어가 아니다.
  document.querySelector('#offline-done').onclick = () => navigate(completeMission, member);
}

/* ---------- 미션 클리어 ---------- */

function completeMission(member) {
  if (!member) return navigate(renderIdentity);
  if (!state.completed.includes(member.id)) {
    state.completed.push(member.id);
    state.active = null;
    save();
    pushParty('complete', { memberId: member.id });
  }
  const ingredient = ingredientFor(member.id);

  app.innerHTML = h`<div class="screen">
    ${baseTop('MISSION CLEAR!')}
    <section class="card card--lemon clear-card">
      ${art(ingredient?.emoji || '✨')}
      <h2>미션 성공!</h2>
      <p>${member.name}님이 케이크 재료 <b>${ingredient?.name || '사랑 한 스푼'}</b>${particle(ingredient?.name || '사랑 한 스푼', '을', '를')} 찾았어요.</p>
      <div class="reward-amount" id="reward">+0원</div>
      ${progressBar()}
      <button class="btn btn--primary btn--block" id="write-letter">💌 ${hostMember().name}님께 편지 쓰기</button>
    </section>
  </div>`;

  bindTop();
  countUp(document.querySelector('#reward'), rewardFor(member.id), '원');
  const card = document.querySelector('.clear-card');
  setTimeout(() => burstFrom(card, { count: 28 }), 160);
  document.querySelector('#write-letter').onclick = () => navigate(renderLetterComposer, member);
}

/* ---------- 내 성공 페이지 ---------- */

function renderMemberSuccess(member) {
  const ingredient = ingredientFor(member.id);
  const playing = members.find((m) => m.id !== member.id && statusOf(m.id) === 'playing');
  const letter = (state.letters || {})[member.id] || {};
  const wrote = Boolean(letter.text || letter.drawing);

  app.innerHTML = h`<div class="screen ${member.elder ? 'elder' : ''}">
    ${baseTop(`${member.emoji} ${member.name}의 결과`)}
    <section class="card card--mint clear-card">
      <div class="success-badge">
        ${avatar(member)}
        <img class="clear-stamp" src="public/ui/great-job-stamp.png" alt="참 잘했어요 도장">
      </div>
      <h2>${member.name}님은 성공!</h2>
      <p>${member.game} 미션을 해내고<br>케이크 재료 <b>${ingredient?.name || '사랑 한 스푼'}</b>${particle(ingredient?.name || '사랑 한 스푼', '을', '를')} 찾았어요.</p>
      <div class="reward-amount">+${rewardFor(member.id).toLocaleString()}원</div>
      ${progressBar()}
      <button class="btn btn--primary btn--block" id="watch-now">
        ${playing ? `👀 ${playing.name} 관전하기` : '👀 다른 가족 구경하기'}
      </button>
      <button class="btn btn--lemon btn--block" id="letter-again">
        ${wrote ? '💌 편지 다시 쓰기' : `💌 ${hostMember().name}님께 편지 쓰기`}
      </button>
      <button class="btn btn--ghost btn--block" id="choose-another">가족 목록으로</button>
    </section>
  </div>`;

  bindTop();
  document.querySelector('#watch-now').onclick = () => navigate(renderWatch, playing || null);
  document.querySelector('#letter-again').onclick = () => navigate(renderLetterComposer, member);
  document.querySelector('#choose-another').onclick = () => navigate(renderIdentity);
  watchParty(() => (allComplete() ? navigate(renderGameEnded) : renderMemberSuccess(member)));
}

/* ---------- 실시간 관전 ----------
   플레이 중인 사람의 브라우저가 api/live로 게임 화면을 올리고,
   관전자는 그걸 그대로 받아서 그린다. 같은 wifi·같은 서버면 다른 폰에서도 보인다. */

/* 관전 루프는 타이머가 아니라 "받으면 바로 다시 묻는" 고리다.
   서버가 새 화면이 올 때까지 답을 붙잡고 있어서(롱폴링), 이 고리는 대부분
   기다리는 상태로 있다가 화면이 올라오는 순간 깨어난다.
   화면을 떠나면 세대 번호가 올라가고, 돌던 고리는 스스로 빠져나온다. */
let watchGeneration = 0;

function stopWatch() {
  watchGeneration += 1;
}

const watchTitle = (member) =>
  raw(`${renderValue(avatar(member))}<span>${escapeHtml(member.name)}의 도전</span>`);

function renderWatch(member) {
  app.innerHTML = h`<div class="screen">
    ${baseTop('👀 실시간 관전')}
    <section class="card">
      <h2 class="center watch-name" id="watch-name" data-id="${member ? member.id : ''}">${member ? watchTitle(member) : '가족을 기다리는 중'}</h2>
      <p class="center" id="watch-game">${member ? member.game : '누군가 게임을 시작하면 여기에 바로 나와요.'}</p>
      <div class="game-zone watch-zone" id="watch-zone">
        <div class="watch-idle" id="watch-idle">🎈<br>연결 중…</div>
      </div>
      <div class="scoreline hidden" id="watch-score-row">
        <span class="chip" id="watch-score"></span>
        <span class="chip chip--pink lives" id="watch-lives"></span>
      </div>
      <div class="btn-row hidden" id="watch-switch">
        <button class="btn btn--chip" id="watch-prev" type="button">◀ 이전 가족</button>
        <button class="btn btn--chip" id="watch-next" type="button">다음 가족 ▶</button>
      </div>
      <p class="center watch-hint hidden" id="watch-hint"></p>
      <button class="btn btn--primary btn--block" id="heart">❤️ 하트 보내기</button>
    </section>
  </div>`;

  bindTop();
  const zone = document.querySelector('#watch-zone');
  const nameNode = document.querySelector('#watch-name');
  const gameNode = document.querySelector('#watch-game');
  const scoreRow = document.querySelector('#watch-score-row');
  const scoreNode = document.querySelector('#watch-score');
  const livesNode = document.querySelector('#watch-lives');
  const hintNode = document.querySelector('#watch-hint');
  const switchRow = document.querySelector('#watch-switch');

  // 지금 게임 중인 사람들의 최신 화면. 여러 명이면 눌러서 돌려 본다.
  let roster = [];
  let watchId = member ? member.id : null;
  // 보던 사람이 사라진 시각. 게임을 다시 시작하면 중계가 잠깐 끊기는데,
  // 그때마다 다른 사람 화면으로 홱 넘어가면 누구를 보고 있었는지 놓친다.
  let missingSince = 0;
  const GRACE = 2500;

  const idle = (text) => {
    zone.className = 'game-zone watch-zone';
    zone.style.removeProperty('aspect-ratio');
    zone.innerHTML = `<div class="watch-idle">🎈<br>${escapeHtml(text)}</div>`;
    // 점수·하트 칸은 볼 게 없을 때 숨긴다. 남겨두면 눌러야 하는 버튼처럼 보인다.
    scoreRow.classList.add('hidden');
    hintNode.classList.add('hidden');
    switchRow.classList.add('hidden');
    livesNode.innerHTML = '';
  };

  const draw = () => {
    const live = roster.find((frame) => frame.memberId === watchId) || roster[0];
    if (!live) return;
    watchId = live.memberId;
    const source = members.find((m) => m.id === live.memberId);
    // 중계는 초당 10장 가까이 온다. 얼굴을 매번 다시 만들면 깜빡이니 사람이 바뀔 때만 그린다.
    if (nameNode.dataset.id !== live.memberId) {
      nameNode.dataset.id = live.memberId;
      nameNode.innerHTML = source ? renderValue(watchTitle(source)) : h`${live.name}의 도전`;
    }
    gameNode.textContent = live.game || '';
    zone.className = `${live.zoneClass || 'game-zone'} watch-zone`;
    // 게임 화면은 보내는 사람의 판 크기(px)를 그대로 박아 만든 마크업이다.
    // 관전 화면 판은 그보다 작아서, 그냥 붙이면 오른쪽과 아래가 잘린다.
    // 원래 크기로 만든 뒤 통째로 축소해서 화면 그대로 보이게 한다.
    const stageW = Number(live.w) || 0;
    const stageH = Number(live.h) || 0;
    if (stageW > 0 && stageH > 0) {
      // 판의 비율까지 맞춰야 위아래에 빈 띠가 안 생긴다
      // 비율만 박는다. 높이 하한은 CSS(.watch-zone)에 맡긴다 —
      // 넓고 낮은 판을 받았을 때 비율대로 두면 폰에서 납작해진다.
      zone.style.aspectRatio = `${stageW} / ${stageH}`;
      zone.innerHTML = `<div class="watch-stage" style="width:${stageW}px;height:${stageH}px"></div>`;
      const stage = zone.firstElementChild;
      stage.innerHTML = live.html;
      const ratio = Math.min(zone.clientWidth / stageW, zone.clientHeight / stageH);
      const left = (zone.clientWidth - stageW * ratio) / 2;
      const top = (zone.clientHeight - stageH * ratio) / 2;
      stage.style.transform = `translate(${left}px, ${top}px) scale(${ratio})`;
    } else {
      zone.style.removeProperty('aspect-ratio');
      zone.innerHTML = live.html;
    }
    scoreNode.textContent = `성공 ${Math.min(live.hits, live.goal)} / ${live.goal}`;
    livesNode.innerHTML = livesMarkup(Math.max(Math.min(Number(live.lives), 3), 0));
    scoreRow.classList.remove('hidden');
    // 게임 중인 사람이 둘 이상이면 버튼으로 골라 본다(화면을 눌러도 넘어간다)
    if (roster.length > 1) {
      const at = roster.findIndex((frame) => frame.memberId === watchId) + 1;
      hintNode.textContent = `👆 화면을 눌러도 다음 가족 (${at} / ${roster.length})`;
      hintNode.classList.remove('hidden');
      switchRow.classList.remove('hidden');
    } else {
      hintNode.classList.add('hidden');
      switchRow.classList.add('hidden');
    }
  };

  // 가족 목록 순서로 세워둔다. 서버가 준 순서 그대로 쓰면 누가 잠깐 쉬었다 돌아올 때마다
  // 차례가 바뀌어서, 눌러도 아까 그 사람으로 안 돌아온다.
  const order = (frame) => {
    const at = members.findIndex((m) => m.id === frame.memberId);
    return at < 0 ? members.length : at;
  };

  const apply = (state) => {
    // 주인공은 게임을 하지 않는다. 남아 있는 옛 화면이 있어도 관전 목록에는 넣지 않는다.
    roster = ((state && state.frames) || [])
      .filter((frame) => frame && frame.html && frame.memberId && frame.memberId !== config.hostId)
      .sort((a, b) => order(a) - order(b));
    if (!roster.length) {
      const who = members.find((m) => m.id === watchId);
      idle(who ? `${who.name}님이 잠시 쉬는 중이에요` : '아직 게임 중인 가족이 없어요');
      return;
    }
    if (watchId && !roster.some((frame) => frame.memberId === watchId)) {
      if (!missingSince) missingSince = Date.now();
      if (Date.now() - missingSince < GRACE) return; // 마지막 화면을 잠깐 그대로 둔다
      watchId = null; // 안 돌아오면 놓아주고 지금 하는 사람으로 넘어간다
    }
    missingSince = 0;
    draw();
  };

  const follow = async (mine) => {
    let rev = -1;
    while (mine === watchGeneration) {
      let state = null;
      try {
        const response = await apiFetch(api(`live?rev=${rev}`));
        state = await response.json();
      } catch {
        if (mine !== watchGeneration) return;
        roster = [];
        idle('연결이 끊겼어요');
        await new Promise((done) => setTimeout(done, 800));
        continue;
      }
      if (mine !== watchGeneration) return;
      rev = Number.isFinite(Number(state.rev)) ? Number(state.rev) : -1;
      apply(state);
    }
  };

  const step = (delta) => {
    if (roster.length < 2) return;
    const at = roster.findIndex((frame) => frame.memberId === watchId);
    const next = roster[(at + delta + roster.length) % roster.length].memberId;
    if (next === watchId) return;
    watchId = next;
    missingSince = 0;
    draw();
  };

  zone.addEventListener('pointerdown', () => step(1));
  document.querySelector('#watch-prev').onclick = () => step(-1);
  document.querySelector('#watch-next').onclick = () => step(1);

  stopWatch();
  follow(watchGeneration);

  document.querySelector('#heart').onclick = (event) =>
    sendHeart(event.currentTarget, members.find((m) => m.id === watchId) || member || null);
}

function sendHeart(button, player) {
  const target = document.querySelector('#watch-zone');
  flyTo(button, target, '💗');
  pulse(target, 'squash');
  state.cheers += 1;
  save();
  // memberId를 같이 보내야 그 사람 게임 화면에 하트가 뜬다(중계 응답에 실려 간다).
  // 이 호출이 빠져 있어서 하트가 보내는 사람 화면에서만 날아가고 상대 폰에는 안 떴다.
  pushParty('cheer', { memberId: player?.id || null });
  // 알림 문구 대신 하트가 좌우에서 떠오른다. 보내는 쪽도 받는 쪽도 같은 모습이다.
  sfx('heart');
  cheerHearts(8);
}

/* ---------- 주인공 라운지 (파티 진행 중) ---------- */

function renderMom() {
  const host = hostMember();
  const live = members.find((member) => member.id === state.active);
  const collected = collectedIngredientIds().size;
  const total = cakeIngredients().length;

  app.innerHTML = h`<div class="screen">
    ${baseTop(`👑 ${host.name} 모드`)}
    <section class="card card--lav">
      <div class="host-hero">🎂</div>
      <h2 class="center">${host.name}님의 관전 라운지</h2>
      <p class="center">가족들이 케이크 재료를 모으고 있어요!</p>
      ${progressBar()}
      <div class="banner">
        <span>🧺 모인 재료 ${collected} / ${total}</span>
        <span>${live ? `🔴 ${live.name} 게임 중` : '⏳ 지금은 대기 중'}</span>
      </div>
      <div class="btn-row">
        <button class="btn btn--ghost" id="watch">👀 구경하기</button>
        <button class="btn btn--primary" id="make-cake">🥣 케이크 만들기</button>
      </div>
    </section>
  </div>`;

  bindTop();
  document.querySelector('#watch').onclick = () =>
    state.active
      ? navigate(renderWatch, members.find((member) => member.id === state.active))
      : toast('지금은 아무도 게임 중이 아니에요!');
  document.querySelector('#make-cake').onclick = () => navigate(renderCakeGame);
  watchParty(() => (allComplete() ? navigate(renderFinale) : renderMom()));
}

/* ---------- 피날레 허브 (전원 완료 · 주인공만) ---------- */

function renderFinale() {
  const host = hostMember();
  const done = state.cake.finishedAt > 0;

  app.innerHTML = h`<div class="screen">
    ${baseTop('🎉 마지막 순서')}
    <section class="card final-card">
      ${art('🎂')}
      <h2>가족들이 재료를 다 모았어요!</h2>
      <p>${host.name}님, 이제 케이크를 완성할 차례예요.</p>
      ${progressBar()}
      <button class="btn btn--primary btn--block btn--big" id="make-cake">
        ${done ? '🎂 완성한 케이크 보기' : '🥣 케이크 만들러 가기'}
      </button>
      ${
        // 케이크를 만들기 전에는 편지를 먼저 보여주지 않는다. 편지는 케이크를 완성해야
        // 선물처럼 열리는 것이고, 여기서 미리 읽어버리면 그 순간이 없어진다.
        // 완성한 뒤 이 화면으로 돌아오면 그때부터 언제든 다시 읽을 수 있다.
        done
          ? raw('<button class="btn btn--ghost btn--block" id="read-letters">💌 가족들의 편지 읽기</button>')
          : ''
      }
    </section>
  </div>`;

  bindTop();
  document.querySelector('#make-cake').onclick = () => navigate(renderCakeGame);
  document.querySelector('#read-letters')?.addEventListener('click', () => navigate(renderHostLetters));
  watchParty(() => renderFinale());
}

/* ---------- 게임 종료 (주인공 외 가족) ---------- */

function renderGameEnded() {
  app.innerHTML = h`<div class="screen">
    ${baseTop('🎉 게임 종료')}
    <section class="card final-card">
      ${art('🎉')}
      <h2>게임이 종료되었어요</h2>
      <p>모든 미션이 완료되었습니다.<br>생일 주인공이 케이크를 만들고 있어요!</p>
      <button class="btn btn--ghost btn--block" id="end-home">처음 화면</button>
    </section>
  </div>`;
  bindTop();
  document.querySelector('#end-home').onclick = () => navigate(renderLobby);
}

/* ---------- 편지 쓰기 ---------- */

function renderLetterComposer(author) {
  const host = hostMember();
  const isElder = author.elder;
  const letter = (state.letters || {})[author.id] || {};

  app.innerHTML = h`<div class="screen ${isElder ? 'elder' : ''}">
    ${baseTop(`💌 ${host.name}님께 편지`)}
    <section class="card letter-tab">
      <h2 class="center">${host.name}님께 편지를 써요</h2>
      <p class="center">${
        isElder ? '아래 종이에 손가락으로 마음을 그려주세요.' : '주인공에게 전할 마음을 글로 남겨주세요.'
      }</p>
      ${
        isElder
          ? raw(h`<div class="drawing-tools">
                    <span>🖍️ 손가락으로 그리기</span>
                    <button class="btn btn--chip" id="clear-drawing" type="button">그림 지우기</button>
                  </div>
                  <canvas id="letter-canvas" width="720" height="420" aria-label="편지 그림판"></canvas>`)
          : raw(
              h`<textarea id="letter-text" maxlength="1200" placeholder="${host.name}님, 생일 축하해요!">${
                letter.text || ''
              }</textarea>`
            )
      }
      <button class="btn btn--primary btn--block" id="save-letter">💌 편지 저장하기</button>
      <p class="letter-private">모든 게임이 끝난 뒤 주인공인 ${host.name}님만 이 편지를 볼 수 있어요.</p>
    </section>
  </div>`;

  bindTop();
  const text = document.querySelector('#letter-text');
  const canvas = document.querySelector('#letter-canvas');

  const persist = () => {
    state.letters = {
      ...(state.letters || {}),
      [author.id]: {
        text: isElder ? '' : text.value,
        drawing: isElder ? canvas.toDataURL('image/png') : '',
      },
    };
    save();
  };

  if (isElder) {
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 16;
    context.strokeStyle = '#111';
    if (letter.drawing) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = letter.drawing;
    }
    let drawing = false;
    const point = (event) => {
      const box = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - box.left) * canvas.width) / box.width,
        y: ((event.clientY - box.top) * canvas.height) / box.height,
      };
    };
    canvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      try { canvas.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등에서는 무시 */ }
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
    });
    canvas.addEventListener('pointerup', () => {
      if (!drawing) return;
      drawing = false;
      persist();
    });
    canvas.addEventListener('pointercancel', () => {
      drawing = false;
    });
    document.querySelector('#clear-drawing').onclick = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      persist();
    };
  } else {
    text.oninput = persist;
  }

  document.querySelector('#save-letter').onclick = () => {
    persist();
    const saved = (state.letters || {})[author.id] || {};
    pushParty('letter', { memberId: author.id, text: saved.text || '', drawing: saved.drawing || '' });
    toast('💌 편지를 안전하게 저장했어요!');
    navigate(state.completed.includes(author.id) ? renderMemberSuccess : renderIdentity, author);
  };
}

/* ---------- 주인공이 읽는 편지 ---------- */

/* ---------- 선물 상자 (케이크를 완성한 직후 한 번) ----------

   버튼 → 상자가 흔들리다 펑 열리고 → "짜잔!" 문구와 편지가 튀어나온다 → 편지를 누르면 목록.
   5초가 지나도 안 누르면 "편지를 터치해주세요!"를 작게 띄운다. 주인공이 어르신이면
   무엇을 눌러야 할지 모른 채 그냥 보고만 있을 수 있다.                                   */

function renderGiftBox() {
  const host = hostMember();

  app.innerHTML = h`<div class="screen">
    ${baseTop('🎁 선물 도착')}
    <div class="gift-card">
      <div class="gift-stage">
        <img class="gift-box" id="gift-box" src="public/game/gift-box.png" alt="선물 상자"
          onerror="this.replaceWith(document.createTextNode('🎁'))">
        <button class="gift-letter hidden" id="gift-letter" aria-label="가족들의 편지 열어보기">💌</button>
      </div>
      <h2 class="gift-tada hidden" id="gift-tada">
        <span>짜잔!</span>
        <span>가족들의 편지가</span>
        <span>도착했어요!</span>
      </h2>
      <p class="gift-hint hidden" id="gift-hint">편지를 터치해주세요!</p>
    </div>
  </div>`;

  bindTop();
  const box = document.querySelector('#gift-box');
  const letter = document.querySelector('#gift-letter');
  const tada = document.querySelector('#gift-tada');
  const hint = document.querySelector('#gift-hint');

  const open = () => navigate(renderHostLetters);
  letter.addEventListener('click', open);

  if (reduceMotion()) {
    // 모션을 끈 사람에게는 흔들고 터뜨리는 연출 없이 결과만 보여준다
    box?.classList.add('gone');
    letter.classList.remove('hidden');
    tada.classList.remove('hidden');
    return;
  }

  box?.classList.add('shaking');
  screenAfter(900, () => {
    box?.classList.remove('shaking');
    // 뚜껑이 열린 그림으로 갈아끼운 뒤 터뜨린다
    if (box && box.tagName === 'IMG') box.src = 'public/game/gift-box-open.png';
    box?.classList.add('popping');
    if (box) burstFrom(box, { count: 30, emoji: ['🎊', '✨', '💗', '🎉'], spread: 200, lift: 150 });
    letter.classList.remove('hidden');
    letter.classList.add('arrive');
    tada.classList.remove('hidden');

    // 편지가 나온 뒤 5초. 그때까지 안 누르면 눌러야 한다는 걸 알려준다.
    screenAfter(5000, () => {
      if (document.contains(hint)) hint.classList.remove('hidden');
    });
  });
}

function renderHostLetters() {
  const host = hostMember();
  if (!allComplete() || state.viewer !== config.hostId) return renderGameEnded();
  const letters = state.letters || {};

  app.innerHTML = h`<div class="screen">
    ${baseTop(`💌 ${host.name}님께 온 편지`)}
    <section class="card letter-tab">
      <h2 class="center">가족들이 보낸 편지</h2>
      <p class="center">모든 미션이 끝나서 이제 ${host.name}님만 볼 수 있어요.</p>
      <div class="letter-list">
        ${playerMembers().map((member, index) => {
          const letter = letters[member.id] || {};
          return raw(h`<article class="received-letter" style="--i:${index}">
            <h3>${member.emoji} ${member.name}</h3>
            <p>${raw(escapeHtml(letter.text || '아직 작성한 편지가 없어요.').replace(/\n/g, '<br>'))}</p>
            ${letter.drawing ? raw(`<img src="${letter.drawing}" alt="${escapeHtml(member.name)}님의 그림 편지">`) : ''}
            <button class="btn btn--chip" type="button" data-save-letter="${member.id}">📥 이 편지 저장</button>
          </article>`);
        })}
      </div>
      <button class="btn btn--ghost btn--block" id="back-finale">🎂 케이크로 돌아가기</button>
    </section>
  </div>`;

  bindTop();
  document.querySelector('#back-finale').onclick = () => navigate(renderFinale);

  // 편지는 한 장씩 따로 저장한다. 카드마다 버튼이 하나씩 있다.
  app.querySelectorAll('[data-save-letter]').forEach((button) => {
    button.onclick = async () => {
      const member = members.find((each) => each.id === button.dataset.saveLetter);
      if (!member) return;
      button.disabled = true;
      try {
        const blob = await letterToBlob(host, { member, letter: letters[member.id] || {} });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${member.name}님의 편지.png`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`📥 ${member.name}님의 편지를 저장했어요!`);
      } catch {
        toast('이미지를 만들지 못했어요. 다시 눌러주세요.');
      } finally {
        button.disabled = false;
      }
    };
  });
}

/* 편지 한 장을 그림으로 만든다(주인공이 두고두고 볼 수 있게).
   화면 그대로를 찍는 게 아니라 캔버스에 다시 그린다 — 폰마다 화면이 잘리거나 스크롤돼 있어서
   화면 캡처로는 편지가 다 안 담긴다. 글줄은 폭에 맞춰 직접 접는다. */
async function letterToBlob(host, entry) {
  const W = 1000;
  const PAD = 48;
  const INNER = W - PAD * 4;
  const TITLE = 54;
  const NAME = 40;
  const BODY = 32;
  const LINE = 48;

  try {
    await document.fonts.ready;
  } catch { /* 글꼴을 못 기다려도 기본 글꼴로 그린다 */ }

  const drawings = await Promise.all(
    [entry].map(({ letter }) =>
      letter.drawing
        ? new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = letter.drawing;
          })
        : Promise.resolve(null)
    )
  );

  const measure = document.createElement('canvas').getContext('2d');
  const bodyFont = `${BODY}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const titleFont = `${TITLE}px Jua, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const nameFont = `${NAME}px Jua, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

  // 글줄 접기: 띄어쓰기가 없는 한국어 문장도 있으니 글자 단위로도 자른다
  const wrap = (text) => {
    measure.font = bodyFont;
    const lines = [];
    String(text || '')
      .split(String.fromCharCode(10))
      .forEach((paragraph) => {
        let line = '';
        [...paragraph].forEach((char) => {
          const next = line + char;
          if (measure.measureText(next).width > INNER && line) {
            lines.push(line);
            line = char;
          } else {
            line = next;
          }
        });
        lines.push(line);
      });
    return lines;
  };

  const blocks = [entry].map(({ member, letter }, index) => {
    const lines = wrap(letter.text || '아직 작성한 편지가 없어요.');
    const image = drawings[index];
    const imageH = image ? Math.round((INNER * image.naturalHeight) / image.naturalWidth) : 0;
    const height = PAD + NAME + 24 + lines.length * LINE + (image ? imageH + 24 : 0) + PAD;
    return { member, lines, image, imageH, height };
  });

  const headH = PAD + TITLE + 24 + BODY + PAD;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = headH + blocks.reduce((sum, block) => sum + block.height + 24, 0) + PAD;
  const c = canvas.getContext('2d');

  c.fillStyle = '#fff5f8';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.textBaseline = 'top';
  c.fillStyle = '#2b1a4d';
  c.font = titleFont;
  c.textAlign = 'center';
  c.fillText(`${host.name}님께 온 편지`, W / 2, PAD);
  c.font = bodyFont;
  c.fillText(new Date().toLocaleDateString('ko-KR'), W / 2, PAD + TITLE + 24);
  c.textAlign = 'left';

  let y = headH;
  blocks.forEach((block) => {
    c.fillStyle = '#fffaf0';
    c.strokeStyle = '#2b1a4d';
    c.lineWidth = 5;
    c.beginPath();
    if (c.roundRect) c.roundRect(PAD, y, W - PAD * 2, block.height, 28);
    else c.rect(PAD, y, W - PAD * 2, block.height);
    c.fill();
    c.stroke();

    c.fillStyle = '#2b1a4d';
    c.font = nameFont;
    c.fillText(`${block.member.emoji} ${block.member.name}`, PAD * 2, y + PAD);
    c.font = bodyFont;
    block.lines.forEach((line, index) => {
      c.fillText(line, PAD * 2, y + PAD + NAME + 24 + index * LINE);
    });
    if (block.image) {
      const imageY = y + PAD + NAME + 24 + block.lines.length * LINE + 24;
      c.drawImage(block.image, PAD * 2, imageY, INNER, block.imageH);
    }
    y += block.height + 24;
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
