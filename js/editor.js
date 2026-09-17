/* ============================================================
   editor.js — 이벤트 편집 모드 (index.html 전용)
   ============================================================ */

const MAX_TOPPINGS = 30;

/* 토핑 줄 — 인원수와 상관없이 ＋/−로 늘리고 줄인다.
   칸마다 "다른 토핑으로 교체"를 펼치면 지금까지 있는 모든 토핑 중 하나를 고를 수 있다.
   고른 건 config.toppings에만 들고 있다가 "변경사항 저장하기"로 같이 보낸다. */
function buildToppingSlots() {
  const list = toppingList();
  const choices = allToppings();
  const sprite = (topping) =>
    `<img src="${topping.src}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHtml(topping.emoji)}'))">`;
  const slots = list.map(
    (topping, index) => `<div class="topping-slot">
      ${sprite(topping)}
      <span>${index + 1}번째 · ${escapeHtml(topping.name)}</span>
      <details class="topping-swap">
        <summary class="upload-label">다른 토핑으로 교체</summary>
        <div class="topping-choices">${choices
          .map(
            (choice) =>
              `<button type="button" class="topping-choice ${choice.ref === topping.ref ? 'is-on' : ''}" data-swap="${index}" data-ref="${choice.ref}" aria-label="${escapeHtml(choice.name)}">${sprite(choice)}</button>`
          )
          .join('')}</div>
      </details>
    </div>`
  );
  return `${slots.join('')}<div class="topping-count">
    <button class="btn btn--chip" type="button" data-topping-step="-1" ${list.length <= 1 ? 'disabled' : ''} aria-label="토핑 하나 빼기">−</button>
    <b>토핑 ${list.length}개</b>
    <button class="btn btn--chip" type="button" data-topping-step="1" ${list.length >= MAX_TOPPINGS ? 'disabled' : ''} aria-label="토핑 하나 더하기">＋</button>
  </div>`;
}

