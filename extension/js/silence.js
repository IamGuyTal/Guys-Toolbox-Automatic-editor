// Silence detection: finds silent ranges in a 16-bit PCM WAV and turns them into cut ranges.
// Pure functions (no Premiere), so they can be tested on their own.

var Silence = (function () {
  var FRAME = 0.01; // analysis window, seconds

  // Reads a PCM WAV buffer and returns per-frame loudness in dBFS.
  function loudness(buf) {
    var pos = 12, fmt = null, data = null;
    while (pos + 8 <= buf.length) {
      var id = buf.toString('ascii', pos, pos + 4);
      var size = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
      if (id === 'data') { data = { start: pos + 8, size: Math.min(size, buf.length - pos - 8) }; break; }
      pos += 8 + size + (size % 2);
    }
    if (!fmt || !data || fmt.bits !== 16) throw new Error('קובץ האודיו לא בפורמט הצפוי');

    var step = fmt.channels * 2;
    var perFrame = Math.round(fmt.rate * FRAME);
    var total = Math.floor(data.size / step);
    var frames = [];
    for (var f = 0; f * perFrame < total; f++) {
      var sum = 0, n = 0;
      for (var s = f * perFrame; s < Math.min(total, (f + 1) * perFrame); s++) {
        var v = buf.readInt16LE(data.start + s * step) / 32768; // first channel is enough for speech
        sum += v * v;
        n++;
      }
      frames.push(n ? 10 * Math.log10(sum / n + 1e-10) : -100);
    }
    return { db: frames, duration: total / fmt.rate };
  }

  function percentile(sorted, p) {
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }

  // Threshold between the recording's noise floor and its speech level.
  function autoThreshold(db) {
    var sorted = db.slice().sort(function (a, b) { return a - b; });
    var noise = percentile(sorted, 0.1);
    var speech = percentile(sorted, 0.95);
    return Math.max(-60, Math.min(-20, noise + (speech - noise) * 0.3));
  }

  // opts: { threshold (dB or null for auto), minSilence, padBefore, padAfter }
  // Returns cut ranges [{start, end}] in seconds.
  function detect(level, opts) {
    var thr = opts.threshold == null ? autoThreshold(level.db) : opts.threshold;
    var cuts = [];
    var runStart = null;
    for (var i = 0; i <= level.db.length; i++) {
      var silent = i < level.db.length && level.db[i] < thr;
      if (silent && runStart === null) runStart = i;
      if (!silent && runStart !== null) {
        var s = runStart * FRAME, e = Math.min(i * FRAME, level.duration);
        if (e - s >= opts.minSilence) {
          // Keep a little air after speech ends and before it starts again (none at the file edges).
          var cs = runStart === 0 ? 0 : s + opts.padAfter;
          var ce = i >= level.db.length ? level.duration : e - opts.padBefore;
          if (ce - cs >= 0.1) cuts.push({ start: cs, end: ce });
        }
        runStart = null;
      }
    }
    return { cuts: cuts, threshold: thr };
  }

  // Removes any part of a cut that overlaps the start of a transcribed word, so a quietly
  // spoken word is never cut. Only word onsets are reliable: Whisper's word "end" runs on
  // to the next word, and the tail of a word is already kept by padAfter.
  function protectWords(cuts, words, minPiece) {
    var BEFORE = 0.1, ONSET = 0.3;
    var out = [];
    cuts.forEach(function (cut) {
      var pieces = [{ start: cut.start, end: cut.end }];
      words.forEach(function (w) {
        var ws = w.start - BEFORE, we = Math.min(w.start + ONSET, w.end);
        var next = [];
        pieces.forEach(function (p) {
          if (we <= p.start || ws >= p.end) return next.push(p);
          if (ws > p.start) next.push({ start: p.start, end: ws });
          if (we < p.end) next.push({ start: we, end: p.end });
        });
        pieces = next;
      });
      pieces.forEach(function (p) { if (p.end - p.start >= minPiece) out.push(p); });
    });
    return out;
  }

  function totalDuration(cuts) {
    return cuts.reduce(function (sum, c) { return sum + (c.end - c.start); }, 0);
  }

  return { loudness: loudness, autoThreshold: autoThreshold, detect: detect, protectWords: protectWords, totalDuration: totalDuration };
})();
