/* ============================================================
   face.js — 얼굴 꾸미기
   1) 파츠 PNG를 겹쳐 얼굴을 그리는 헬퍼 (core.js의 avatar가 쓴다)
   2) 픽크루처럼 부위 탭 → 색 → 조절 → 아이템을 고르는 꾸미기 화면

   파츠 PNG는 모두 같은 크기 캔버스에 한 부위씩 그려져 있어서, 겹치기만 하면 얼굴이 된다.
   부위 목록·겹치는 순서·그림이 차지하는 영역은 서버가 알려준다(GET api/faces).
   얼굴 하나 = { parts, color, adjust, flip }
     parts  : { 부위: 파일 } — 여러 개 고르는 부위는 { 부위: [파일…] }
     color  : { 키: '#rrggbb' }            키 = 부위, 여러 개 부위는 '부위/파일'
     adjust : { 키: { x, y, sx, sy, gap } } x·y·gap은 캔버스 기준 %
     flip   : 앞머리 좌우 반전 (반전 가능한 파일일 때만 먹는다)
   ============================================================ */

let faceKit = null;

const FACE_LABELS = { 얼굴장식1: '볼 장식', 얼굴장식2: '피어싱' };
/* 폰 기본 색상표(<input type=color>)는 안드로이드가 빨강·파랑 같은 원색 여덟 개만 띄운다.
   피부색·머리색을 거기서 고를 수 없어 자주 쓰는 색을 직접 깔아둔다.
   맨 끝 색상표 버튼은 그대로 둬서 목록에 없는 색을 정확히 집을 수도 있게 한다. */
const SKIN = [
  ['#fce3d2', '아주 밝은 피부'], ['#f6d5bd', '밝은 피부'], ['#e8b894', '피부'],
  ['#d79a72', '가무잡잡'], ['#c07a50', '어두운 피부'], ['#9c5f3c', '아주 어두운 피부'],
];
const HAIR = [
  ['#1b1b1b', '검정'], ['#3a2a22', '흑갈색'], ['#6b4a34', '갈색'], ['#a9713f', '밝은 갈색'],
  ['#d9a15b', '금발'], ['#8d8d8d', '회색'], ['#f2e4d4', '흰 머리'], ['#b5556a', '와인'],
  ['#2f7bd4', '파랑'], ['#8a5ad6', '보라'], ['#3fae52', '초록'], ['#e8456f', '분홍'],
];
const LIP = [
  ['#e8456f', '분홍'], ['#d9365a', '빨강'], ['#b5556a', '와인'],
  ['#f08a9b', '연분홍'], ['#c0705a', '살구'], ['#8a4b52', '진한 자주'],
];
const BLUSH = [
  ['#ffb3c1', '연분홍'], ['#ff8fa3', '분홍'], ['#e8456f', '진분홍'],
  ['#f7a072', '살구'], ['#d98cb0', '보랏빛'], ['#c98d64', '갈색'],
];
/* 피어싱·안경테 — 금속색과 또렷한 색 */
const DECO = [
  ['#2b2b2b', '검정'], ['#6b6b6b', '회색'], ['#cfd3d6', '은색'], ['#c9a227', '금색'],
  ['#6b4a34', '갈색 뿔테'], ['#ffffff', '흰색'],
  ['#e23b3b', '빨강'], ['#f0a02a', '주황'], ['#3fae52', '초록'],
  ['#2f7bd4', '파랑'], ['#8a5ad6', '보라'], ['#e8456f', '분홍'],
];
/* 부위별로 쓸 색. 여기 없는 부위는 DECO 를 쓴다. */
const FACE_SWATCHES = {
  얼굴: SKIN, 코: SKIN,
  뒷머리: HAIR, 앞머리: HAIR, 눈썹: HAIR,
  입: LIP,
  얼굴장식1: BLUSH,
  얼굴장식2: DECO,
};