function renderEditor() {
  const activeCount = playerMembers().length;
  const customIds = new Set(config.customMembers.map((member) => member.id));

  const option = (value, label, selected) =>
    `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const rows = members
    .map((member, index) => {
      const isHost = member.id === config.hostId;
      const isCustom = customIds.has(member.id);
      const game = gameForMember(member);
      const band = config.ageBands[member.id] || 'adult';
      return `<div class="editor-row" style="--i:${index}">
        <div class="editor-row-top">
          ${renderValue(avatar(member))}
          <input data-name="${member.id}" type="text" maxlength="30" value="${escapeHtml(
        member.name
      )}" aria-label="${escapeHtml(member.originalName)} 이름">
          ${
            isHost
              ? '<span class="chip chip--lemon">👑 주인공</span>'
              : `<span class="editor-move">
                  <button class="btn btn--chip" type="button" data-move="-1" aria-label="${escapeHtml(member.name)} 위로">▲</button>
                  <button class="btn btn--chip" type="button" data-move="1" aria-label="${escapeHtml(member.name)} 아래로">▼</button>
                </span>
                <button class="btn btn--chip" data-remove="${member.id}" type="button">삭제</button>`
          }
        </div>
        <div class="editor-controls">
          <label class="setting-label">나이대
            <select data-age="${member.id}">${AGE_BANDS.map((each) =>
        option(each.id, `${each.emoji} ${each.name}`, band === each.id)
      ).join('')}</select>
          </label>
          ${
            isHost
              ? ''
              : `<label class="setting-label">게임
                  <select data-game="${member.id}">${gameCatalog
                  .map((each) => option(each.id, `${each.name} · ${each.difficulty}`, game.id === each.id))
                  .join('')}</select>
                </label>`
          }
        </div>
        ${isHost ? '<small class="editor-help">주인공은 게임 대신 케이크를 만들어요.</small>' : ''}
        <div class="editor-flags">
          ${
            isHost
              ? ''
              : `<label><input type="checkbox" data-enabled="${member.id}" ${
                  config.enabledIds.includes(member.id) ? 'checked' : ''
                }> 게임 참가</label>`
          }
          <button class="btn btn--chip" type="button" data-face="${member.id}">😊 얼굴 꾸미기</button>
          <small class="editor-help">${escapeHtml(ageBandOf(band).hint)}</small>
        </div>
      </div>`;
    })
    .join('');

  app.innerHTML = h`<div class="screen">
    ${baseTop('⚙️ 이벤트 편집 모드')}

    <section class="card card--lemon">
      <h2 class="card-head">선물 금액과 참가 인원</h2>
      <label class="setting-label">최종 선물 금액(원)
        <input id="target-amount" type="number" min="10000" step="1000" value="${targetAmount()}">
      </label>
      <p class="card-note" id="allocation"></p>
      <label class="setting-label">선물의 주인공
        <select id="host-member">${raw(
          members.map((m) => option(m.id, `${m.emoji} ${m.name}`, config.hostId === m.id)).join('')
        )}</select>
      </label>
    </section>

    <section class="card card--pink">
      <h2 class="card-head">케이크 만들기</h2>
      <label class="setting-label">완성할 케이크
        <select id="cake-type">${raw(
          cakes.map((cake) => option(cake.id, cake.name, config.cakeType === cake.id)).join('')
        )}</select>
      </label>
      <small class="editor-help">가족이 게임을 완료하면 케이크 재료를 하나씩 찾아옵니다. 재료보다 가족이 많으면 사랑·응원·별가루 같은 특별 재료가 추가돼요.</small>
      <h3>케이크에 올릴 토핑</h3>
      <small class="editor-help">케이크 만들기에서 이 토핑들을 올려요. ＋/−로 개수를 정하고, 칸마다 다른 토핑으로 바꿀 수 있어요. 완성할 케이크를 바꾸면 그 케이크의 기본 토핑으로 바로 바뀌어요.</small>
      <div class="topping-slots" id="topping-slots"></div>
    </section>

    <section class="card">
      <h2 class="card-head">가족 · 나이대 · 게임</h2>
      <small class="editor-help">나이대를 바꾸면 그 사람의 미니게임 속도·크기·목표 개수가 함께 바뀝니다.<br>가족은 자유롭게 지우고 추가할 수 있어요. 추가하면 이모지는 알아서 하나 붙습니다.</small>
      <div class="editor-list">${raw(rows)}</div>
      <button class="btn btn--ghost btn--block" id="add-person" type="button">＋ 가족 추가하기</button>
    </section>

    <button class="btn btn--primary btn--block btn--big" id="save-editor">💾 변경사항 저장하기</button>

    <section class="card card--mint">
      <h2 class="card-head">가족들에게 초대하기</h2>
      <small class="editor-help">링크를 누르면 바로 들어옵니다. 링크가 안 통하면 코드 다섯 글자만 불러주세요 — 첫 화면에서 넣으면 됩니다.</small>
      <p class="party-code" id="party-code">${partyCode}</p>
      <p class="share-link" id="share-link">주소를 찾는 중…</p>
      <button class="btn btn--lemon btn--block btn--big" id="share-family" type="button">🔗 링크 공유하기</button>
      <button class="btn btn--ghost btn--block btn--big" id="test-play" type="button">🎮 테스트 해보기</button>
      <small class="editor-help">가족이 보는 화면을 직접 해봅니다. 홈(⌂)을 누르면 편집 모드로 돌아와요.</small>
      <button class="btn btn--primary btn--block btn--big" id="make-party" type="button">${
        config.open === false ? '🎉 파티 생성하기' : '🎉 파티 다시 열기'
      }</button>
      <small class="editor-help">${
        config.open === false
          ? '파티를 만들면 그때부터 이 초대 코드로 가족이 들어올 수 있어요. 지금은 준비 중이라 못 들어와요.'
          : '지금 이 초대 코드로 가족이 들어올 수 있어요.'
      }</small>
    </section>

    <p class="editor-help">가족에게는 <b>링크 공유하기</b>로 나오는 주소나 초대 코드만 알려주세요. 그 화면에는 편집 모드가 없습니다.<br>가족 얼굴은 <b>😊 얼굴 꾸미기</b>에서 만들어요. 새 가족은 먼저 저장한 뒤 꾸며주세요.</p>
  </div>`;

  bindTop();

  // 화면에 보이는 가족 순서. ▲▼는 줄을 그 자리에서 옮기기만 해서(다시 그리지 않아서)
  // 입력하던 이름이 날아가지 않는다. 다시 그리는 동작(주인공 변경·추가·삭제) 전에 이 순서를 넘겨준다.
  const domOrder = () => [...app.querySelectorAll('.editor-row [data-name]')].map((input) => input.dataset.name);

  const updateAllocation = () => {
    const count = [...app.querySelectorAll('[data-enabled]:checked')].length;
    const amount = Number(document.querySelector('#target-amount').value) || 0;
    const node = document.querySelector('#allocation');
    node.textContent = count
      ? `현재 ${count}명 · 1명 성공 시 약 ${Math.round(amount / count).toLocaleString()}원`
      : '최소 한 명의 게임 참가자가 필요해요.';
  };

  app.querySelectorAll('[data-enabled]').forEach((box) => {
    box.onchange = updateAllocation;
  });
  document.querySelector('#target-amount').oninput = updateAllocation;
  updateAllocation();

  const toppingSlots = document.querySelector('#topping-slots');
  const drawToppings = () => {
    toppingSlots.innerHTML = buildToppingSlots();
  };
  toppingSlots.onclick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const refs = toppingList().map((topping) => topping.ref);
    const defaults = defaultToppings();
    if (button.dataset.swap !== undefined) refs[Number(button.dataset.swap)] = button.dataset.ref;
    else if (button.dataset.toppingStep === '1' && refs.length < MAX_TOPPINGS) refs.push(defaults[refs.length % defaults.length]);
    else if (button.dataset.toppingStep === '-1' && refs.length > 1) refs.pop();
    else return;
    config.toppings = refs;
    drawToppings();
  };
  // 저장을 기다리지 않고 바로 그 케이크의 기본 토핑으로 바꿔 보여준다
  document.querySelector('#cake-type').onchange = (event) => {
    config.cakeType = event.target.value;
    config.toppings = [];
    drawToppings();
  };
  drawToppings();

  app.querySelectorAll('[data-age]').forEach((select) => {
    select.onchange = () => {
      const hint = select.closest('.editor-row').querySelector('.editor-flags .editor-help');
      if (hint) hint.textContent = ageBandOf(select.value).hint;
    };
  });

  document.querySelector('#host-member').onchange = (event) => {
    const priorHost = config.hostId;
    const nextHost = event.target.value;
    const enabled = new Set(config.enabledIds);
    enabled.add(priorHost);
    enabled.delete(nextHost);
    // 새 주인공은 applyConfig가 목록 맨 아래로 보낸다
    applyConfig({ ...config, hostId: nextHost, enabledIds: [...enabled], memberOrder: domOrder() });
    renderEditor();
  };

  document.querySelector('#add-person').onclick = () => {
    const id = `guest-${Date.now()}`;
    applyConfig({
      ...config,
      customMembers: [...config.customMembers, { id, name: '새 가족', emoji: randomGuestEmoji() }],
      enabledIds: [...config.enabledIds, id],
      memberOrder: domOrder(),
    });
    renderEditor();
  };

  app.querySelectorAll('[data-remove]').forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.remove;
      const isBase = baseMembers.some((member) => member.id === id);
      applyConfig({
        ...config,
        customMembers: isBase ? config.customMembers : config.customMembers.filter((m) => m.id !== id),
        removedIds: isBase ? [...config.removedIds, id] : config.removedIds,
        enabledIds: config.enabledIds.filter((memberId) => memberId !== id),
        memberOrder: domOrder(),
      });
      renderEditor();
    };
  });

  // ▲▼ 순서 바꾸기. 주인공 줄은 버튼이 없어서 늘 맨 아래에 남는다.
  const movableRows = () => [...app.querySelectorAll('.editor-row')].filter((row) => row.querySelector('[data-move]'));
  const paintMoves = () => {
    const rows = movableRows();
    rows.forEach((row, index) => {
      row.querySelector('[data-move="-1"]').disabled = index === 0;
      row.querySelector('[data-move="1"]').disabled = index === rows.length - 1;
    });
  };
  app.querySelectorAll('[data-move]').forEach((button) => {
    button.onclick = () => {
      const row = button.closest('.editor-row');
      const rows = movableRows();
      const target = rows[rows.indexOf(row) + Number(button.dataset.move)];
      if (!target) return;
      if (button.dataset.move === '-1') target.before(row);
      else target.after(row);
      paintMoves();
      if (!button.disabled) button.focus();
    };
  });
  paintMoves();

  app.querySelectorAll('[data-face]').forEach((button) => {
    button.onclick = () => navigate(renderFaceMaker, members.find((m) => m.id === button.dataset.face));
  });

  bindShareLink();

  // 편집 모드에서 뒤로 가면 코드 넣기·새 파티 만들기 화면으로
  document.querySelector('#back').onclick = () => navigate(renderEntry);

  document.querySelector('#test-play').onclick = () => navigate(renderIdentity);

  const saveConfig = async (extra = {}) => {
    {
      const enabledIds = [...app.querySelectorAll('[data-enabled]:checked')].map((box) => box.dataset.enabled);
      if (!enabledIds.length) throw new Error('최소 한 명의 게임 참가자를 선택해주세요.');
      const names = Object.fromEntries(
        members.map((member) => [
          member.id,
          document.querySelector(`[data-name="${member.id}"]`).value.trim() || member.originalName,
        ])
      );
      const memberGames = Object.fromEntries(
        [...app.querySelectorAll('[data-game]')].map((select) => [select.dataset.game, select.value])
      );
      const ageBands = Object.fromEntries(
        [...app.querySelectorAll('[data-age]')].map((select) => [select.dataset.age, select.value])
      );
      const elderIds = Object.entries(ageBands)
        .filter(([, band]) => band === 'senior')
        .map(([id]) => id);
      const customMembers = config.customMembers.map((member) => ({
        id: member.id,
        name: names[member.id],
        emoji: member.emoji,
      }));

      const response = await apiFetch(api('config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extra,
          names,
          enabledIds,
          targetAmount: Number(document.querySelector('#target-amount').value),
          cakeType: document.querySelector('#cake-type').value,
          toppings: config.toppings,
          hostId: config.hostId,
          customMembers,
          memberGames,
          ageBands,
          elderIds,
          removedIds: config.removedIds,
          memberOrder: domOrder(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      applyConfig(result.config);
    }
  };

  document.querySelector('#save-editor').onclick = async () => {
    try {
      await saveConfig();
      toast('💾 저장했어요!');
      renderEditor();
    } catch (error) {
      toast(error.message || '저장에 실패했어요.');
    }
  };

  // 파티 생성 = 지금 설정을 저장하고 방을 연다. 그때부터 초대 코드로 가족이 들어올 수 있다.
  document.querySelector('#make-party').onclick = async () => {
    try {
      await saveConfig({ open: true });
      toast('🎉 파티방을 열었어요! 초대 코드를 가족에게 알려주세요.');
      renderEditor();
    } catch (error) {
      toast(error.message || '파티를 만들지 못했어요.');
    }
  };
}

/* ---------- 가족 링크 공유 ---------- */

/* 편집 모드는 보통 PC에서 localhost로 연다. 그 주소를 그대로 보내면
   받은 폰은 자기 자신을 가리켜 아무것도 안 열린다. 서버에게 랜 주소를 물어본다. */
async function familyUrl() {
  // view=family: 받은 사람은 편집 버튼·진행자 버튼 없는 가족 화면으로 들어간다
  const suffix = `family.html?code=${encodeURIComponent(partyCode)}&view=family`;
  const fallback = new URL(suffix, location.href).href;
  if (!/^(localhost|127\.|\[?::1)/.test(location.hostname)) return fallback;
  try {
    const { lan, port } = await (await fetch('api/where')).json();
    if (!lan || !lan.length) return fallback;
    return `http://${lan[0]}:${port}/${suffix}`;
  } catch {
    return fallback;
  }
}

