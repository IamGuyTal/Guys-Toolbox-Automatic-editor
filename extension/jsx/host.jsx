// ExtendScript side: runs inside Premiere. Every function returns a JSON string.

var TICKS_PER_SECOND = 254016000000;

function toJSON(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  }
  if (v instanceof Array) {
    var items = [];
    for (var i = 0; i < v.length; i++) items.push(toJSON(v[i]));
    return '[' + items.join(',') + ']';
  }
  var parts = [];
  for (var k in v) if (v.hasOwnProperty(k)) parts.push(toJSON(k) + ':' + toJSON(v[k]));
  return '{' + parts.join(',') + '}';
}

function getSequenceInfo() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ sequence: null });
    var end = Number(seq.end) / TICKS_PER_SECOND;
    var inPoint = seq.getInPointAsTime().seconds;
    var outPoint = seq.getOutPointAsTime().seconds;
    var hasInOut = inPoint > 0.001 || (outPoint > 0 && outPoint < end - 0.001);
    return toJSON({
      sequence: seq.name,
      duration: end,
      inPoint: inPoint,
      outPoint: outPoint,
      hasInOut: hasInOut
    });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function setPlayhead(seconds) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    seq.setPlayerPosition(String(Math.round(seconds * TICKS_PER_SECOND)));
    return toJSON({ ok: true });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function getProjectPath() {
  try {
    return toJSON({ path: app.project.path || '' });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function findBin(parent, name) {
  for (var i = 0; i < parent.children.numItems; i++) {
    var child = parent.children[i];
    if (child.type === ProjectItemType.BIN && child.name === name) return child;
  }
  return parent.createBin(name);
}

function findItemByPath(bin, mediaPath) {
  for (var i = bin.children.numItems - 1; i >= 0; i--) {
    var item = bin.children[i];
    try {
      if (item.getMediaPath() === mediaPath) return item;
    } catch (e) {}
  }
  return null;
}

// Imports an SRT file into a "Captions" bin and adds it to the active sequence as a caption track.
function addCaptionTrack(srtPath) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var bin = findBin(app.project.rootItem, 'Captions');
    if (!app.project.importFiles([srtPath], true, bin, false)) return toJSON({ error: 'SRT import failed' });
    var item = findItemByPath(bin, srtPath);
    if (!item) return toJSON({ error: 'Imported captions not found in project' });
    var ok = (typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined)
      ? seq.createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE)
      : seq.createCaptionTrack(item, 0);
    if (ok === false) return toJSON({ error: 'createCaptionTrack failed' });
    return toJSON({ ok: true, item: item.name });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Renders the active sequence's mixed audio to a WAV file.
// useInOut: true = only In→Out, false = whole sequence.
function exportAudio(outPath, presetPath, useInOut) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var ENCODE_ENTIRE = 0, ENCODE_IN_TO_OUT = 1;
    var ok = seq.exportAsMediaDirect(outPath, presetPath, useInOut ? ENCODE_IN_TO_OUT : ENCODE_ENTIRE);
    return toJSON({ ok: ok !== false, offset: useInOut ? seq.getInPointAsTime().seconds : 0 });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}
