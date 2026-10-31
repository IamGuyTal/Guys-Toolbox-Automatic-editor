// Working copies of the active sequence, shared by the tools that cut the timeline.
// A tool edits a copy (the original stays untouched); "undo" deletes the copy and
// brings the original back.

var SequenceCopy = (function () {

  // Copies the active sequence, names the copy "<name><suffix>" and opens it.
  // cb(err, { original: {id, name}, copy: {id, name} })
  function make(suffix, cb) {
    Premiere.call('copyActiveSequence', [], function (err, original) {
      if (err) return cb(err);
      openWhenReady(original, suffix, 0, function (err, copy) {
        if (err) return cb(err);
        cb(null, { original: original, copy: copy });
      });
    });
  }

  // Premiere adds the copy a moment after copyActiveSequence returns, so poll for it.
  function openWhenReady(original, suffix, attempt, cb) {
    Premiere.call('openCopy', [original.id, original.name, original.name + suffix], function (err, res) {
      if (err) return cb(err);
      if (res.ready && res.active) return cb(null, { id: res.id, name: res.name });
      if (res.ready) return cb(new Error('העותק נוצר אבל לא נפתח. פתח את "' + res.name + '" ונסה שוב'));
      if (attempt >= 30) return cb(new Error('יצירת העותק של הסיקוונס נכשלה'));
      setTimeout(function () { openWhenReady(original, suffix, attempt + 1, cb); }, 300);
    });
  }

  // Wires an "undo changes" button. The last copy is remembered in localStorage under
  // storageKey, so undo still works after the panel is reopened.
  function undoButton(btn, storageKey) {
    var armTimer = null;

    function last() {
      try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) { return null; }
    }

    function reset() {
      clearTimeout(armTimer);
      armTimer = null;
      var info = last();
      btn.hidden = !info;
      if (info) btn.textContent = 'בטל שינויים (חזרה ל-"' + info.original.name + '")';
    }

    function remember(info) {
      try {
        if (info) localStorage.setItem(storageKey, JSON.stringify(info));
        else localStorage.removeItem(storageKey);
      } catch (e) {}
      reset();
    }

    // First click arms the button; a second click within a few seconds undoes.
    btn.addEventListener('click', function () {
      if (busy) return;
      var info = last();
      if (!info) return;
      if (!armTimer) {
        btn.textContent = 'לחץ שוב: "' + info.copy.name + '" יימחק והמקור יחזור';
        armTimer = setTimeout(reset, 5000);
        return;
      }
      setBusy(true);
      Premiere.call('discardCopy', [info.original.id, info.copy.id], function (err, res) {
        setBusy(false);
        if (err && /original-missing/.test(err.message)) {
          remember(null);
          return toast('הסיקוונס המקורי כבר לא קיים בפרויקט, אז אין למה לחזור');
        }
        if (err) { reset(); return toast(err.message); }
        remember(null);
        toast((res.deleted ? 'השינויים בוטלו' : 'העותק כבר נמחק') + '. חזרת ל-"' + info.original.name + '"');
      });
    });

    reset();
    return { remember: remember };
  }

  return { make: make, undoButton: undoButton };
})();