const FACE_TAB_ORDER = ['얼굴', '뒷머리', '앞머리', '눈썹', '눈', '코', '입', '주름', '점', '얼굴장식1', '얼굴장식2'];
const FACE_ADJUST_DEFAULT = { x: 0, y: 0, sx: 1, sy: 1, gap: 0 };

/* file:// 로 열면 실패한다. 그때는 모두 이모지로 보인다. */
async function loadFaceKit() {
  try {
    // 파츠 목록은 미리 뽑아둔 파일이다 (tools/face-kit.cjs)
    const response = await fetch('public/face/kit.json', { cache: 'no-cache' });
    if (response.ok) faceKit = await response.json();
  } catch {
    faceKit = null;
  }
}

const faceLayer = (id) => faceKit?.layers.find((layer) => layer.id === id);
const faceItem = (layer, file) => layer?.items.find((item) => item.file === file);
// 여러 개 고르는 부위의 한 칸 = '파일' 또는 '파일#꼬리표'(같은 파츠를 또 넣은 것, 예: 점 두 개)
const faceFile = (entry) => entry.split('#')[0];
const faceKey = (layer, entry) => (layer.multi ? `${layer.id}/${entry}` : layer.id);
const facePicked = (face, layer) => [].concat(face.parts?.[layer.id] || []);
const faceLabel = (layer) => FACE_LABELS[layer.id] || layer.id;
// 절대 주소여야 한다. CSS 변수 속 상대 url()은 페이지가 아니라 css/ 폴더 기준으로 풀려서 404가 난다.
const faceSrc = (layer, item) =>
  `${new URL(encodeURI(`public/face/${layer.id}/${item.file}`), location.href).href}?v=${item.v}`;

function facePartMarkup(face, layer, entry) {
  const file = faceFile(entry);
  const item = faceItem(layer, file);
  if (!item) return '';
  const key = faceKey(layer, entry);
  const color = face.color?.[key];
  const a = { ...FACE_ADJUST_DEFAULT, ...(face.adjust?.[key] || {}) };
  // 고른 색은 인라인에 숫자(r g b)로만 싣는다 — 인라인 style은 숫자만(CODEX 규칙 5)
  const rgb = /^#[0-9a-f]{6}$/i.test(color || '') ? [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16)) : null;
  const colorAttr = rgb ? ' data-face-color' : '';
  const rgbVars = rgb ? `;--r:${rgb[0]};--g:${rgb[1]};--b:${rgb[2]}` : '';
  const flip = face.flip && faceKit.flip.includes(file) ? ' face-part--flip' : '';
  const src = faceSrc(layer, item);
  const one = (cls, x, box) =>
    `<i class="face-part${cls}${flip}"${colorAttr} style="--src:url('${src}');--x:${x};--y:${a.y};--sx:${a.sx};--sy:${a.sy};--ox:${(box[0] + box[2]) / 2};--oy:${(box[1] + box[3]) / 2}${rgbVars}"></i>`;
  // 양쪽에 하나씩 있는 파츠(눈·눈썹·볼…)는 반으로 갈라 그린다.
  // 그래야 크기를 키워도 제자리에서 커지고, 간격을 벌릴 수 있다.
  if (item.pair) return one(' face-part--left', a.x - a.gap, item.left) + one(' face-part--right', a.x + a.gap, item.right);
  return one('', a.x, item.box);
}

function faceMarkup(face) {
  const parts = faceKit.layers.map((layer) =>
    facePicked(face, layer)
      .map((file) => facePartMarkup(face, layer, file))
      .join('')
  );
  return `<span class="face">${parts.join('')}</span>`;
}

/* 아이템 칸에는 그 파츠만, 그림이 차지하는 영역에 맞춰 확대해서 보여준다 */
function faceThumb(face, layer, entry) {
  const item = faceItem(layer, faceFile(entry));
  if (!item) return '';
  const [l, t, r, b] = item.box;
  const zoom = 100 / (Math.max(r - l, b - t, 12) * 1.2);
  const solo = { parts: { [layer.id]: layer.multi ? [entry] : entry }, color: face.color, flip: face.flip };
  return `<span class="face face--thumb" style="--zoom:${zoom};--cx:${(l + r) / 2};--cy:${(t + b) / 2}">${facePartMarkup(solo, layer, entry)}</span>`;
}

