// Home screen: tool picker and navigation between tool views.

var Home = (function () {
  var TITLES = { home: 'Guy Tal - Toolbox', captions: 'כתוביות', silence: 'הסרת שקטים', podcast: 'פודקאסט', reels: 'רילז' };

  function show(tool) {
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + tool; });
    document.getElementById('btn-home').hidden = tool === 'home';
    document.getElementById('topbar-title').textContent = TITLES[tool];
    var slot = document.querySelector('#view-' + tool + ' .ai-slot');
    if (slot) slot.appendChild(document.getElementById('ai-card'));
    try { localStorage.setItem('lastTool', tool); } catch (e) {}
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.tool-card').forEach(function (card) {
    card.addEventListener('click', function () {
      if (card.hasAttribute('data-soon')) return toast('הכלי הזה עוד בבנייה');
      show(card.dataset.tool);
    });
  });

  document.getElementById('btn-home').addEventListener('click', function () {
    if (busy) return toast('חכה שהפעולה הנוכחית תסתיים');
    show('home');
  });

  // Reopen the tool that was open last time.
  var last = localStorage.getItem('lastTool');
  var card = last && document.querySelector('.tool-card[data-tool="' + last + '"]');
  show(card && !card.hasAttribute('data-soon') ? last : 'home');

  return { show: show };
})();
