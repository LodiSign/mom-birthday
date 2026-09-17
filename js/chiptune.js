/* ============================================================
   chiptune.js — 게임 노래를 코드로 연주한다

   남극탐험·서커스 찰리 전용 노래는 원래 게임 음악 mp3였다. 둘 다 코나미 저작물이라
   (1983·1984년 → 2050년대까지 보호) 공개 사이트에 올릴 수 없어서 바꿨다.
   대신 작곡가가 100년 전에 죽어 누구나 쓸 수 있는 곡을 8비트 소리로 직접 연주한다.
     남극탐험   — 발트토이펠 〈스케이터 왈츠〉(1882). 원래 게임 노래도 이 곡을 편곡한 것이다
     서커스 찰리 — 푸치크 〈검투사의 입장〉(1897). 흔히 서커스 광대 음악으로 아는 그 곡

   ★ 음은 기억으로 옮겨 적은 것이라 원곡과 조금 다를 수 있다. 고칠 때는 아래 melody 만 바꾸면 된다.

   소리를 그 자리에서 계산해 WAV 로 만들고 그 주소를 돌려준다. 그래서 게임 쪽은
   예전처럼 ctx.music(주소) 로 틀고, 음악 크기·음소거·반복을 그대로 쓴다.
   파일을 받지 않으니 첫 로딩도 가볍다(예전 mp3 두 개 = 12MB).

   악보 적는 법: '음이름+옥타브/길이'. 길이는 칸 수(unit), r 은 쉼표.
   chords 는 한 마디에 하나. 반주(베이스 + 화음)는 여기서 자동으로 만든다.
   ============================================================ */

const CHIPTUNES = {
  // 3/4 박자. 한 칸 = 8분음표, 한 마디 = 6칸
  antarctic: {
    bpm: 180,
    unit: 0.5,
    bar: 6,
    style: 'waltz',
    melody: [
      // 솔~ 미파 솔~ 미파 솔 도시라솔 파~
      'G5/8 E5/2 F5/2 G5/8 E5/2 F5/2 G5/4 C6/2 B5/2 A5/2 G5/2 F5/12',
      'F5/8 D5/2 E5/2 F5/8 D5/2 E5/2 F5/4 B5/2 A5/2 G5/2 F5/2 E5/12',
      'G5/8 E5/2 F5/2 G5/8 E5/2 F5/2 G5/4 C6/2 B5/2 A5/2 G5/2 F5/12',
      'F5/8 D5/2 E5/2 F5/8 A5/2 G5/2 F5/4 E5/4 D5/4 C5/12',
    ],
    chords: [
      'C C C C C C G7 G7',
      'G7 G7 G7 G7 G7 G7 C C',
      'C C C C C C G7 G7',
      'G7 G7 F F G7 G7 C C',
    ],
  },
  // 2/4 박자. 한 칸 = 16분음표, 한 마디 = 8칸
  circus: {
    bpm: 138,
    unit: 0.25,
    bar: 8,
    style: 'march',
    melody: [
      // 반음 아래로 한 번 흔들고 3도 내려가기를 되풀이하며 떨어진다
      'G5/1 F#5/1 G5/2 E5/4 E5/1 D#5/1 E5/2 C5/4 C5/1 B4/1 C5/2 A4/4 A4/1 G#4/1 A4/2 F4/4',
      'D4/2 F4/2 A4/2 D5/2 G4/2 B4/2 D5/2 F5/2 E5/2 G5/2 C6/2 G5/2 C6/4 r/4',
      'G5/1 F#5/1 G5/2 E5/4 E5/1 D#5/1 E5/2 C5/4 C5/1 B4/1 C5/2 A4/4 A4/1 G#4/1 A4/2 F4/4',
      'D4/2 F4/2 A4/2 D5/2 G4/2 G4/2 A4/2 B4/2 C5/4 G4/4 C5/4 r/4',
    ],
    chords: [
      'C C Am F',
      'Dm G7 C C',
      'C C Am F',
      'Dm G7 C C',
    ],
  },
};

