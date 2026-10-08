/* Procedural squeaky-toy soundtrack for the toast-stair puppy. */
(function (global) {
  'use strict';

  // --- Context and a soft, modest mix ---
  var ctx = null, musicBus, sfxBus, master, compressor, noiseBuffer;
  var muted = { music: false, sfx: false };
  var paused = false;
  var voices = { music: [], sfx: [] };
  var track = null, timer = null, nextTime = 0, beat = 0;
  var speed = 0, tempo = 132, danger = false, fever = false;
  var EPS = 0.0001;

  // Public calls and asynchronous autoplay failures are always harmless.
  function safe(fn) {
    return function () {
      try {
        var result = fn.apply(null, arguments);
        if (result && typeof result.catch === 'function') {
          return result.catch(function () {});
        }
        return result;
      } catch (_) { return undefined; }
    };
  }

  function disconnect(node) {
    try { node.disconnect(); } catch (_) {}
  }

  function ensureContext() {
    if (ctx && ctx.state !== 'closed') return ctx;
    if (ctx) {
      stopMusic();
      voices.sfx.slice().forEach(function (voice) { voice.dispose(); });
      ctx = null;
    }
    var Constructor = global.AudioContext || global.webkitAudioContext;
    if (!Constructor) return null;
    var candidate = null, nodes = [];
    try {
      candidate = new Constructor();
      var m = candidate.createGain(), s = candidate.createGain();
      nodes.push(m, s);
      var c = candidate.createDynamicsCompressor(), output = candidate.createGain();
      nodes.push(c, output);
      m.gain.value = muted.music ? 0 : 0.25;
      s.gain.value = muted.sfx ? 0 : 0.65;
      c.threshold.value = -18;
      c.knee.value = 18;
      c.ratio.value = 3;
      c.attack.value = 0.008;
      c.release.value = 0.16;
      output.gain.value = 0.55;
      m.connect(c); s.connect(c); c.connect(output);
      output.connect(candidate.destination);
      var buffer = candidate.createBuffer(1, candidate.sampleRate, candidate.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      ctx = candidate;
      musicBus = m; sfxBus = s; compressor = c; master = output;
      noiseBuffer = buffer;
      return ctx;
    } catch (_) {
      nodes.forEach(disconnect);
      if (candidate) {
        try {
          var closing = candidate.close();
          if (closing && closing.catch) closing.catch(function () {});
        } catch (_) {}
      }
      return null;
    }
  }

  function init() {
    var context = ensureContext();
    if (!context || paused) return;
    // iOS는 전화·앱 전환 뒤 'interrupted' 상태가 될 수 있어서, 'running'이 아니면 항상 다시 켠다
    if (context.state !== 'running' && context.state !== 'closed') return context.resume();
  }

  function setMuted(options) {
    if (!options) return;
    ['music', 'sfx'].forEach(function (kind) {
      if (typeof options[kind] !== 'boolean') return;
      muted[kind] = options[kind];
      if (!ctx || ctx.state === 'closed') return;
      var bus = kind === 'music' ? musicBus : sfxBus;
      var now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(muted[kind] ? 0 : (kind === 'music' ? 0.25 : 0.65), now, 0.015);
    });
  }

  function suspend() {
    paused = true;
    // Discard queued sounds so a return to the tab cannot replay an old tap.
    voices.music.slice().forEach(function (voice) { voice.dispose(); });
    voices.sfx.slice().forEach(function (voice) { voice.dispose(); });
    if (ctx && ctx.state !== 'closed') return ctx.suspend();
  }

  function resume() {
    paused = false;
    if (ctx) nextTime = ctx.currentTime + 0.025;
    return init();
  }

  // --- Finite voices: envelopes, bounded polyphony and complete cleanup ---
  function makeVoice(kind, start, duration, volume, attack) {
    var active = voices[kind], nodes = [], sources = [], disposed = false;
    var gain;
    var voice = { dispose: dispose };
    function dispose() {
      if (disposed) return;
      disposed = true;
      sources.forEach(function (source) {
        source.onended = null;
        try { source.stop(); } catch (_) {}
      });
      nodes.forEach(disconnect);
      var index = active.indexOf(voice);
      if (index >= 0) active.splice(index, 1);
    }
    voice.add = function (node, isSource) {
      nodes.push(node);
      if (isSource) sources.push(node);
      return node;
    };
    try {
      while (active.length >= (kind === 'sfx' ? 24 : 48)) active[0].dispose();
      gain = voice.add(ctx.createGain());
      gain.connect(kind === 'music' ? musicBus : sfxBus);
      gain.gain.setValueAtTime(EPS, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(EPS, volume), start + attack);
      gain.gain.exponentialRampToValueAtTime(EPS, start + duration);
      voice.output = gain;
      voice.finish = function (source) { source.onended = dispose; };
      active.push(voice);
      return voice;
    } catch (error) { dispose(); throw error; }
  }

  function tone(kind, time, hz, duration, volume, type, bends, wobble) {
    var voice = makeVoice(kind, time, duration, volume, 0.008);
    try {
      var osc = voice.add(ctx.createOscillator(), true);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(hz, time);
      (bends || []).forEach(function (point) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, point[1]), time + point[0]);
      });
      osc.connect(voice.output);
      if (wobble) {
        var lfo = voice.add(ctx.createOscillator(), true);
        var depth = voice.add(ctx.createGain());
        lfo.frequency.value = wobble[0]; depth.gain.value = wobble[1];
        lfo.connect(depth); depth.connect(osc.frequency);
        lfo.start(time); lfo.stop(time + duration);
      }
      voice.finish(osc);
      osc.start(time); osc.stop(time + duration + 0.015);
    } catch (error) { voice.dispose(); throw error; }
  }

  function puff(kind, time, duration, volume, from, to) {
    var voice = makeVoice(kind, time, duration, volume, 0.012);
    try {
      var source = voice.add(ctx.createBufferSource(), true);
      var filter = voice.add(ctx.createBiquadFilter());
      source.buffer = noiseBuffer;
      filter.type = 'bandpass'; filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(from, time);
      filter.frequency.exponentialRampToValueAtTime(to, time + duration);
      source.connect(filter); filter.connect(voice.output);
      voice.finish(source);
      source.start(time); source.stop(time + duration + 0.015);
    } catch (error) { voice.dispose(); throw error; }
  }

  function midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }
  function sfx(fn) {
    return safe(function () {
      if (muted.sfx || paused || !ensureContext() || ctx.state !== 'running') return;
      fn.apply(null, [ctx.currentTime + 0.005].concat(Array.prototype.slice.call(arguments)));
    });
  }

  function bells(time, notes, spacing, volume) {
    notes.forEach(function (note, i) {
      var t = time + i * spacing, hz = midi(note);
      tone('sfx', t, hz, 0.28, volume, 'sine');
      tone('sfx', t, hz * 2, 0.16, volume * 0.2, 'sine');
    });
  }

  // --- Puppy foley: rubber squeaks, whooshes, treats and cartoon mishaps ---
  var effects = {
    step: sfx(function (t, n) {
      var count = Number(n);
      if (!Number.isFinite(count)) count = 0;
      var pitch = 620 * Math.pow(2, (((count % 24) + 24) % 24) / 48);
      tone('sfx', t, pitch * 0.8, 0.13, 0.3, 'sine',
        [[0.025, pitch * 1.22], [0.07, pitch], [0.13, pitch * 0.75]]);
      tone('sfx', t, 180, 0.065, 0.1, 'triangle', [[0.06, 95]]);
    }),
    turn: sfx(function (t) {
      puff('sfx', t, 0.18, 0.22, 450, 2200);
      tone('sfx', t + 0.02, 420, 0.13, 0.12, 'sine', [[0.13, 950]]);
    }),
    bone: sfx(function (t) { bells(t, [88, 95], 0.075, 0.25); }),
    fall: sfx(function (t) {
      tone('sfx', t, 1400, 0.9, 0.28, 'sine',
        [[0.12, 1550], [0.55, 620], [0.9, 140]], [7, 18]);
      tone('sfx', t + 0.94, 145, 0.22, 0.32, 'sine', [[0.2, 45]]);
      puff('sfx', t + 0.94, 0.15, 0.16, 380, 90);
      tone('sfx', t + 1.04, 260, 0.09, 0.12, 'sine', [[0.08, 160]]);
    }),
    timeout: sfx(function (t) {
      tone('sfx', t, 480, 0.7, 0.25, 'triangle',
        [[0.12, 550], [0.3, 300], [0.7, 65]], [9, 24]);
      puff('sfx', t + 0.15, 0.5, 0.13, 900, 130);
    }),
    milestone: sfx(function (t) { bells(t, [72, 76, 79, 84], 0.1, 0.25); }),
    newRecord: sfx(function (t) {
      bells(t, [72, 76, 79, 84, 79, 84, 88, 91], 0.105, 0.22);
      [60, 64, 67].forEach(function (note) {
        tone('sfx', t + 0.74, midi(note), 0.48, 0.09, 'triangle');
      });
    }),
    danger: sfx(function (t) {
      tone('sfx', t, 780, 0.055, 0.17, 'sine', [[0.05, 620]]);
      tone('sfx', t + 0.11, 650, 0.055, 0.12, 'sine');
    }),
    button: sfx(function (t) {
      tone('sfx', t, 380, 0.065, 0.18, 'sine', [[0.015, 540], [0.065, 220]]);
    }),
    buy: sfx(function (t) {
      puff('sfx', t, 0.04, 0.13, 1300, 600);
      bells(t + 0.03, [84, 91, 96], 0.055, 0.23);
    }),
    revive: sfx(function (t) {
      bells(t, [72, 76, 79, 84, 88, 91, 96], 0.075, 0.2);
      tone('sfx', t, 300, 0.6, 0.1, 'sine', [[0.6, 1200]]);
    })
  };

  // --- Lookahead music: music-box title and bouncing toy-piano game loop ---
  var titleMelody = [76, 79, 84, 79, 76, 74, 72, null, 74, 77, 81, 77, 74, 72, 71, null,
    72, 76, 79, 83, 81, 79, 76, null, 74, 79, 77, 74, 72, null, 79, null];
  var gameMelody = [72, 76, 79, 76, 81, 79, 76, 74, 72, 76, 79, 84, 83, 79, 76, null,
    77, 81, 84, 81, 79, 77, 76, 72, 74, 77, 79, 83, 84, 79, 76, null];
  var chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];

  function musicNote(t, note, length, volume, type) {
    tone('music', t, midi(note), length, volume, type || 'sine');
  }

  function scheduleTick(t, index, seconds) {
    if (muted.music) return;
    var title = track === 'title', chord = chords[Math.floor(index / 16) % 4];
    if (index % 2 === 0) {
      var note = (title ? titleMelody : gameMelody)[Math.floor(index / 2) % 32];
      if (note !== null) {
        musicNote(t, note, title ? 0.38 : 0.21, 0.24);
        musicNote(t, note + 12, 0.13, 0.045);
      }
    }
    if (index % (title ? 8 : 4) === 0) {
      musicNote(t, chord[index % 8 === 0 ? 0 : 2] - 12, 0.22, 0.2, 'triangle');
    }
    if (index % 8 === 4) {
      chord.forEach(function (note, i) {
        musicNote(t + i * 0.008, note, title ? 0.32 : 0.13, 0.06, 'triangle');
      });
    }
    if (!title && index % 4 === 0) {
      tone('music', t, 110, 0.09, 0.2, 'sine', [[0.085, 55]]);
    }
    if (!title && index % 4 === 2) puff('music', t, 0.045, 0.07, 1800, 900);
    if (danger && index % 2 === 1) {
      puff('music', t, 0.035, 0.085, 3200, 1800);
      if (index % 8 === 7) musicNote(t, chord[0] + 1, 0.08, 0.07, 'triangle');
    }
    if (fever) {
      musicNote(t, chord[index % 3] + 24, Math.min(0.16, seconds * 1.2), 0.065);
    }
  }

  function scheduler() {
    if (!ctx || paused || ctx.state !== 'running' || !track) return;
    var now = ctx.currentTime;
    // Never catch up missed notes after throttling, sleep or context suspension.
    if (nextTime < now - 0.04 || nextTime > now + 0.5) {
      voices.music.slice().forEach(function (voice) { voice.dispose(); });
      nextTime = now + 0.025;
    }
    var count = 0;
    while (nextTime < now + 0.12 && count++ < 16) {
      var target = track === 'title' ? 96 : 132 + speed * 44;
      var seconds = 60 / tempo / 4;
      tempo += (target - tempo) * (1 - Math.exp(-seconds / 0.65));
      seconds = 60 / tempo / 4;
      scheduleTick(nextTime, beat, seconds);
      nextTime += seconds;
      beat = (beat + 1) % 64;
    }
  }

  function stopMusic() {
    if (timer !== null) global.clearInterval(timer);
    timer = null; track = null;
    voices.music.slice().forEach(function (voice) { voice.dispose(); });
  }

  function startMusic(name) {
    if (name !== 'title' && name !== 'game') return;
    safe(init)();
    if (!ctx || ctx.state === 'closed') return;
    if (track === name && timer !== null) return;
    stopMusic();
    track = name; beat = 0;
    tempo = name === 'title' ? 96 : 132 + speed * 44;
    nextTime = ctx.currentTime + 0.025;
    timer = global.setInterval(safe(scheduler), 25);
    safe(scheduler)();
  }

  // --- The complete classic-script API ---
  global.StairsAudio = {
    init: safe(init),
    setMuted: safe(setMuted),
    suspend: safe(suspend),
    resume: safe(resume),
    music: {
      start: safe(startMusic),
      stop: safe(stopMusic),
      setSpeed: safe(function (x) {
        var value = Number(x);
        if (Number.isFinite(value)) speed = Math.max(0, Math.min(1, value));
      }),
      setDanger: safe(function (on) { danger = Boolean(on); }),
      setFever: safe(function (on) { fever = Boolean(on); })
    },
    sfx: effects
  };
})(window);
