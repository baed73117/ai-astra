/* 프로젝트 노바 효과음 — WebAudio 코드 합성 (음원 파일 없음)
   사용법: <script src="sfx_nova.js"></script> 뒤에
     - 첫 터치(또는 클릭) 때 NovaSFX.unlock() 한 번 호출 (폰에서 소리 잠금 해제)
     - NovaSFX.play('slash') 처럼 이름으로 재생
   이름: slash crit jt hit die gold train levelup skill1~4 bossWarn clear summon rare equip enhOk enhFail potion reward button revive (2026-10-10 대표가 고른 소리)
   상한: 동시에 8개까지, 같은 소리는 50ms 안에 한 번만 재생 (연타해도 소리가 뭉치지 않음) */
(function (global) {
  'use strict';

  var ACTIVE_MAX = 8;   // 동시에 울리는 효과음 상한
  var DEDUP_MS = 50;    // 같은 소리 최소 간격 (ms)

  var ctx = null;
  var master = null;
  var noiseBuf = null;  // 노이즈 한 벌을 만들어 두고 계속 재사용
  var active = 0;       // 지금 울리는 효과음 수
  var lastAt = {};      // 소리 이름별 마지막 재생 시각
  var enabled = true;
  var volume = 0.7;     // 설정 음량 (0~1 → 실제 마스터 음량은 ×0.7)

  // 처음 한 번만 AudioContext와 공용 노드를 만든다
  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    var comp = ctx.createDynamicsCompressor(); // 여러 소리가 겹쳐도 귀 아프지 않게 눌러 줌
    master = ctx.createGain();
    master.gain.value = volume * 0.7;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1초짜리 노이즈
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // 소리 조각 하나 (오실레이터 또는 노이즈 + 선택적 필터 + 볼륨 곡선)
  // o: { t 시작 시각, dur 길이, g 음량, f0/f1 주파수 시작/끝, wave 파형, noise 노이즈 여부, ff 필터, p 음높이 배율 }
  function shape(o) {
    var t = o.t, dur = o.dur, p = o.p || 1, src;
    if (o.noise) {
      src = ctx.createBufferSource();
      src.buffer = noiseBuf;
    } else {
      src = ctx.createOscillator();
      src.type = o.wave || 'sine';
      src.frequency.setValueAtTime(o.f0 * p, t);
      if (o.f1) src.frequency.exponentialRampToValueAtTime(o.f1 * p, t + dur);
    }
    var last = src;
    if (o.ff) {
      var f = ctx.createBiquadFilter();
      f.type = o.ff.type;
      f.Q.value = o.ff.q || 0.7;
      f.frequency.setValueAtTime(o.ff.f0 * p, t);
      if (o.ff.f1) f.frequency.exponentialRampToValueAtTime(o.ff.f1 * p, t + dur);
      src.connect(f);
      last = f;
    }
    var a = ctx.createGain();
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(o.g, t + Math.min(0.012, dur * 0.25));
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    last.connect(a);
    a.connect(master);
    if (o.noise) src.start(t, Math.random() * 0.5); else src.start(t);
    src.stop(t + dur + 0.03);
  }

  // 종소리 한 개 (맑은 기본음 + 살짝 어긋난 배음으로 오르골·종 느낌)
  function bell(t, f, dur, g, p) {
    shape({ t: t, f0: f, dur: dur, g: g, p: p });
    shape({ t: t, f0: f * 2.76, dur: dur * 0.4, g: g * 0.25, p: p });
  }

  // 노이즈 한 조각 · 파형 한 조각 · 화음 (대표가 고른 후보를 만들 때 씀)
  function nz(t, dur, g, type, f0, f1, q, p) { shape({ t: t, noise: true, dur: dur, g: g, p: p, ff: { type: type, f0: f0, f1: f1, q: q } }); }
  function tn(t, wave, f0, f1, dur, g, p, ff) { shape({ t: t, wave: wave, f0: f0, f1: f1, dur: dur, g: g, p: p, ff: ff }); }
  function chord(t, fs, dur, g, wave, p) { fs.forEach(function (f) { tn(t, wave || 'triangle', f, 0, dur, g, p); }); }

  // 소리 이름 → 합성 함수. 각 함수는 소리 길이(초)를 돌려준다.
  // 2026-10-10 대표가 sound/sfx_pick.html 에서 고른 것: 평타 A · 치명타 B · 저승타 A · 처치 B · 골드 A · 레벨 업 B · 수련 B · 기술 A · 보스 예고 B
  //   · 보스 처치 B · 소환 A · 좋은 낫 C · 강화 성공 A · 강화 실패 A · 맞음 A · 물약 A · 보상 A · 버튼 A · 부활 C
  var SOUNDS = {
    // 평타 베기 (A): 바람 가르는 노이즈 + 짧은 하강음
    slash: function (t, p) {
      shape({ t: t, noise: true, dur: 0.14, g: 0.35, p: p, ff: { type: 'bandpass', f0: 3000, f1: 600, q: 1.2 } });
      shape({ t: t, wave: 'triangle', f0: 900, f1: 300, dur: 0.12, g: 0.08, p: p });
      return 0.14;
    },
    // 치명타 (B 쾅 임팩트): 낮은 울림 + 높은 핑
    crit: function (t, p) {
      tn(t, 'sine', 95, 38, 0.28, 0.5, p); nz(t, 0.12, 0.3, 'lowpass', 2200, 300, 1, p); bell(t, 2637, 0.25, 0.12, p);
      return 0.3;
    },
    // 저승타 (A 저승 울림): 낮게 울리며 보랏빛으로 훑음
    jt: function (t, p) {
      tn(t, 'sawtooth', 80, 170, 0.4, 0.16, p, { type: 'lowpass', f0: 300, f1: 1800, q: 3 }); bell(t + 0.04, 659, 0.6, 0.18, p); tn(t, 'sine', 70, 40, 0.3, 0.4, p);
      return 0.65;
    },
    // 주인공이 맞음 (A): 둔탁하게 떨어지는 소리
    hit: function (t, p) {
      shape({ t: t, wave: 'triangle', f0: 220, f1: 70, dur: 0.09, g: 0.4, p: p });
      shape({ t: t, noise: true, dur: 0.06, g: 0.2, ff: { type: 'lowpass', f0: 900 } });
      return 0.1;
    },
    // 몬스터 처치 (B 뿅 사라짐)
    die: function (t, p) {
      tn(t, 'sine', 700, 1600, 0.09, 0.22, p); nz(t + 0.03, 0.12, 0.1, 'highpass', 3000, 0, 1, p);
      return 0.16;
    },
    // 골드 줍기 (A 방울 짤랑)
    gold: function (t, p) {
      shape({ t: t, noise: true, dur: 0.12, g: 0.05, p: p, ff: { type: 'highpass', f0: 5000 } });
      bell(t, 2093, 0.25, 0.14, p);
      bell(t + 0.08, 2637, 0.3, 0.12, p);
      return 0.4;
    },
    // 수련 버튼 (B 짧은 띵 — 꾹 눌러 반복해도 깔끔)
    train: function (t, p) {
      tn(t, 'sine', 660, 990, 0.07, 0.18, p); bell(t + 0.03, 1320, 0.2, 0.12, p);
      return 0.25;
    },
    // 레벨 업 (B 팡파레)
    levelup: function (t, p) {
      [523, 659, 784].forEach(function (f, i) { tn(t + i * 0.08, 'sawtooth', f, 0, 0.12, 0.09, p, { type: 'lowpass', f0: 2400 }); });
      chord(t + 0.26, [523, 659, 784, 1047], 0.6, 0.08, 'sawtooth', p); nz(t + 0.26, 0.4, 0.04, 'highpass', 6000);
      return 0.9;
    },
    // 기술 1~4 (기술 쓰기 = A: 지금 소리 그대로)
    skill1: function (t, p) {
      shape({ t: t, wave: 'sawtooth', f0: 260, f1: 1040, dur: 0.28, g: 0.1, p: p, ff: { type: 'lowpass', f0: 800, f1: 2400, q: 2 } });
      shape({ t: t, noise: true, dur: 0.2, g: 0.12, ff: { type: 'bandpass', f0: 1500, f1: 3000, q: 2 } });
      return 0.28;
    },
    skill2: function (t, p) {
      [1319, 1568, 2093].forEach(function (f, i) { bell(t + i * 0.05, f, 0.45, 0.2, p); });
      return 0.55;
    },
    skill3: function (t, p) {
      shape({ t: t, wave: 'sawtooth', f0: 110, f1: 165, dur: 0.45, g: 0.13, p: p, ff: { type: 'lowpass', f0: 300, f1: 900, q: 1 } });
      shape({ t: t, wave: 'sawtooth', f0: 111, f1: 166, dur: 0.45, g: 0.08, p: p, ff: { type: 'lowpass', f0: 300, f1: 900, q: 1 } });
      return 0.45;
    },
    skill4: function (t, p) {
      shape({ t: t, wave: 'sine', f0: 520, f1: 1040, dur: 0.5, g: 0.14, p: p });
      shape({ t: t, noise: true, dur: 0.5, g: 0.06, ff: { type: 'bandpass', f0: 2000, q: 3 } });
      return 0.5;
    },
    // 보스 공격 예고 (B 경고음 삐-뽀 세 번)
    bossWarn: function (t, p) {
      for (var i = 0; i < 3; i++) tn(t + i * 0.2, 'square', i % 2 ? 440 : 587, 0, 0.16, 0.08, p, { type: 'lowpass', f0: 2000 });
      return 0.6;
    },
    // 보스 처치 · 챕터 클리어 (B 승리 팡파레)
    clear: function (t, p) {
      [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]].forEach(function (a) { tn(t + a[1], 'sawtooth', a[0], 0, 0.14, 0.09, p, { type: 'lowpass', f0: 2600 }); });
      chord(t + 0.5, [523, 659, 784, 1047], 0.9, 0.08, 'sawtooth', p); bell(t + 0.5, 2093, 0.9, 0.08, p);
      return 1.4;
    },
    // 낫 소환 (A 드럼롤 + 빛)
    summon: function (t, p) {
      for (var i = 0; i < 14; i++) nz(t + i * 0.045, 0.05, 0.08 + i * 0.012, 'lowpass', 900, 0, 1, p);
      chord(t + 0.66, [784, 988, 1175], 0.8, 0.1, 'triangle', p); bell(t + 0.66, 1568, 0.8, 0.14, p);
      return 1.46;
    },
    // 좋은 낫 획득 (C 팡 + 종)
    rare: function (t, p) {
      nz(t, 0.15, 0.3, 'lowpass', 3000, 400, 1, p); tn(t, 'sine', 150, 60, 0.18, 0.3, p); bell(t + 0.08, 1568, 0.6, 0.18, p); bell(t + 0.16, 2093, 0.6, 0.15, p);
      return 0.8;
    },
    // 장비·아이템 획득 (짧은 반짝 — 보통 낫·정수 등)
    equip: function (t, p) {
      [784, 988, 1175, 1568].forEach(function (f, i) { bell(t + i * 0.04, f, 0.35, 0.18, p); });
      return 0.55;
    },
    // 펜던트 강화 성공 (A 땅! 대장간)
    enhOk: function (t, p) {
      tn(t, 'square', 1250, 900, 0.06, 0.12, p, { type: 'bandpass', f0: 2500, q: 4 }); nz(t, 0.05, 0.2, 'highpass', 3000); bell(t + 0.06, 1568, 0.5, 0.18, p);
      return 0.6;
    },
    // 펜던트 강화 실패 (A 뿌우)
    enhFail: function (t, p) {
      tn(t, 'sawtooth', 300, 110, 0.45, 0.12, p, { type: 'lowpass', f0: 900, q: 1 });
      return 0.45;
    },
    // 물약 마시기 (A 꿀꺽꿀꺽)
    potion: function (t, p) {
      tn(t, 'sine', 300, 650, 0.08, 0.2, p); tn(t + 0.12, 'sine', 320, 700, 0.08, 0.2, p);
      return 0.22;
    },
    // 보상 받기 (A 동전 + 종)
    reward: function (t, p) {
      bell(t, 2093, 0.2, 0.12, p); bell(t + 0.06, 2637, 0.25, 0.1, p); chord(t + 0.14, [784, 988, 1175], 0.5, 0.07, 'triangle', p);
      return 0.65;
    },
    // 버튼 (A 짧은 톡)
    button: function (t, p) {
      shape({ t: t, wave: 'sine', f0: 880, f1: 660, dur: 0.03, g: 0.15, p: p });
      shape({ t: t, noise: true, dur: 0.02, g: 0.05, ff: { type: 'highpass', f0: 3000 } });
      return 0.04;
    },
    // 부활 (C 종 세 번)
    revive: function (t, p) {
      [1047, 1319, 1568].forEach(function (f, i) { bell(t + i * 0.15, f, 0.5, 0.16, p); });
      return 0.8;
    }
  };

  // 첫 터치 때 호출: 소리 장치를 만들고 재생 가능 상태로 한다
  function unlock() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // 효과음 재생. opt.pitch 로 음높이를 살짝 바꿀 수 있다 (예: 0.97~1.03 랜덤)
  function play(name, opt) {
    if (!enabled) return false;
    var fn = SOUNDS[name];
    if (!fn) return false;
    var now = global.performance ? global.performance.now() : Date.now();
    if (lastAt[name] !== undefined && now - lastAt[name] < DEDUP_MS) return false; // 연타 방지
    if (active >= ACTIVE_MAX) return false;                                        // 동시 상한
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    lastAt[name] = now;
    var p = (opt && opt.pitch) || 1;
    var dur = fn(ctx.currentTime + 0.01, p);
    active++;
    setTimeout(function () { active--; }, dur * 1000 + 60);
    return true;
  }

  global.NovaSFX = {
    unlock: unlock,
    play: play,
    setEnabled: function (on) { enabled = !!on; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = volume * 0.7;
    },
    activeCount: function () { return active; },
    names: Object.keys(SOUNDS)
  };
})(typeof window !== 'undefined' ? window : this);
