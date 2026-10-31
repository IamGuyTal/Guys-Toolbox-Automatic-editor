// Podcast multicam engine: who speaks when (one mic per speaker) → camera shots.
// Pure functions over per-frame loudness (Silence.loudness), testable without Premiere.

var Podcast = (function () {
  var FRAME = 0.01;
  var BOTH = -2, NOBODY = -1;

  function percentile(arr, p) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  }

  // Per frame: index of the speaker talking, BOTH, or NOBODY.
  // Each mic is scaled between its own noise floor and speech level, so a quiet mic
  // and a loud one compare fairly and bleed from the neighbour's voice stays low.
  function activity(levels) {
    var scaled = levels.map(function (db) {
      var noise = percentile(db, 0.15), speech = percentile(db, 0.97);
      var range = Math.max(6, speech - noise);
      return db.map(function (v) { return (v - noise) / range; });
    });
    var frames = Math.min.apply(null, scaled.map(function (s) { return s.length; }));
    var smoothed = scaled.map(function (s) { return smooth(s, frames, 15); });
    var out = new Array(frames);
    for (var f = 0; f < frames; f++) {
      var best = -1, bestV = 0, second = 0;
      for (var k = 0; k < smoothed.length; k++) {
        var v = smoothed[k][f];
        if (v > bestV) { second = bestV; bestV = v; best = k; }
        else if (v > second) second = v;
      }
      if (bestV < 0.4) out[f] = NOBODY;
      else if (second > 0.5 && second > bestV * 0.8) out[f] = BOTH;
      else out[f] = best;
    }
    return out;
  }

  // Moving average over +-half frames.
  function smooth(arr, n, half) {
    var out = new Array(n), sum = 0, count = 0;
    for (var i = 0; i < Math.min(n, half); i++) { sum += arr[i]; count++; }
    for (var f = 0; f < n; f++) {
      if (f + half < n) { sum += arr[f + half]; count++; }
      if (f - half - 1 >= 0) { sum -= arr[f - half - 1]; count--; }
      out[f] = sum / count;
    }
    return out;
  }

  // Run-length encodes activity into segments [{who, start, end}] in seconds.
  function segments(act) {
    var segs = [];
    for (var f = 0; f < act.length; f++) {
      var last = segs[segs.length - 1];
      if (last && last.who === act[f]) last.end = (f + 1) * FRAME;
      else segs.push({ who: act[f], start: f * FRAME, end: (f + 1) * FRAME });
    }
    return segs;
  }

  // Joins segments into speaking turns: the same speaker across short pauses is one turn.
  // Returns [{who, start, end}] with only speech (a speaker index or BOTH).
  function turnsOf(segs, maxPause) {
    var turns = [];
    segs.forEach(function (s) {
      if (s.who === NOBODY) return;
      var last = turns[turns.length - 1];
      if (last && last.who === s.who && s.start - last.end <= maxPause) last.end = s.end;
      else turns.push({ who: s.who, start: s.start, end: s.end });
    });
    return turns;
  }

  var TURN_PAUSE = 0.7; // a pause shorter than this doesn't end a speaker's turn

  // opts: { cameras: [videoTrackIndex per speaker or null], wide: videoTrackIndex or null,
  //         minShot, minTurn, wideOnOverlap, varietyEvery (0 = off), varietyLength }
  // Returns shots [{start, end, camera, who}] covering 0..duration.
  function planShots(act, duration, opts) {
    var segs = segments(act);
    var hasWide = opts.wide != null;

    // 1. Decide who the shot is "on" for each meaningful turn.
    var turns = [];
    turnsOf(segs, TURN_PAUSE).forEach(function (s) {
      var len = s.end - s.start;
      var target = null;
      if (s.who >= 0 && len >= opts.minTurn && opts.cameras[s.who] != null) target = s.who;
      if (s.who === BOTH && hasWide && opts.wideOnOverlap && len >= opts.minTurn) target = 'wide';
      // Pauses, short interjections and unmapped speakers keep the current shot.
      if (target === null) return;
      var last = turns[turns.length - 1];
      if (last && last.who === target) last.end = s.end;
      else turns.push({ who: target, start: s.start, end: s.end });
    });
    if (!turns.length) return [];

    // 2. Each turn's shot runs until the next turn starts; the first starts at 0.
    var shots = turns.map(function (t, i) {
      return { who: t.who, start: i === 0 ? 0 : t.start, end: i + 1 < turns.length ? turns[i + 1].start : duration };
    });

    // 3. Enforce the minimum shot length by merging short shots into the previous one.
    var merged = [];
    shots.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && (s.end - s.start < opts.minShot || last.who === s.who)) last.end = s.end;
      else merged.push(s);
    });
    if (merged.length > 1 && merged[0].end - merged[0].start < opts.minShot) {
      merged[1].start = 0;
      merged.shift();
    }

    // 4. Break long single-speaker shots with a wide shot, placed at a pause when possible.
    var out = [];
    merged.forEach(function (s) {
      if (!hasWide || !opts.varietyEvery || s.who === 'wide' || s.end - s.start < opts.varietyEvery + opts.varietyLength + opts.minShot) {
        return out.push(s);
      }
      var cursor = s.start;
      while (s.end - cursor >= opts.varietyEvery + opts.varietyLength + opts.minShot) {
        var room = opts.varietyLength + opts.minShot; // the wide shot plus a real shot after it
        var at = pauseNear(segs, cursor + opts.varietyEvery, 3);
        if (at === null || at + room > s.end) at = cursor + opts.varietyEvery;
        if (at + room > s.end) break;
        out.push({ who: s.who, start: cursor, end: at });
        out.push({ who: 'wide', start: at, end: at + opts.varietyLength });
        cursor = at + opts.varietyLength;
      }
      out.push({ who: s.who, start: cursor, end: s.end });
    });

    return out.map(function (s) {
      return { start: s.start, end: s.end, who: s.who, camera: s.who === 'wide' ? opts.wide : opts.cameras[s.who] };
    });
  }

  // Start of the first pause (>= 0.3s of nobody) within `window` seconds after `t`.
  function pauseNear(segs, t, window) {
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.who === NOBODY && s.end - s.start >= 0.3 && s.start >= t && s.start <= t + window) return s.start + 0.1;
    }
    return null;
  }

  function stats(shots, speakers) {
    var time = {};
    shots.forEach(function (s) { time[s.who] = (time[s.who] || 0) + (s.end - s.start); });
    return { switches: Math.max(0, shots.length - 1), time: time };
  }

  return { BOTH: BOTH, NOBODY: NOBODY, activity: activity, segments: segments, planShots: planShots, stats: stats };
})();
