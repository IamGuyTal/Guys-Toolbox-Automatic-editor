// Groups transcribed words into captions according to the panel settings.
// Caption: { words: [{text, start, end}], start, end }

var Captions = (function () {
  var SENTENCE_END = /[.!?…]$/;
  var PAUSE_BREAK = 0.6; // seconds of silence that force a new caption

  function build(words, settings) {
    var max = settings.wordsPerCaption * Number(settings.lines);
    var captions = [];

    phrases(words).forEach(function (phrase) { pushEvenly(captions, phrase, max); });

    captions.forEach(retime);
    if (settings.fillGaps) fillGaps(captions);
    return captions;
  }

  function copyWord(w) {
    var c = { text: w.text, start: w.start, end: w.end };
    if (w.original !== undefined) c.original = w.original;
    return c;
  }

  // Split evenly so a phrase never ends with a lone orphan word (7 → 3+2+2, not 3+3+1)
  function pushEvenly(captions, phrase, max) {
    var count = Math.ceil(phrase.length / max);
    var size = phrase.length / count;
    for (var i = 0; i < count; i++) {
      var chunk = phrase.slice(Math.round(i * size), Math.round((i + 1) * size));
      captions.push({ words: chunk.map(copyWord) });
    }
  }

  // Applies AI corrections ({i, text}) and caption breaks (word indices) to a word list.
  // Corrected words remember their original text so the editor can highlight them.
  function applyImprovement(words, result, settings) {
    var fixes = {};
    result.corrections.forEach(function (c) {
      if (c.i >= 0 && c.i < words.length && c.text.trim() !== words[c.i].text) fixes[c.i] = c.text;
    });

    var out = [];
    var firstNewIndex = [];
    words.forEach(function (w, i) {
      firstNewIndex[i] = out.length;
      if (!(i in fixes)) return out.push(copyWord(w));
      var parts = fixes[i].trim().split(/\s+/).filter(Boolean);
      var step = (w.end - w.start) / (parts.length || 1);
      parts.forEach(function (t, k) {
        out.push({ text: t, start: w.start + k * step, end: w.start + (k + 1) * step, original: w.original !== undefined ? w.original : w.text });
      });
    });

    var breaks = {};
    result.breaks.forEach(function (i) { if (i > 0 && i < words.length) breaks[firstNewIndex[i]] = true; });

    var max = settings.wordsPerCaption * Number(settings.lines);
    var captions = [];
    var phrase = [];
    out.forEach(function (w, i) {
      if (breaks[i] && phrase.length) { pushEvenly(captions, phrase, max); phrase = []; }
      phrase.push(w);
    });
    if (phrase.length) pushEvenly(captions, phrase, max);
    retimeAll(captions, settings);

    return { words: out, captions: captions, changed: Object.keys(fixes).length };
  }

  // Breaks the word list at sentence ends and pauses.
  function phrases(words) {
    var out = [];
    words.forEach(function (w, i) {
      var prev = words[i - 1];
      if (!prev || SENTENCE_END.test(prev.text) || w.start - prev.end > PAUSE_BREAK) out.push([]);
      out[out.length - 1].push(w);
    });
    return out;
  }

  function retime(c) {
    c.start = c.words[0].start;
    c.end = c.words[c.words.length - 1].end;
  }

  // Each caption stays on screen until the next one starts.
  function fillGaps(captions) {
    for (var i = 0; i < captions.length - 1; i++) captions[i].end = captions[i + 1].start;
  }

  function stripPunctuation(text) {
    return text.replace(/[.,!?;:…"״׳()]/g, '').replace(/^-+|-+$/g, '');
  }

  function displayText(word, settings) {
    return settings.stripPunctuation ? stripPunctuation(word.text) : word.text;
  }

  // Index of the first word on the second line, or -1 for a single line.
  function lineBreak(caption, settings) {
    if (Number(settings.lines) < 2 || caption.words.length < 2) return -1;
    return Math.ceil(caption.words.length / 2);
  }

  // Splits words across lines as evenly as possible.
  function lines(caption, settings) {
    var texts = caption.words.map(function (w) { return displayText(w, settings); });
    var cut = lineBreak(caption, settings);
    if (cut < 0) return [texts.join(' ')];
    return [texts.slice(0, cut).join(' '), texts.slice(cut).join(' ')];
  }

  // Recomputes caption times from their words after manual edits.
  function retimeAll(captions, settings) {
    captions.forEach(retime);
    if (settings.fillGaps) fillGaps(captions);
  }

  function srtTime(sec) {
    var ms = Math.max(0, Math.round(sec * 1000));
    function pad(n, w) { return ('000' + n).slice(-w); }
    return pad(Math.floor(ms / 3600000), 2) + ':' + pad(Math.floor(ms / 60000) % 60, 2) + ':' +
      pad(Math.floor(ms / 1000) % 60, 2) + ',' + pad(ms % 1000, 3);
  }

  // SRT text with times shifted by offset (where the transcribed audio starts in the sequence).
  function toSRT(captions, settings, offset) {
    var MIN_DURATION = 0.1;
    return captions.map(function (c, i) {
      var start = c.start + offset;
      var end = Math.max(c.end + offset, start + MIN_DURATION);
      var text = lines(c, settings).filter(Boolean).join('\n');
      return (i + 1) + '\n' + srtTime(start) + ' --> ' + srtTime(end) + '\n' + text + '\n';
    }).join('\n');
  }

  return {
    build: build, lines: lines, lineBreak: lineBreak, displayText: displayText,
    retime: retime, retimeAll: retimeAll, fillGaps: fillGaps, toSRT: toSRT,
    applyImprovement: applyImprovement
  };
})();
