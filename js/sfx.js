/* ============================================================
   sfx.js — 효과음

   파일을 받아 오지 않고 그 자리에서 소리를 만든다(WebAudio).
   짧은 소리 열 몇 개 때문에 mp3를 열 몇 개 넣으면 첫 로딩만 무거워지고
   출처·저작권도 따로 챙겨야 한다. 만들어 쓰면 파일이 0개다.

   소리 탭의 효과음 크기(core.js의 sound.sfx, 0~1)를 따른다. 0이면 아예 안 낸다.
   ============================================================ */

let sfxCtx = null;

// 오디오 장치는 사용자가 화면을 한 번 건드린 뒤에야 열린다.
// 그전에 만들면 'suspended' 상태로 태어나서 아무 소리도 안 난다.
const sfxReady = () => {
  if (!sound.sfx) return null;
  try {
    if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (sfxCtx.state === 'suspended') sfxCtx.resume();
    return sfxCtx.state === 'running' ? sfxCtx : null;
  } catch {
    return null;   // 오디오를 못 여는 기기라도 게임은 그대로 돌아야 한다
  }
};

/* 소리 하나. from→to 로 미끄러지는 짧은 음.
   gain 봉투를 0에서 올렸다 내리지 않으면 시작과 끝에서 "딱" 하는 잡음이 난다. */
function tone({ from, to = from, dur = 0.12, type = 'sine', gain = 0.2, at = 0 }) {
  const ac = sfxReady();
  if (!ac) return;
  gain *= sound.sfx;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/* 쉬익 소리. 크림 짜기·바람처럼 음정이 없는 소리는 잡음을 걸러서 만든다. */
function noise({ dur = 0.25, gain = 0.12, freq = 1200, q = 0.7 }) {
  const ac = sfxReady();
  if (!ac) return;
  gain *= sound.sfx;
  const t0 = ac.currentTime;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = q;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(band).connect(amp).connect(ac.destination);
  src.start(t0);
}

/* 누르고 있는 동안 계속 나는 소리(오븐 굽는 소리). 멈추는 함수를 돌려준다.
   멈추기를 빠뜨려도 max초 뒤엔 저절로 꺼진다 — 화면을 떠나도 끝없이 울리지 않게. */
function noiseLoop({ gain = 0.07, freq = 4200, q = 0.5, max = 8 }) {
  const ac = sfxReady();
  if (!ac) return () => {};
  gain *= sound.sfx;
  const t0 = ac.currentTime;
  const frames = ac.sampleRate;
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  // 지글지글: 잔잔한 쉬익 위에 가끔 톡 튀는 알갱이를 섞는다
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.004 ? 3 : 0.5);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = q;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain * 1.8, t0 + 0.05);   // "치익!" 처음엔 세게
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.45);
  src.connect(band).connect(amp).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + max);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = ac.currentTime;
    amp.gain.cancelScheduledValues(t);
    amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    try { src.stop(t + 0.2); } catch { /* 이미 멈춤 */ }
  };
}

const SFX = {
  tap: () => tone({ from: 620, to: 860, dur: 0.07, type: 'triangle', gain: 0.13 }),
  pop: () => tone({ from: 700, to: 1250, dur: 0.11, type: 'sine', gain: 0.2 }),
  miss: () => tone({ from: 380, to: 150, dur: 0.26, type: 'sawtooth', gain: 0.14 }),
  // 도-미-솔: 미션 성공
  win: () => [523, 659, 784, 1047].forEach((hz, i) =>
    tone({ from: hz, dur: 0.18, type: 'triangle', gain: 0.17, at: i * 0.09 })),
  drop: () => tone({ from: 300, to: 140, dur: 0.16, type: 'sine', gain: 0.18 }),
  whisk: () => noise({ dur: 0.14, gain: 0.07, freq: 2600, q: 0.5 }),
  // 반죽 젓는 찰박 소리. 높낮이를 조금씩 흔들어야 같은 소리 반복처럼 안 들린다
  stir: () => noise({ dur: 0.12, gain: 0.1, freq: 480 + Math.random() * 280, q: 1.4 }),
  ding: () => [880, 1320].forEach((hz, i) =>
    tone({ from: hz, dur: 0.5, type: 'sine', gain: 0.14, at: i * 0.06 })),
  spray: () => noise({ dur: 0.2, gain: 0.08, freq: 3200, q: 0.9 }),
  sparkle: () => [1046, 1568].forEach((hz, i) =>
    tone({ from: hz, to: hz * 1.5, dur: 0.12, type: 'sine', gain: 0.12, at: i * 0.05 })),
  light: () => tone({ from: 520, to: 1040, dur: 0.22, type: 'triangle', gain: 0.16 }),
  blow: () => noise({ dur: 0.5, gain: 0.13, freq: 700, q: 0.4 }),
  heart: () => tone({ from: 880, to: 1320, dur: 0.16, type: 'sine', gain: 0.14 }),
};

function sfx(name) {
  const play = SFX[name];
  if (play) play();
}

const SFX_LOOPS = {
  sizzle: () => noiseLoop({ gain: 0.07, freq: 4200, q: 0.5 }),
};

// 계속 나는 소리를 켜고, 끄는 함수를 돌려준다
function sfxLoop(name) {
  const start = SFX_LOOPS[name];
  return start ? start() : () => {};
}

/* 버튼 소리는 화면마다 붙이지 않는다 — 화면이 새로 그려질 때마다 다시 달아야 하고
   한 군데만 빠뜨려도 그 버튼만 조용해진다. document에서 한 번만 받는다. */
document.addEventListener(
  'pointerdown',
  (event) => {
    const button = event.target.closest?.('.btn, .person-choice, .tray-candle');
    if (button && !button.disabled) sfx('tap');
  },
  true
);