const CHORD_NOTES = {
  C: ['C3', 'E4', 'G4'],
  F: ['F2', 'A4', 'C5'],
  G7: ['G2', 'B4', 'F5'],
  Am: ['A2', 'C5', 'E5'],
  Dm: ['D3', 'F4', 'A4'],
};

const NOTE_STEPS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function noteHz(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) return 0;
  const semis = NOTE_STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

const parseLine = (line) =>
  line.trim().split(/\s+/).map((token) => {
    const [name, len = '1'] = token.split('/');
    return { hz: name === 'r' ? 0 : noteHz(name), len: Number(len) };
  });

/* 곡 → 소리(-1~1 숫자 배열). 브라우저와 미리듣기용 node 둘 다에서 돈다. */
function renderChiptune(song, rate = 22050) {
  const unitSec = (60 / song.bpm) * song.unit;
  const melody = song.melody.flatMap(parseLine);
  const chords = song.chords.join(' ').trim().split(/\s+/);
  const units = melody.reduce((sum, note) => sum + note.len, 0);
  const out = new Float32Array(Math.ceil(units * unitSec * rate));

  // 한 음 그리기. wave: 0~1 위상 → -1~1
  const voice = (hz, startUnit, lenUnit, gain, wave, legato = 0.85) => {
    if (!hz) return;
    const start = Math.floor(startUnit * unitSec * rate);
    const length = Math.floor(lenUnit * unitSec * rate * legato);
    const attack = rate * 0.004;
    const release = Math.min(rate * 0.03, length / 3);
    for (let i = 0; i < length && start + i < out.length; i += 1) {
      const env = Math.min(1, i / attack, (length - i) / release) * (1 - 0.35 * Math.min(1, i / (rate * 0.4)));
      out[start + i] += wave(((i * hz) / rate) % 1) * gain * env;
    }
  };
  const square = (p) => (p < 0.25 ? 1 : -1);          // 폭 25% — 패미컴 소리
  const triangle = (p) => 4 * Math.abs(p - 0.5) - 1;   // 부드러운 베이스

  let at = 0;
  for (const note of melody) {
    voice(note.hz, at, note.len, 0.2, square);
    at += note.len;
  }

  // 반주: 왈츠는 쿵-짝-짝, 행진곡은 쿵-짝
  const beat = song.style === 'waltz' ? 2 : 4;
  chords.forEach((chord, index) => {
    const [bass, ...upper] = (CHORD_NOTES[chord] || CHORD_NOTES.C).map(noteHz);
    const barStart = index * song.bar;
    for (let b = 0; b < song.bar; b += beat) {
      if (b === 0) voice(bass, barStart, beat, 0.32, triangle, 0.9);
      else upper.forEach((hz) => voice(hz / 2, barStart + b, beat, 0.06, square, 0.5));
    }
  });

  // 예전 mp3 들과 비슷한 크기로 맞춘다 (가장 큰 소리를 0.9 로)
  const peak = out.reduce((max, s) => Math.max(max, Math.abs(s)), 0) || 1;
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(-1, Math.min(1, (out[i] * 0.9) / peak));
  return out;
}

/* 숫자 배열 → WAV 파일 바이트 (16비트 모노) */
function chiptuneWav(samples, rate = 22050) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s * 0x7fff, true));
  return bytes;
}

/* 게임에서 쓰는 곳: ctx.music(chiptuneSrc('circus')). 곡마다 한 번만 만든다. */
const chiptuneUrls = {};
function chiptuneSrc(name) {
  if (!chiptuneUrls[name]) {
    const wav = chiptuneWav(renderChiptune(CHIPTUNES[name]));
    chiptuneUrls[name] = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  }
  return chiptuneUrls[name];
}

// 미리듣기용 (node tools/chiptune-preview.cjs). 브라우저에서는 module 이 없어 건너뛴다.
if (typeof module !== 'undefined') module.exports = { CHIPTUNES, renderChiptune, chiptuneWav };