/* 단톡방에 붙여넣을 초대 문구. 링크만 보내면 받는 사람이 뭔지 모르고,
   미리보기 그림이 안 뜨는 랜 주소일 때도 문구는 그대로 보인다.
   url 이 빈 문자열이면 링크는 뺀다 — navigator.share 가 url 을 따로 붙이기 때문. */
function shareText(url) {
  return [
    '🎂 엄마의 생일 대작전!',
    '가족들과 함께 재료를 모아 특별한 케이크를 완성해보세요!',
    '',
    `초대 코드: ${partyCode}`,
    url,
  ].filter((line) => line !== undefined && line !== null).join('\n').trim();
}

function bindShareLink() {
  const label = document.querySelector('#share-link');
  const button = document.querySelector('#share-family');
  if (!label || !button) return;

  let url = '';
  familyUrl().then((found) => {
    url = found;
    label.textContent = url;
  });

  /* 복사 경로가 둘인 이유: navigator.clipboard 는 https나 localhost에서만 있다.
     폰이 랜 주소(http://172...)로 열면 아예 없어서, 예전 방식으로 한 번 더 시도한다. */
  const copy = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* 아래 방법으로 넘어간다 */ }
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.append(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    box.remove();
    return ok;
  };

  button.onclick = async () => {
    if (!url) url = await familyUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: '엄마의 생일 대작전', text: shareText(''), url });
        return;
      } catch { /* 사용자가 닫았거나 못 쓰는 기기 — 복사로 넘어간다 */ }
    }
    toast(await copy(shareText(url)) ? '🔗 초대 문구와 링크를 복사했어요! 가족 단톡방에 붙여넣으세요.' : `🔗 이 주소를 알려주세요: ${url}`);
  };
}
