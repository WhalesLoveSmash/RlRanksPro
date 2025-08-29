const $ = (s) => document.querySelector(s);
const PROFILE_REGEX = /rocketleague\.tracker\.network\/rocket-league\/profile\/(steam|epic|xbox|psn)\/([^/]+)(?:\/|$)/i;

function setStatus(t) { $('#status').textContent = t || ''; }
function showError(t) { setStatus('❌ ' + t); }
function showOK(t) { setStatus('✅ ' + t); }

$('#fetchBtn').addEventListener('click', async () => {
  const raw = $('#profileUrl').value.trim();
  const m = raw.match(PROFILE_REGEX);
  if (!m) return showError('Invalid RLTracker URL');

  const platform = m[1].toLowerCase();
  const pid = decodeURIComponent(m[2]);

  try {
    setStatus('Fetching profile…');
    const r = await fetch(`/profile/${encodeURIComponent(platform)}/${encodeURIComponent(pid)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'fetch failed');

    $('#mmr').textContent = Number(data.currentMMR).toLocaleString();
    $('#winPct').value = data.recentWinPercent ?? 50;

    $('#rank').textContent = '(calculates in /api/predict)';
    showOK('Fetched. Now predict to see projection.');
  } catch (e) {
    showError(e.message);
  }
});

$('#predictBtn').addEventListener('click', async () => {
  const mmr = Number($('#mmr').textContent.replace(/,/g,''));
  if (!mmr) return showError('Fetch your profile first.');
  const body = {
    mmr,
    winPct: Number($('#winPct').value || 50),
    games: Number($('#games').value || 25),
    regress: Number($('#regress').value || 30)
  };
  try {
    setStatus('Predicting…');
    const r = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'prediction failed');

    $('#rank').textContent = `${data.current.rank.tier} ${data.current.rank.div}`;
    $('#output').textContent = JSON.stringify(data, null, 2);
    showOK('Done.');
  } catch (e) {
    showError(e.message);
  }
});