/* 꾸민 얼굴을 PNG로 뽑는다. 화면은 CSS(색 마스크·반쪽 자르기·이동·확대·반전)로 겹쳐 그리므로,
   이미지로 만들 때는 캔버스에서 같은 계산을 그대로 다시 한다 — facePartMarkup과 짝을 맞춰 고칠 것.
   배경은 흰색. 투명으로 두면 폰 사진첩에서 검정 배경으로 보여 검은 머리가 묻힌다. */
async function faceToBlob(face) {
  const parts = faceKit.layers.flatMap((layer) =>
    facePicked(face, layer)
      .map((entry) => ({ layer, entry, item: faceItem(layer, faceFile(entry)) }))
      .filter((part) => part.item)
  );
  const images = await Promise.all(
    parts.map(
      ({ layer, item }) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = faceSrc(layer, item);
        })
    )
  );
  const W = images[0]?.naturalWidth || 646;
  const H = images[0]?.naturalHeight || 637;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  c.fillStyle = 'white';
  c.fillRect(0, 0, W, H);

  parts.forEach(({ layer, entry, item }, index) => {
    const key = faceKey(layer, entry);
    const a = { ...FACE_ADJUST_DEFAULT, ...(face.adjust?.[key] || {}) };
    const color = face.color?.[key];
    let source = images[index];
    if (/^#[0-9a-f]{6}$/i.test(color || '')) {
      // CSS의 mask + 배경색과 같은 결과: 그림 모양 안쪽만 고른 색으로 칠한다
      const tint = document.createElement('canvas');
      tint.width = W;
      tint.height = H;
      const t = tint.getContext('2d');
      t.drawImage(source, 0, 0, W, H);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = color;
      t.fillRect(0, 0, W, H);
      source = tint;
    }
    const flip = face.flip && faceKit.flip.includes(item.file);
    const draw = (x, box, half) => {
      const ox = ((box[0] + box[2]) / 200) * W;
      const oy = ((box[1] + box[3]) / 200) * H;
      c.save();
      c.translate((x / 100) * W + ox, (a.y / 100) * H + oy);
      if (flip) c.scale(-1, 1);
      else c.scale(a.sx, a.sy);
      c.translate(-ox, -oy);
      if (half) {
        c.beginPath();
        c.rect(half === 'left' ? 0 : W / 2, 0, W / 2, H);
        c.clip();
      }
      c.drawImage(source, 0, 0, W, H);
      c.restore();
    };
    if (item.pair) {
      draw(a.x - a.gap, item.left, 'left');
      draw(a.x + a.gap, item.right, 'right');
    } else {
      draw(a.x, item.box, null);
    }
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/* 얼굴을 아직 안 꾸민 사람에게 자동으로 붙는 얼굴.
   같은 파티의 같은 사람은 어느 폰에서 봐도 같은 얼굴이 나와야 해서, 초대 코드와 id로 씨앗을 만든다.
   (무작위로 그때그때 뽑으면 폰마다 다른 얼굴이 보인다.)
   가족을 추가하면 그 사람도 새 씨앗으로 얼굴 하나를 받는다. */
function faceSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFaceFor(id) {
  if (!faceKit) return null;
  const parts = {};
  faceKit.layers.forEach((layer) => {
    if (layer.multi) {
      parts[layer.id] = [];
      return;
    }
    const seed = faceSeed(`${partyCode}:${id}:${layer.id}`);
    parts[layer.id] = layer.items[seed % layer.items.length].file;
  });
  return { parts, color: {}, adjust: {}, flip: false };
}

// 꾸며서 저장한 얼굴이 있으면 그것, 없으면 자동으로 받은 얼굴
const faceOf = (member) => config.faces?.[member.id] || randomFaceFor(member.id);

function blankFace() {
  const parts = {};
  for (const layer of faceKit.layers) parts[layer.id] = layer.multi ? [] : layer.items[0].file;
  return { parts, color: {}, adjust: {}, flip: false };
}

/* ---------- 꾸미기 화면 ---------- */

function renderFaceMaker(member) {
  if (!faceKit) {
    toast('얼굴 파츠를 불러오지 못했어요. 서버 주소로 열어주세요.');
    renderEditor();
    return;
  }

  // 저장한 얼굴이 없으면 지금 화면에 보이는 자동 얼굴에서 이어서 꾸민다
  const saved = config.faces?.[member.id] || randomFaceFor(member.id);
  const face = saved ? JSON.parse(JSON.stringify(saved)) : blankFace();
  face.parts = face.parts || {};
  face.color = face.color || {};
  face.adjust = face.adjust || {};
  const tabs = FACE_TAB_ORDER.map(faceLayer).filter(Boolean);
  let tab = tabs[0];
  // 여러 개 고르는 부위는 마지막으로 고른 것(또는 눌러서 고른 것)의 색·조절을 바꾼다
  const focus = {};

  app.innerHTML = h`<div class="screen face-maker">
    ${baseTop(`😊 ${member.name} 얼굴 꾸미기`)}
    <section class="face-stage">
      <div class="face-preview" id="face-preview"></div>
      <nav class="face-tabs" id="face-tabs" aria-label="부위 고르기"></nav>
    </section>
    <section class="card face-panel">
      <small class="hidden" id="face-hint">점은 중복으로 사용 가능해요!</small>
      <div class="face-items" id="face-items"></div>
      <div class="face-tools" id="face-tools"></div>
    </section>
    <div class="face-actions-row">
      <button class="btn btn--chip" id="face-random" type="button">🎲 랜덤</button>
      <button class="btn btn--chip" id="face-reset" type="button">↺ 처음으로</button>
      <button class="btn btn--chip btn--lemon" id="face-download" type="button">📥 이미지 저장</button>
    </div>
    <div class="btn-row">
      <button class="btn btn--ghost" id="face-cancel" type="button">취소</button>
      <button class="btn btn--primary" id="face-save" type="button">💾 완료</button>
    </div>
  </div>`;

  bindTop();
  const previewNode = document.querySelector('#face-preview');
  const tabsNode = document.querySelector('#face-tabs');
  const toolsNode = document.querySelector('#face-tools');
  const itemsNode = document.querySelector('#face-items');

  const target = () => {
    const picked = facePicked(face, tab);
    const entry = tab.multi ? (picked.includes(focus[tab.id]) ? focus[tab.id] : picked[picked.length - 1]) : picked[0];
    return entry ? { entry, file: faceFile(entry), key: faceKey(tab, entry), item: faceItem(tab, faceFile(entry)) } : null;
  };

  const drawPreview = () => {
    previewNode.innerHTML = faceMarkup(face);
  };

  const drawTabs = () => {
    tabsNode.innerHTML = tabs
      .map((layer) => {
        const first = facePicked(face, layer)[0];
        return `<button class="face-tab ${layer === tab ? 'is-on' : ''}" type="button" data-tab="${escapeHtml(layer.id)}">
          <span class="face-thumb">${first ? faceThumb(face, layer, first) : ''}</span>
          <b>${escapeHtml(faceLabel(layer))}</b>
        </button>`;
      })
      .join('');
  };

  const drawTools = () => {
    const now = target();
    const blocks = [];
    const picked = facePicked(face, tab);
    if (tab.multi && picked.length) {
      blocks.push(`<div class="face-focus"><small>바꿀 것을 고르세요</small>${picked
        .map(
          (entry) => `<span class="face-focus-cell">
            <button class="face-item ${now?.entry === entry ? 'is-on' : ''}" type="button" data-focus="${escapeHtml(entry)}">${faceThumb(face, tab, entry)}</button>
            <button class="face-remove" type="button" data-remove-part="${escapeHtml(entry)}" aria-label="빼기">×</button>
          </span>`
        )
        .join('')}</div>`);
    }
    if (tab.color && now) {
      const current = face.color[now.key];
      // 원래 색일 때 색상표가 열리는 첫 색. 파츠가 대부분 검정이라 검정에서 시작하면 밝히기 불편하다.
      const swatches = (FACE_SWATCHES[tab.id] || DECO).map(
        ([hex, name]) => `<button class="face-swatch ${current?.toLowerCase() === hex ? 'is-on' : ''}" type="button"
          data-face-color="${hex}" style="--swatch:${hex}" title="${name}" aria-label="${name}"></button>`
      ).join('');
      blocks.push(`<div class="face-swatches">${swatches}</div>
      <div class="face-color">
        <label class="face-slider">🎨 색상표<input type="color" data-color-pick value="${current || '#8a5a3c'}"></label>
        <button class="btn btn--chip ${current ? '' : 'btn--lemon'}" type="button" data-face-color="none">원래 색으로</button>
      </div>`);
    }
    if (now && faceKit.flip.includes(now.file)) {
      blocks.push(`<button class="btn btn--chip ${face.flip ? 'btn--lemon' : ''}" type="button" data-flip>↔ 좌우 반전 ${face.flip ? '켜짐' : '꺼짐'}</button>`);
    }
    if (tab.adjust && now) {
      const a = { ...FACE_ADJUST_DEFAULT, ...(face.adjust[now.key] || {}) };
      const slider = (name, label, min, max, step) =>
        `<label class="face-slider">${label}<input type="range" data-adjust="${name}" min="${min}" max="${max}" step="${step}" value="${a[name]}"></label>`;
      blocks.push(`<div class="face-sliders">
        ${slider('sx', '↔ 가로로 늘리기', 0.5, 2, 0.05)}
        ${slider('sy', '↕ 세로로 늘리기', 0.5, 2, 0.05)}
        ${slider('x', '← 좌우 위치 →', -20, 20, 0.5)}
        ${slider('y', '↑ 위아래 위치 ↓', -20, 20, 0.5)}
        ${now.item.pair ? slider('gap', '↔ 좌우 간격', -15, 15, 0.5) : ''}
        <button class="btn btn--chip" type="button" data-adjust-reset>조절 되돌리기</button>
      </div>`);
    }
    toolsNode.innerHTML = blocks.join('');
    toolsNode.classList.toggle('hidden', !blocks.length);
  };

  const drawItems = () => {
    document.querySelector('#face-hint').classList.toggle('hidden', !tab.repeat);
    const picked = facePicked(face, tab);
    const none =
      !tab.multi && tab.id !== '얼굴'
        ? `<button class="face-item ${picked.length ? '' : 'is-on'}" type="button" data-file=""><b>없음</b></button>`
        : '';
    itemsNode.innerHTML =
      none +
      tab.items
        .map(
          (item) =>
            `<button class="face-item ${picked.some((entry) => faceFile(entry) === item.file) ? 'is-on' : ''}" type="button" data-file="${escapeHtml(item.file)}" aria-label="${escapeHtml(item.file.replace(/\.png$/, ''))}">${faceThumb(face, tab, item.file)}</button>`
        )
        .join('');
  };

  const drawAll = () => {
    drawPreview();
    drawTabs();
    drawTools();
    drawItems();
  };

  const pick = (file) => {
    if (tab.repeat) {
      // 누를 때마다 하나 더. 같은 자리에 겹치면 안 보이니 조금씩 비껴 놓는다.
      const picked = facePicked(face, tab);
      const same = picked.filter((entry) => faceFile(entry) === file).length;
      const entry = same ? `${file}#${Date.now().toString(36)}` : file;
      face.parts[tab.id] = [...picked, entry];
      if (same) face.adjust[faceKey(tab, entry)] = { ...FACE_ADJUST_DEFAULT, x: Math.min(same * 4, 20), y: Math.min(same * 2, 20) };
      focus[tab.id] = entry;
    } else if (tab.multi) {
      const picked = facePicked(face, tab);
      face.parts[tab.id] = picked.includes(file) ? picked.filter((each) => each !== file) : [...picked, file];
      if (!picked.includes(file)) focus[tab.id] = file;
    } else if (file) {
      face.parts[tab.id] = file;
    } else {
      delete face.parts[tab.id];
    }
    drawAll();
  };

  app.querySelector('.face-maker').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if (data.tab) {
      tab = faceLayer(data.tab);
      drawTabs();
      drawTools();
      drawItems();
    } else if (data.file !== undefined) {
      pick(data.file);
    } else if (data.removePart) {
      const key = faceKey(tab, data.removePart);
      face.parts[tab.id] = facePicked(face, tab).filter((entry) => entry !== data.removePart);
      delete face.color[key];
      delete face.adjust[key];
      drawAll();
    } else if (data.focus) {
      focus[tab.id] = data.focus;
      drawTools();
    } else if (data.faceColor !== undefined) {
      if (data.faceColor === 'none') delete face.color[target().key];
      else face.color[target().key] = data.faceColor;
      drawAll();
    } else if (data.flip !== undefined) {
      face.flip = !face.flip;
      drawAll();
    } else if (data.adjustReset !== undefined) {
      delete face.adjust[target().key];
      drawPreview();
      drawTools();
    }
  });

  // 슬라이더를 끄는 동안 조절 칸을 다시 그리면 손가락이 놓친다. 미리보기만 다시 그린다.
  // 색상표도 마찬가지 — 고르는 동안(input)은 미리보기만, 다 고르면(change) 칸 그림까지.
  toolsNode.addEventListener('input', (event) => {
    if (event.target.dataset.colorPick !== undefined) {
      face.color[target().key] = event.target.value;
      drawPreview();
      return;
    }
    const name = event.target.dataset.adjust;
    if (!name) return;
    const now = target();
    face.adjust[now.key] = { ...FACE_ADJUST_DEFAULT, ...(face.adjust[now.key] || {}), [name]: Number(event.target.value) };
    drawPreview();
  });

  toolsNode.addEventListener('change', (event) => {
    if (event.target.dataset.colorPick === undefined) return;
    face.color[target().key] = event.target.value;
    drawAll();
  });

  // 부위 탭·아이템 줄은 옆으로 넘긴다. 폰은 손가락으로 밀면 되고, PC는 마우스 휠로 넘기게 해준다.
  [tabsNode, itemsNode].forEach((row) => {
    row.addEventListener(
      'wheel',
      (event) => {
        if (!event.deltaY || row.scrollWidth <= row.clientWidth) return;
        event.preventDefault();
        row.scrollLeft += event.deltaY;
      },
      { passive: false }
    );
  });

  document.querySelector('#face-random').onclick = () => {
    for (const layer of faceKit.layers) {
      if (layer.multi) continue;
      face.parts[layer.id] = layer.items[Math.floor(Math.random() * layer.items.length)].file;
    }
    drawAll();
  };

  document.querySelector('#face-reset').onclick = () => {
    Object.assign(face, blankFace());
    drawAll();
  };

  document.querySelector('#face-download').onclick = async () => {
    try {
      const blob = await faceToBlob(face);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${member.name} 얼굴.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('📥 얼굴 이미지를 저장했어요!');
    } catch {
      toast('이미지를 만들지 못했어요. 다시 눌러주세요.');
    }
  };

  document.querySelector('#back').onclick = () => navigate(renderEditor);
  document.querySelector('#face-cancel').onclick = () => navigate(renderEditor);

  document.querySelector('#face-save').onclick = async () => {
    try {
      const response = await apiFetch(api(`face/${member.id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      applyConfig(result.config);
      toast('😊 얼굴을 저장했어요!');
      navigate(renderEditor);
    } catch (error) {
      toast(error.message || '얼굴을 저장하지 못했어요.');
    }
  };

  drawAll();
}
