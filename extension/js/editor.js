// Caption editor: word-level edits on state.captions, with undo.
// Words keep their own timing; caption times are recomputed after every edit,
// so moving a word between captions moves the cut point in time too.

var Editor = (function () {

  // ---- Pure edit operations (captions, captionIndex, wordIndex) ----

  // Moves this word and every word before it to the previous caption.
  function moveToPrev(caps, ci, wi) {
    if (ci === 0) return false;
    var moved = caps[ci].words.splice(0, wi + 1);
    caps[ci - 1].words = caps[ci - 1].words.concat(moved);
    if (!caps[ci].words.length) caps.splice(ci, 1);
    return true;
  }

  // Moves this word and every word after it to the next caption.
  function moveToNext(caps, ci, wi) {
    var moved = caps[ci].words.splice(wi);
    if (ci === caps.length - 1) caps.push({ words: [] });
    caps[ci + 1].words = moved.concat(caps[ci + 1].words);
    if (!caps[ci].words.length) caps.splice(ci, 1);
    return true;
  }

  // Starts a new caption at this word.
  function split(caps, ci, wi) {
    if (wi === 0) return false;
    caps.splice(ci + 1, 0, { words: caps[ci].words.splice(wi) });
    return true;
  }

  function mergeWithNext(caps, ci) {
    if (ci >= caps.length - 1) return false;
    caps[ci].words = caps[ci].words.concat(caps[ci + 1].words);
    caps.splice(ci + 1, 1);
    return true;
  }

  function deleteWord(caps, ci, wi) {
    caps[ci].words.splice(wi, 1);
    if (!caps[ci].words.length) caps.splice(ci, 1);
    return true;
  }

  // Replaces a word's text. Typing several words splits its time evenly between them.
  function editWord(caps, ci, wi, text) {
    var parts = text.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return deleteWord(caps, ci, wi);
    var w = caps[ci].words[wi];
    var step = (w.end - w.start) / parts.length;
    var replacement = parts.map(function (t, i) {
      return { text: t, start: w.start + i * step, end: w.start + (i + 1) * step };
    });
    Array.prototype.splice.apply(caps[ci].words, [wi, 1].concat(replacement));
    return true;
  }

  // ---- UI ----

  var ctx = null;          // { state, settings, onSeek }
  var selected = null;     // { ci, wi }
  var editing = null;      // { ci, wi }
  var history = [];

  function init(options) {
    ctx = options;
    document.addEventListener('keydown', onKey);
  }

  function snapshot() {
    history.push(JSON.stringify(ctx.state.captions));
    if (history.length > 100) history.shift();
  }

  function undo() {
    if (!history.length) return false;
    ctx.state.captions = JSON.parse(history.pop());
    selected = null;
    editing = null;
    render();
    return true;
  }

  function reset() {
    history = [];
    selected = null;
    editing = null;
  }

  // Runs an edit with undo support, then re-times and re-renders.
  function apply(op) {
    var before = JSON.stringify(ctx.state.captions);
    var args = [ctx.state.captions].concat(Array.prototype.slice.call(arguments, 1));
    if (op.apply(null, args) === false) return;
    history.push(before);
    Captions.retimeAll(ctx.state.captions, ctx.settings);
    ctx.state.edited = true;
    selected = null;
    editing = null;
    render();
  }

  function onKey(e) {
    if (editing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (!selected) return;
    var s = selected;
    if (e.key === 'Escape') { selected = null; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); apply(moveToPrev, s.ci, s.wi); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); apply(moveToNext, s.ci, s.wi); }
    else if (e.key === 'Enter') { e.preventDefault(); editing = s; render(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); apply(deleteWord, s.ci, s.wi); }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(label, title, onClick) {
    var b = el('button', 'tool', label);
    b.title = title;
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  function render() {
    var root = document.getElementById('editor');
    var caps = ctx.state.captions;
    root.innerHTML = '';

    var header = el('div', 'editor-head');
    header.appendChild(el('span', 'hint', 'לחיצה על מילה = בחירה · לחיצה כפולה = עריכה'));
    var undoBtn = button('בטל ↶', 'ביטול הפעולה האחרונה (⌘Z)', undo);
    if (!history.length) undoBtn.classList.add('dim');
    header.appendChild(undoBtn);
    root.appendChild(header);

    if (!caps.length) {
      root.appendChild(el('div', 'empty', 'לא זוהה דיבור באודיו'));
      return;
    }

    var max = ctx.settings.wordsPerCaption * Number(ctx.settings.lines);
    caps.forEach(function (c, ci) {
      var row = el('div', 'cap' + (c.words.length > max ? ' over' : ''));
      var time = el('span', 'cap-time', formatTime(c.start + ctx.state.offset) + ' → ' + formatTime(c.end + ctx.state.offset));
      time.title = 'קפוץ לזמן הזה בטיימליין';
      time.addEventListener('click', function () { ctx.onSeek(c.start + ctx.state.offset); });
      row.appendChild(time);

      var text = el('div', 'cap-text');
      text.dir = isRtl(c) ? 'rtl' : 'ltr';
      var cut = Captions.lineBreak(c, ctx.settings);
      var line = el('div', 'cap-line');
      c.words.forEach(function (w, wi) {
        if (wi === cut) { text.appendChild(line); line = el('div', 'cap-line'); }
        line.appendChild(renderWord(w, ci, wi));
      });
      text.appendChild(line);
      row.appendChild(text);

      var side = el('div', 'cap-side');
      if (ci < caps.length - 1) side.appendChild(button('⤓', 'מזג עם הכתובית הבאה', function () { apply(mergeWithNext, ci); }));
      row.appendChild(side);
      root.appendChild(row);

      if (selected && selected.ci === ci && !editing) root.appendChild(renderToolbar(ci, selected.wi));
    });
  }

  // Word order follows the caption's language: Hebrew/Arabic right-to-left, everything else left-to-right.
  var RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  var LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

  function isRtl(caption) {
    for (var i = 0; i < caption.words.length; i++) {
      var t = caption.words[i].text;
      for (var k = 0; k < t.length; k++) {
        if (RTL_CHAR.test(t[k])) return true;
        if (LTR_CHAR.test(t[k])) return false;
      }
    }
    return true;
  }

  function renderWord(w, ci, wi) {
    if (editing && editing.ci === ci && editing.wi === wi) {
      var input = el('input', 'word-input');
      input.value = w.text;
      input.size = Math.max(3, w.text.length + 1);
      var done = false;
      function commit() {
        if (done) return;
        done = true;
        if (input.value.trim() === w.text) { editing = null; render(); return; }
        apply(editWord, ci, wi, input.value);
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done = true; editing = null; render(); }
      });
      input.addEventListener('blur', commit);
      setTimeout(function () { input.focus(); input.select(); }, 0);
      return input;
    }

    var chip = el('span', 'word', Captions.displayText(w, ctx.settings) || w.text);
    if (selected && selected.ci === ci && selected.wi === wi) chip.classList.add('sel');
    if (w.original !== undefined) {
      chip.classList.add('ai');
      chip.title = 'תוקן ע"י AI · במקור: ' + (w.original || '(מילה שנמחקה)');
    }
    chip.addEventListener('click', function () {
      selected = (selected && selected.ci === ci && selected.wi === wi) ? null : { ci: ci, wi: wi };
      render();
    });
    chip.addEventListener('dblclick', function () {
      selected = { ci: ci, wi: wi };
      editing = selected;
      render();
    });
    return chip;
  }

  function renderToolbar(ci, wi) {
    var caps = ctx.state.captions;
    var bar = el('div', 'toolbar');
    if (ci > 0) bar.appendChild(button('↑ לכתובית הקודמת', 'מעביר את המילה (וכל מה שלפניה) למעלה · חץ למעלה', function () { apply(moveToPrev, ci, wi); }));
    bar.appendChild(button('↓ לכתובית הבאה', 'מעביר את המילה (וכל מה שאחריה) למטה · חץ למטה', function () { apply(moveToNext, ci, wi); }));
    if (wi > 0) bar.appendChild(button('✂ פצל כאן', 'מתחיל כתובית חדשה מהמילה הזו', function () { apply(split, ci, wi); }));
    bar.appendChild(button('✎ ערוך', 'עריכת המילה · Enter', function () { editing = { ci: ci, wi: wi }; render(); }));
    bar.appendChild(button('🗑 מחק', 'מחיקת המילה · Delete', function () { apply(deleteWord, ci, wi); }));
    return bar;
  }

  return {
    init: init, render: render, reset: reset, snapshot: snapshot, undo: undo,
    ops: { moveToPrev: moveToPrev, moveToNext: moveToNext, split: split, mergeWithNext: mergeWithNext, deleteWord: deleteWord, editWord: editWord }
  };
})();
