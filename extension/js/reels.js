// Reels engine: turns a transcribed episode into numbered units, asks the AI for reels
// built from those units, and validates the answer. Pure functions, testable on their own.

var Reels = (function () {
  var FRAME = 0.01;
  var MAX_UNIT_WORDS = 15;
  var UNIT_PAUSE = 0.6;
  var SENTENCE_END = /[.!?…]$/;

  // Groups words into short units (a sentence, or a phrase ended by a pause).
  // speakerAt(seconds) -> speaker index or -1; optional.
  function units(words, speakerAt) {
    var out = [];
    var cur = null;
    words.forEach(function (w, i) {
      var prev = words[i - 1];
      var breakHere = !cur || cur.words.length >= MAX_UNIT_WORDS ||
        (prev && SENTENCE_END.test(prev.text)) || (prev && w.start - prev.end > UNIT_PAUSE);
      if (breakHere) {
        cur = { words: [] };
        out.push(cur);
      }
      cur.words.push(w);
    });
    return out.map(function (u, id) {
      var votes = {};
      if (speakerAt) u.words.forEach(function (w) {
        var who = speakerAt((w.start + w.end) / 2);
        votes[who] = (votes[who] || 0) + (w.end - w.start);
      });
      var speaker = -1, best = 0;
      Object.keys(votes).forEach(function (k) { if (Number(k) >= 0 && votes[k] > best) { best = votes[k]; speaker = Number(k); } });
      return {
        id: id,
        start: u.words[0].start,
        end: u.words[u.words.length - 1].end,
        text: u.words.map(function (w) { return w.text; }).join(' '),
        speaker: speaker,
        // Word starts are reliable; a word's "end" from Whisper runs on to the next word.
        firstStart: u.words[0].start,
        lastStart: u.words[u.words.length - 1].start
      };
    });
  }

  // Speaker lookup from Podcast.activity frames (BOTH/NOBODY count as unknown).
  function speakerLookup(act) {
    return function (sec) {
      var f = Math.max(0, Math.min(act.length - 1, Math.round(sec / FRAME)));
      return act[f] >= 0 ? act[f] : -1;
    };
  }

  function clock(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // opts: { speakers: [names] or null, guest: index or null, focus: 'guest' | 'all' }
  function buildPrompt(us, opts) {
    var named = opts.speakers && opts.speakers.length > 1;
    var lines = us.map(function (u) {
      var who = named && u.speaker >= 0 ? opts.speakers[u.speaker] + ' ' : '';
      return u.id + ' [' + who + clock(u.start) + '] ' + u.text;
    }).join('\n');

    var focus = '';
    if (named && opts.focus === 'guest' && opts.guest != null) {
      focus = 'Focus: the reels are about ' + opts.speakers[opts.guest] + ' (the interviewee). Build them from their words. ' +
        'Use another speaker\'s line only when it is needed, e.g. a short question that sets up or hooks the answer.\n';
    } else if (named) {
      focus = 'Focus: any speaker can carry a reel.\n';
    }

    return [
      'You are a senior short-form video editor. Below is the full transcript of a long video (a podcast or talk), split into numbered units.',
      'Find the moments that can become strong stand-alone vertical reels, and say exactly which units to use and in what order.',
      '',
      'What makes a reel worth making:',
      '- A real story or a single sharp idea that creates emotion, curiosity, inspiration or value for a stranger who never saw the episode.',
      '- It stands alone: no unexplained references ("as I said before", people or things never introduced).',
      '- A clear arc: a hook, then context, then development or tension, then a payoff (a punchline, insight, twist or emotional peak). End on a strong line, never trailing off.',
      '',
      'The hook:',
      '- The first unit must stop someone scrolling within about 3 seconds: a surprising claim, an emotional peak, a provocative line or a question.',
      '- Never open with setup or scene-setting ("he was an entrepreneur who asked me at a lecture..."). Open on the most gripping line itself, often taken from later in the story (a cold open), then bring in only the context needed, as long as the reel stays coherent.',
      '',
      'Be as short as the story allows:',
      '- Use the fewest units that still deliver the full message and its emotional weight. Leave out tangents, repetitions, false starts, filler and setup the viewer does not need.',
      '- But never drop a line that a later line depends on. Read the reel as a stranger would: every line must make sense from what came before it in the reel. When unsure, keep the line.',
      '- There is no target length: a reel is as long as its story needs and not one second more.',
      '',
      'Cuts must feel natural to the ear:',
      '- Prefer a few longer continuous stretches over many small pieces. Skip material only when it removes at least a few seconds of real tangent or repetition.',
      '- Avoid pieces shorter than about 2 seconds unless that exact line is essential.',
      '- Start each piece at the beginning of a sentence or thought and end it at the end of one, so no cut sounds clipped.',
      '',
      'Honesty:',
      '- Never combine or reorder lines in a way that changes what the speaker meant, or makes them say something they did not.',
      '',
      focus +
      'How many:',
      '- Return every moment that clears the bar, and nothing that does not. Zero reels is a valid answer. Do not pad the list with weak ones.',
      '- Each reel must be a different story or idea; do not return near-duplicates.',
      '',
      'Output, for each reel:',
      '- title: a short working title, in the language of the transcript.',
      '- hook: the opening line as it will be heard.',
      '- why: one sentence on why it works.',
      '- score: 1-10, judged strictly (10 = would very likely go viral).',
      '- segments: the units to play, in play order, as ranges {from, to} of consecutive unit numbers (inclusive).',
      '',
      'Transcript:',
      lines
    ].join('\n');
  }

  // JSON schema in the common subset both Gemini and Claude accept (lowercase types).
  var SCHEMA = {
    type: 'object',
    properties: {
      reels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            hook: { type: 'string' },
            why: { type: 'string' },
            score: { type: 'integer' },
            segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'integer' }, to: { type: 'integer' } },
                required: ['from', 'to'],
                additionalProperties: false
              }
            }
          },
          required: ['title', 'hook', 'why', 'score', 'segments'],
          additionalProperties: false
        }
      }
    },
    required: ['reels'],
    additionalProperties: false
  };

  // Keeps only valid reels; resolves unit ranges to time segments and text.
  function resolve(result, us) {
    var reels = [];
    (result.reels || []).forEach(function (r) {
      var segs = [];
      (r.segments || []).forEach(function (s) {
        var from = Math.max(0, Math.min(s.from, s.to)), to = Math.min(us.length - 1, Math.max(s.from, s.to));
        if (from > us.length - 1 || to < 0) return;
        segs.push({
          from: from,
          to: to,
          start: us[from].start,
          end: us[to].end,
          speaker: mainSpeaker(us.slice(from, to + 1)),
          text: us.slice(from, to + 1).map(function (u) { return u.text; }).join(' ')
        });
      });
      if (!segs.length) return;
      var reordered = segs.some(function (s, i) { return i > 0 && s.from < segs[i - 1].from; });
      reels.push({
        title: r.title || '',
        hook: r.hook || '',
        why: r.why || '',
        score: Math.max(1, Math.min(10, r.score || 1)),
        segments: segs,
        reordered: reordered,
        keep: true
      });
    });
    reels.sort(function (a, b) { return b.score - a.score; });
    return reels;
  }

  // The speaker with the most talk time across units (-1 if unknown).
  function mainSpeaker(list) {
    var time = {};
    list.forEach(function (u) { if (u.speaker >= 0) time[u.speaker] = (time[u.speaker] || 0) + (u.end - u.start); });
    var best = -1, bestT = 0;
    Object.keys(time).forEach(function (k) { if (time[k] > bestT) { bestT = time[k]; best = Number(k); } });
    return best;
  }

  // Per frame: is anyone speaking? Each mic is scaled between its own noise floor and
  // speech level (as in Podcast.activity); gaps shorter than 0.15s count as speech.
  function speechFrames(levels) {
    var n = Math.min.apply(null, levels.map(function (l) { return l.length; }));
    var scaled = levels.map(function (db) {
      var s = db.slice().sort(function (a, b) { return a - b; });
      var noise = s[Math.floor(0.15 * s.length)], speech = s[Math.min(s.length - 1, Math.floor(0.97 * s.length))];
      var range = Math.max(6, speech - noise);
      return function (f) { return (db[f] - noise) / range; };
    });
    var on = new Array(n);
    for (var f = 0; f < n; f++) {
      on[f] = scaled.some(function (fn) { return fn(f) > 0.3; });
    }
    var gap = 0;
    for (var g = 0; g < n; g++) {
      if (on[g]) {
        if (gap > 0 && gap <= 15 && g - gap > 0) for (var k = g - gap; k < g; k++) on[k] = true;
        gap = 0;
      } else gap++;
    }
    return on;
  }

  var LEAD = 0.12;  // most air kept before the first word of a piece
  var TAIL = 0.15;  // most air kept after the last word fades

  // Places each piece's edges between words: the cut sits in the gap between a wanted and an
  // unwanted word, at its middle, but never keeps more than LEAD/TAIL of silence. It never
  // crosses into the neighbouring word, so no cut clips a word or catches the previous one.
  // units: from Reels.units (with word starts); levels: per-mic dB on the same timeline.
  function refine(segments, us, levels) {
    var speech = levels && levels.length ? speechFrames(levels) : null;
    var lastFrame = speech ? speech.length - 1 : 0;

    // When the voice of a word starting at `start` stops: the first pause of 0.1s or more
    // after it, looking no further than `limit`. (Scanning forward, because the next word's
    // voice can begin a little before Whisper's start time for it.)
    function voiceEnd(start, limit) {
      if (!speech) return Math.min(limit, start + 0.3);
      var i = Math.max(0, Math.min(lastFrame, Math.round(start / FRAME)));
      var b = Math.max(i, Math.min(lastFrame, Math.round(limit / FRAME)));
      for (; i < b; i++) {
        if (speech[i]) continue;
        var quiet = 0;
        while (i + quiet < b && !speech[i + quiet] && quiet < 10) quiet++;
        if (quiet >= 10 || i + quiet >= b) return i * FRAME;
        i += quiet;
      }
      return Math.min(limit, b * FRAME);
    }
    // When the voice of a word whose start is `start` really begins (Whisper can be a bit late).
    function voiceStart(start, floor) {
      if (!speech) return start;
      var i = Math.max(0, Math.min(lastFrame, Math.round(start / FRAME)));
      var lo = Math.max(0, Math.round(floor / FRAME));
      while (i > lo && speech[i - 1]) i--;
      return Math.max(floor, i * FRAME);
    }

    return segments.map(function (seg) {
      var first = us[seg.from], last = us[seg.to];
      var prev = us[seg.from - 1], next = us[seg.to + 1];

      var prevEnd = prev ? voiceEnd(prev.lastStart, first.firstStart) : 0;
      var mid = (prevEnd + first.firstStart) / 2;
      var onset = voiceStart(first.firstStart, mid);
      var start = Math.max(mid, onset - LEAD);

      var lastEnd = voiceEnd(last.lastStart, next ? next.firstStart : last.end + 1);
      var end = next ? Math.min((lastEnd + next.firstStart) / 2, lastEnd + TAIL) : lastEnd + TAIL;

      return Object.assign({}, seg, { start: start, end: Math.max(end, start + 0.2) });
    });
  }

  // Joins pieces that follow each other closely in the source, so a tiny skip
  // doesn't turn into a jump cut.
  function mergeClose(segments, maxGap) {
    var out = [];
    segments.forEach(function (s) {
      var prev = out[out.length - 1];
      var gap = prev ? s.start - prev.end : null;
      if (prev && gap >= -0.3 && gap <= maxGap) {
        prev.end = Math.max(prev.end, s.end);
        prev.to = s.to;
        prev.text += ' ' + s.text;
      } else {
        out.push(Object.assign({}, s));
      }
    });
    return out;
  }

  function duration(reel) {
    return reel.segments.reduce(function (t, s) { return t + (s.end - s.start); }, 0);
  }

  return { units: units, speakerLookup: speakerLookup, buildPrompt: buildPrompt, SCHEMA: SCHEMA, resolve: resolve, refine: refine, mergeClose: mergeClose, duration: duration };
})();
