/* আড়াইহাজার মারকাজ পোর্টাল — এডমিন ও ইউজার দুই পোর্টালের সাধারণ কোড
   window.PORTAL = 'admin' | 'user' */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();
const ADMIN = window.PORTAL === 'admin';
const EMAIL_DOMAIN = '@markaz.app';
// '@' থাকলে পুরো ইমেইল (যেমন জিমেইল), না থাকলে শুধু ইউজারনেম হিসেবে ধরে @markaz.app জোড়া হয়
const toEmail = id => { id = id.trim().toLowerCase(); return id.includes('@') ? id : id + EMAIL_DOMAIN; };

const AREAS = [
  ['m1', 'আড়াইহাজার পৌরসভা'], ['m2', 'গোপালদী পৌরসভা'],
  ['u1', 'সাতগ্রাম ইউনিয়ন'], ['u2', 'দুপ্তারা ইউনিয়ন'], ['u3', 'উচিৎপুরা ইউনিয়ন'],
  ['u4', 'মাহমুদপুর ইউনিয়ন'], ['u5', 'কালাপাহাড়িয়া ইউনিয়ন'], ['u6', 'ব্রাহ্মন্দী ইউনিয়ন'],
  ['u7', 'ফতেপুর ইউনিয়ন'], ['u8', 'বিশনন্দী ইউনিয়ন'], ['u9', 'হাইজাদী ইউনিয়ন'], ['u10', 'খাগকান্দা ইউনিয়ন']
];
const areaName = id => (AREAS.find(a => a[0] === id) || [, id || '-'])[1];
const STATUS = { pending: 'অপেক্ষমান', approved: 'অনুমোদিত', rejected: 'বাতিল', running: 'চলমান', completed: 'সমাপ্ত' };

const PAGES = [
  ['dashboard', 'ড্যাশবোর্ড', '🏠'],
  ['profile', 'প্রোফাইল', '👤'],
  ['addMember', 'অ্যাড মেম্বার', '➕'],
  ['position', 'অ্যাপ্লাই পজিশন রিকুয়েস্ট', '📝'],
  ['jamatOwn', 'অ্যাপ্লাই জামাত (নিজ মসজিদ)', '🕌'],
  ['jamatOut', 'অ্যাপ্লাই জামাত (আউটসাইড)', '🚌'],
  ['allMembers', 'আড়াইহাজার মারকাজ সব মেম্বার', '👥'],
  ['notice', 'নোটিস', '📢']
];
if (ADMIN) PAGES.push(['users', 'ইউজার আইডি ম্যানেজমেন্ট', '🔑']);

let me = null;            // { uid, name, area, username }
let D = { members: {}, positionRequests: {}, jamats: {}, notices: {}, users: {} };
let listeners = [];
let sathiDraft = [];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const list = k => Object.entries(D[k] || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const tag = s => `<span class="tag ${s}">${STATUS[s] || s}</span>`;
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('bn-BD') : '';
const areaOptions = (sel, all) => (all ? '<option value="">সব এলাকা</option>' : '') + AREAS.map(a => `<option value="${a[0]}" ${a[0] === sel ? 'selected' : ''}>${a[1]}</option>`).join('');
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
const fail = e => { console.error(e); toast('সমস্যা: ' + (e.message || e), true); };
const formData = f => Object.fromEntries(new FormData(f).entries());
const myArea = () => me.area;

/* ---------- Login ---------- */
function showLogin(msg) {
  stopListeners();
  $('#root').innerHTML = `
  <div class="login-wrap"><form class="login-card" id="loginForm">
    <span class="badge-portal">${ADMIN ? 'এডমিন পোর্টাল' : 'ইউজার পোর্টাল'}</span>
    <h1>আড়াইহাজার মারকাজ</h1>
    <p class="sub">লগইন করুন</p>
    ${msg ? `<p style="color:var(--r);text-align:center;margin-bottom:8px">${esc(msg)}</p>` : ''}
    <label>ইউজার আইডি বা ইমেইল</label><input name="u" required autocomplete="username" autocapitalize="none">
    <label>পাসওয়ার্ড</label><input name="p" type="password" required autocomplete="current-password">
    <button class="btn" style="width:100%;margin-top:18px">লগইন</button>
  </form></div>`;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    try { await auth.signInWithEmailAndPassword(toEmail(f.u), f.p); }
    catch (err) { toast('ইউজার আইডি বা পাসওয়ার্ড ভুল', true); }
  };
}

auth.onAuthStateChanged(async user => {
  if (!user) return showLogin();
  try {
    const isAdmin = (await db.collection('admins').doc(user.uid).get()).exists;
    if (ADMIN && !isAdmin) { await auth.signOut(); return showLogin('এই আইডি এডমিন নয়'); }
    if (isAdmin) {
      me = { uid: user.uid, name: 'এডমিন', username: user.email, area: '' };
      if (!ADMIN) { await auth.signOut(); return showLogin('এডমিন আইডি দিয়ে admin.html এ লগইন করুন'); }
    } else {
      const snap = await db.collection('users').doc(user.uid).get();
      const p = snap.exists ? snap.data() : null;
      if (!p || p.active === false) { await auth.signOut(); return showLogin('আইডিটি সক্রিয় নয়, এডমিনের সাথে যোগাযোগ করুন'); }
      me = { uid: user.uid, ...p };
    }
    startApp();
  } catch (e) { fail(e); }
});

/* ---------- Shell ---------- */
function startApp() {
  $('#root').innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sb">
      <h2>🕌 আড়াইহাজার মারকাজ</h2>
      <small>${ADMIN ? 'এডমিন পোর্টাল' : esc(areaName(me.area))}</small>
      <nav class="nav" id="nav"></nav>
      <button class="btn out" style="width:100%;margin-top:14px" id="logout">লগআউট</button>
    </aside>
    <div class="content">
      <div class="topbar"><button class="menu-btn" id="menuBtn">☰</button><h3 id="title"></h3>
        <span class="muted">${esc(me.name)}</span></div>
      <main id="main"></main>
    </div>
  </div>
  <div id="modal"></div>`;
  $('#logout').onclick = () => auth.signOut();
  $('#menuBtn').onclick = () => $('#sb').classList.toggle('open');
  $('#main').addEventListener('click', onClick);
  $('#main').addEventListener('submit', onSubmit);
  $('#modal').addEventListener('click', onClick);
  $('#modal').addEventListener('submit', onSubmit);
  $('#main').addEventListener('input', onInput);
  window.onhashchange = () => { $('#sb').classList.remove('open'); render(); };

  const keys = ['members', 'positionRequests', 'jamats', 'notices'].concat(ADMIN ? ['users'] : []);
  keys.forEach(k => {
    const unsub = db.collection(k).onSnapshot(s => {
      const o = {}; s.forEach(d => { o[d.id] = d.data(); });
      D[k] = o; render(true);
    }, e => fail(e));
    listeners.push(unsub);
  });
  render();
}
function stopListeners() { listeners.forEach(f => f()); listeners = []; }

function curPage() { const h = location.hash.slice(1); return PAGES.some(p => p[0] === h) ? h : 'dashboard'; }

function render(auto) {
  if (!me || !$('#main')) return;
  const ae = document.activeElement;
  if (auto && ae && $('#main').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; // টাইপ করার সময় রিফ্রেশ নয়
  const p = curPage();
  $('#nav').innerHTML = PAGES.map(x => `<a href="#${x[0]}" class="${x[0] === p ? 'active' : ''}"><span>${x[2]}</span>${x[1]}</a>`).join('');
  $('#title').textContent = PAGES.find(x => x[0] === p)[1];
  $('#main').innerHTML = ({
    dashboard: pDashboard, profile: pProfile, addMember: pAddMember, position: pPosition,
    jamatOwn: () => pJamat('internal'), jamatOut: () => pJamat('outside'),
    allMembers: pAllMembers, notice: pNotice, users: pUsers
  })[p]();
}

/* ---------- 1. Dashboard ---------- */
function jamatCard(j, withActions) {
  const s = j.sathi || [];
  return `<div class="jcard">
    <div class="row sp"><span class="area">${esc(areaName(j.area))}</span>${tag(j.status)}</div>
    <div>দায়িত্বশীল: <b>${esc(j.leaderName)}</b> ${j.phone ? '· ' + esc(j.phone) : ''}</div>
    ${j.type === 'outside' ? `<div>গন্তব্য: <b>${esc(j.destination || '-')}</b></div>` : ''}
    <div>মসজিদ: <b>${esc(j.mosque || 'এখনো নির্ধারিত হয়নি')}</b></div>
    <div class="muted">শুরু: ${esc(j.startDate || '-')} · ${esc(j.days || '-')} দিন</div>
    <div class="muted">সাথী (${s.length} জন):</div>
    <div class="chips">${s.map(x => `<span class="chip">${esc(x.name)}</span>`).join('') || '<span class="muted">—</span>'}</div>
    ${withActions ? `<div class="row" style="margin-top:10px">
      <button class="btn sm" data-act="editJamat" data-id="${j.id}">সম্পাদনা</button>
      <button class="btn sm org" data-act="finishJamat" data-id="${j.id}">সমাপ্ত</button>
      <button class="btn sm red" data-act="delJamat" data-id="${j.id}">মুছুন</button></div>` : ''}
  </div>`;
}
function pDashboard() {
  const run = t => list('jamats').filter(j => j.type === t && j.status === 'running');
  const ri = run('internal'), ro = run('outside');
  const pend = list('jamats').filter(j => j.status === 'pending').length + list('members').filter(m => m.status === 'pending').length + list('positionRequests').filter(r => r.status === 'pending').length;
  return `
  ${ADMIN ? `<div class="grid g3" style="margin-bottom:18px">
    <div class="card stat"><b>${list('members').filter(m => m.status === 'approved').length}</b>মোট মেম্বার</div>
    <div class="card stat"><b>${ri.length + ro.length}</b>চলমান জামাত</div>
    <div class="card stat"><b>${pend}</b>অনুমোদনের অপেক্ষায়</div></div>` : ''}
  <div class="card"><h4>🕌 RUNNING INTERNAL JAMAT <span class="muted">(${ri.length})</span></h4>
    <div class="grid g3">${ri.map(j => jamatCard(j, ADMIN)).join('') || '<div class="empty">কোনো চলমান ইন্টারনাল জামাত নেই</div>'}</div></div>
  <div class="card"><h4>🚌 RUNNING OUTSIDE JAMAT <span class="muted">(${ro.length})</span></h4>
    <div class="grid g3">${ro.map(j => jamatCard(j, ADMIN)).join('') || '<div class="empty">কোনো চলমান আউটসাইড জামাত নেই</div>'}</div></div>
  <div class="card"><h4>📢 NOTICE BOARD</h4>
    ${ADMIN ? noticeForm() : ''}
    ${noticeList(5)}</div>`;
}

/* ---------- 8. Notice ---------- */
function noticeForm() {
  return `<form data-form="addNotice" style="margin-bottom:14px">
    <input name="title" placeholder="নোটিসের শিরোনাম" required>
    <textarea name="body" rows="2" placeholder="বিস্তারিত" style="margin-top:6px"></textarea>
    <button class="btn sm" style="margin-top:6px">নোটিস দিন</button></form>`;
}
function noticeList(limit) {
  const n = list('notices').slice(0, limit || 999);
  return n.map(x => `<div class="notice"><div class="row sp"><b>${esc(x.title)}</b>
    ${ADMIN ? `<button class="btn sm red" data-act="delNotice" data-id="${x.id}">মুছুন</button>` : ''}</div>
    ${x.body ? `<div>${esc(x.body).replace(/\n/g, '<br>')}</div>` : ''}<small>${fmtDate(x.createdAt)}</small></div>`).join('') || '<div class="empty">কোনো নোটিস নেই</div>';
}
function pNotice() { return `<div class="card"><h4>📢 নোটিস</h4>${ADMIN ? noticeForm() : ''}${noticeList()}</div>`; }

/* ---------- 2. Profile ---------- */
function pProfile() {
  return `<div class="grid g2">
  <div class="card"><h4>👤 আমার প্রোফাইল</h4>
    <table><tr><th>নাম</th><td>${esc(me.name)}</td></tr>
    <tr><th>ইউজার আইডি</th><td>${esc(me.username)}</td></tr>
    <tr><th>ধরন</th><td>${ADMIN ? 'এডমিন' : 'ইউজার'}</td></tr>
    ${ADMIN ? '' : `<tr><th>এলাকা</th><td>${esc(areaName(me.area))}</td></tr>`}</table></div>
  <div class="card"><h4>🔒 পাসওয়ার্ড পরিবর্তন</h4>
    <form data-form="changePw"><label>নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</label>
    <input name="p" type="password" minlength="6" required>
    <button class="btn" style="margin-top:12px">পরিবর্তন করুন</button></form></div></div>`;
}

/* ---------- 3. Add Member ---------- */
function pAddMember() {
  const all = list('members');
  const mine = ADMIN ? all : all.filter(m => m.addedBy === me.uid || m.area === me.area);
  const pend = all.filter(m => m.status === 'pending');
  return `
  <div class="card"><h4>➕ নতুন মেম্বার যোগ করুন ${ADMIN ? '' : '<span class="muted" style="font-weight:400">(এডমিন অনুমোদনের পর তালিকায় আসবে)</span>'}</h4>
  <form data-form="addMember"><div class="grid g2">
    <div><label>নাম</label><input name="name" required></div>
    <div><label>মোবাইল</label><input name="phone" inputmode="tel"></div>
    <div><label>ঠিকানা / গ্রাম</label><input name="address"></div>
    <div><label>পেশা / মন্তব্য</label><input name="note"></div>
    ${ADMIN ? `<div><label>এলাকা</label><select name="area" required>${areaOptions('')}</select></div>` : ''}
  </div><button class="btn" style="margin-top:14px">জমা দিন</button></form></div>
  ${ADMIN ? `<div class="card"><h4>⏳ অনুমোদনের অপেক্ষায় (${pend.length})</h4>${memberTable(pend, true)}</div>` : ''}
  <div class="card"><h4>${ADMIN ? 'সর্বশেষ যোগ করা মেম্বার' : 'আমার এলাকার যোগ করা মেম্বার'}</h4>${memberTable(mine.slice(0, 50), false, true)}</div>`;
}
function memberTable(arr, approveBtns, showStatus) {
  if (!arr.length) return '<div class="empty">কোনো মেম্বার নেই</div>';
  return `<div class="tbl-wrap"><table><tr><th>নাম</th><th>মোবাইল</th><th>এলাকা</th><th>ঠিকানা</th><th>পজিশন</th>${showStatus ? '<th>অবস্থা</th>' : ''}${ADMIN ? '<th></th>' : ''}</tr>
  ${arr.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${esc(areaName(m.area))}</td><td>${esc(m.address)}</td><td>${esc(m.position || '-')}</td>
  ${showStatus ? `<td>${tag(m.status)}</td>` : ''}
  ${ADMIN ? `<td class="row">${m.status === 'pending' ? `<button class="btn sm" data-act="memApprove" data-id="${m.id}">অনুমোদন</button><button class="btn sm org" data-act="memReject" data-id="${m.id}">বাতিল</button>` : ''}
    <button class="btn sm red" data-act="memDel" data-id="${m.id}">মুছুন</button></td>` : ''}</tr>`).join('')}</table></div>`;
}

/* ---------- 4. Position request ---------- */
function pPosition() {
  const members = list('members').filter(m => m.status === 'approved' && (ADMIN || m.area === me.area));
  const reqs = list('positionRequests').filter(r => ADMIN || r.area === me.area);
  return `
  <div class="card"><h4>📝 পজিশন রিকুয়েস্ট</h4>
  <form data-form="position"><div class="grid g2">
    <div><label>মেম্বার</label><select name="memberId" required><option value="">-- বাছাই করুন --</option>
      ${members.map(m => `<option value="${m.id}">${esc(m.name)}${ADMIN ? ' (' + esc(areaName(m.area)) + ')' : ''}</option>`).join('')}</select></div>
    <div><label>কাঙ্ক্ষিত পজিশন</label><input name="position" list="posList" required>
      <datalist id="posList"><option>আমীর</option><option>নায়েবে আমীর</option><option>সেক্রেটারি</option><option>মুতাকাল্লিম</option><option>মুরব্বী</option><option>সদস্য</option></datalist></div>
  </div><label>মন্তব্য</label><textarea name="note" rows="2"></textarea>
  <button class="btn" style="margin-top:12px">রিকুয়েস্ট পাঠান</button></form></div>
  <div class="card"><h4>রিকুয়েস্ট তালিকা</h4>
  ${reqs.length ? `<div class="tbl-wrap"><table><tr><th>মেম্বার</th><th>এলাকা</th><th>পজিশন</th><th>মন্তব্য</th><th>অবস্থা</th>${ADMIN ? '<th></th>' : ''}</tr>
  ${reqs.map(r => `<tr><td>${esc(r.memberName)}</td><td>${esc(areaName(r.area))}</td><td>${esc(r.position)}</td><td>${esc(r.note)}</td><td>${tag(r.status)}</td>
  ${ADMIN ? `<td class="row">${r.status === 'pending' ? `<button class="btn sm" data-act="posApprove" data-id="${r.id}">অনুমোদন</button><button class="btn sm org" data-act="posReject" data-id="${r.id}">বাতিল</button>` : ''}
  <button class="btn sm red" data-act="posDel" data-id="${r.id}">মুছুন</button></td>` : ''}</tr>`).join('')}</table></div>` : '<div class="empty">কোনো রিকুয়েস্ট নেই</div>'}</div>`;
}

/* ---------- 5 & 6. Jamat apply ---------- */
function sathiRows(arr) {
  return `<div id="sathiBox">${(arr.length ? arr : [{}]).map((s, i) => `<div class="sathi-row">
    <input class="s-name" placeholder="সাথীর নাম" value="${esc(s.name)}">
    <input class="s-phone" placeholder="মোবাইল" value="${esc(s.phone)}">
    <button type="button" class="btn sm red" data-act="rmSathi">✕</button></div>`).join('')}</div>
    <button type="button" class="btn sm out" data-act="addSathi">+ সাথী যোগ করুন</button>`;
}
function collectSathi(root) {
  return [...root.querySelectorAll('.sathi-row')].map(r => ({
    name: r.querySelector('.s-name').value.trim(), phone: r.querySelector('.s-phone').value.trim()
  })).filter(s => s.name);
}
function pJamat(type) {
  const out = type === 'outside';
  const arr = list('jamats').filter(j => j.type === type && (ADMIN || j.area === me.area));
  return `
  <div class="card"><h4>${out ? '🚌 আউটসাইড জামাতের আবেদন' : '🕌 নিজ এলাকার মসজিদে জামাতের আবেদন'}</h4>
  <form data-form="jamat" data-type="${type}"><div class="grid g2">
    ${ADMIN ? `<div><label>এলাকা</label><select name="area" required>${areaOptions('')}</select></div>` : ''}
    <div><label>জামাতের দায়িত্বশীলের নাম</label><input name="leaderName" required></div>
    <div><label>মোবাইল</label><input name="phone" inputmode="tel"></div>
    ${out ? '<div><label>গন্তব্য (এলাকা/জেলা)</label><input name="destination" required></div>' : ''}
    <div><label>শুরুর তারিখ</label><input name="startDate" type="date" value="${today()}" required></div>
    <div><label>কত দিন</label><select name="days"><option>৩</option><option>১০</option><option>৪০</option><option>৪ মাস</option></select></div>
  </div>
  <label>সাথীদের তালিকা</label>${sathiRows([])}
  <div><button class="btn" style="margin-top:14px">${ADMIN ? 'জামাত যোগ করুন' : 'আবেদন জমা দিন'}</button></div></form></div>
  <div class="card"><h4>${ADMIN ? 'সব আবেদন' : 'আমার এলাকার আবেদন'}</h4>
  ${arr.length ? `<div class="grid g3">${arr.map(j => jamatCard(j, false) + '').map((h, i) => {
    const j = arr[i];
    return ADMIN ? h.replace(/<\/div>\s*$/, `<div class="row" style="margin-top:10px">
      <button class="btn sm" data-act="editJamat" data-id="${j.id}">সম্পাদনা / সাথী</button>
      ${j.status === 'pending' ? `<button class="btn sm org" data-act="jRun" data-id="${j.id}">অনুমোদন (চলমান)</button><button class="btn sm out" data-act="jReject" data-id="${j.id}">বাতিল</button>` : ''}
      ${j.status === 'running' ? `<button class="btn sm org" data-act="finishJamat" data-id="${j.id}">সমাপ্ত</button>` : ''}
      <button class="btn sm red" data-act="delJamat" data-id="${j.id}">মুছুন</button></div></div>`) : h;
  }).join('')}</div>` : '<div class="empty">কোনো আবেদন নেই</div>'}</div>`;
}
function editJamatModal(id) {
  const j = D.jamats[id]; if (!j) return;
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal">
  <div class="row sp"><h4>জামাত সম্পাদনা — ${esc(areaName(j.area))}</h4><button class="btn sm out" data-act="closeModal">✕</button></div>
  <form data-form="saveJamat" data-id="${id}"><div class="grid g2">
    <div><label>দায়িত্বশীল</label><input name="leaderName" value="${esc(j.leaderName)}" required></div>
    <div><label>মোবাইল</label><input name="phone" value="${esc(j.phone)}"></div>
    ${j.type === 'outside' ? `<div><label>গন্তব্য</label><input name="destination" value="${esc(j.destination)}"></div>` : ''}
    <div><label>🕌 জামাত যাবে যে মসজিদে</label><input name="mosque" value="${esc(j.mosque)}" placeholder="মসজিদের নাম ও ঠিকানা"></div>
    <div><label>শুরুর তারিখ</label><input type="date" name="startDate" value="${esc(j.startDate)}"></div>
    <div><label>দিন</label><input name="days" value="${esc(j.days)}"></div>
    <div><label>অবস্থা</label><select name="status">${['pending', 'running', 'completed', 'rejected'].map(s => `<option value="${s}" ${j.status === s ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></div>
  </div><label>সাথীদের তালিকা (যোগ / মুছা যাবে)</label>${sathiRows(j.sathi || [])}
  <button class="btn" style="margin-top:14px">সংরক্ষণ</button></form></div></div>`;
}

/* ---------- 7. All members ---------- */
let mFilter = { area: '', q: '' };
function pAllMembers() {
  const ap = list('members').filter(m => m.status === 'approved');
  const cnt = {}; ap.forEach(m => cnt[m.area] = (cnt[m.area] || 0) + 1);
  const rows = ap.filter(m => (!mFilter.area || m.area === mFilter.area) && (!mFilter.q || (m.name + m.phone + m.address).includes(mFilter.q)));
  return `<div class="card"><h4>👥 সব মেম্বার <span class="muted">(মোট ${ap.length} জন)</span></h4>
  <div class="row" style="margin-bottom:12px">
    <select id="fArea" style="max-width:240px">${areaOptions(mFilter.area, true)}</select>
    <input id="fQ" placeholder="নাম / মোবাইল খুঁজুন" value="${esc(mFilter.q)}" style="max-width:240px"></div>
  <div class="chips" style="margin-bottom:12px">${AREAS.map(a => `<span class="chip">${a[1]}: ${cnt[a[0]] || 0}</span>`).join('')}</div>
  <div id="memTbl">${memberTable(rows, false)}</div></div>`;
}
function onInput(e) {
  if (e.target.id === 'fArea') { mFilter.area = e.target.value; $('#memTbl').innerHTML = memberTable(filtered(), false); }
  if (e.target.id === 'fQ') { mFilter.q = e.target.value.trim(); $('#memTbl').innerHTML = memberTable(filtered(), false); }
}
document.addEventListener('change', e => { if (e.target.id === 'fArea') onInput(e); });
function filtered() { return list('members').filter(m => m.status === 'approved' && (!mFilter.area || m.area === mFilter.area) && (!mFilter.q || (m.name + m.phone + m.address).includes(mFilter.q))); }

/* ---------- 9. Admin: users ---------- */
function pUsers() {
  const us = list('users');
  return `<div class="card"><h4>🔑 নতুন ইউজার আইডি তৈরি</h4>
  <form data-form="createUser"><div class="grid g2">
    <div><label>এলাকা</label><select name="area" required>${areaOptions('')}</select></div>
    <div><label>ইউজারের নাম</label><input name="name" required></div>
    <div><label>ইউজার আইডি (ইংরেজি ছোট হাতের অক্ষর/সংখ্যা, অথবা পুরো জিমেইল)</label><input name="username" pattern="[a-z0-9._@+-]{3,}" required autocapitalize="none"></div>
    <div><label>পাসওয়ার্ড (কমপক্ষে ৬)</label><input name="password" minlength="6" required></div>
  </div><button class="btn" style="margin-top:14px">আইডি তৈরি করুন</button></form></div>
  <div class="card"><h4>সব ইউজার (${us.length})</h4>
  ${us.length ? `<div class="tbl-wrap"><table><tr><th>নাম</th><th>আইডি</th><th>এলাকা</th><th>অবস্থা</th><th></th></tr>
  ${us.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(areaName(u.area))}</td>
  <td>${u.active === false ? '<span class="tag rejected">বন্ধ</span>' : '<span class="tag approved">সক্রিয়</span>'}</td>
  <td><button class="btn sm ${u.active === false ? '' : 'org'}" data-act="toggleUser" data-id="${u.id}">${u.active === false ? 'চালু করুন' : 'বন্ধ করুন'}</button></td></tr>`).join('')}</table></div>` : '<div class="empty">এখনো কোনো ইউজার নেই</div>'}</div>`;
}
async function createUser(f) {
  const username = f.username.trim().toLowerCase();
  if (us().some(u => u.username === username)) throw new Error('এই আইডি আগে থেকেই আছে');
  const sec = firebase.initializeApp(firebaseConfig, 'sec' + Date.now()); // এডমিন লগআউট এড়াতে আলাদা অ্যাপ
  try {
    const cred = await sec.auth().createUserWithEmailAndPassword(toEmail(username), f.password);
    await db.collection('users').doc(cred.user.uid).set({ name: f.name.trim(), username, area: f.area, active: true, createdAt: Date.now() });
    await sec.auth().signOut();
  } finally { sec.delete(); }
}
const us = () => list('users');

/* ---------- Event handling ---------- */
async function onSubmit(e) {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form, f = formData(form), now = Date.now();
  try {
    if (kind === 'addNotice') await db.collection('notices').add({ title: f.title, body: f.body, createdAt: now });
    else if (kind === 'changePw') { await auth.currentUser.updatePassword(f.p); form.reset(); }
    else if (kind === 'addMember') {
      await db.collection('members').add({ name: f.name, phone: f.phone, address: f.address, note: f.note, area: ADMIN ? f.area : myArea(),
        status: ADMIN ? 'approved' : 'pending', addedBy: me.uid, createdAt: now });
      form.reset();
    } else if (kind === 'position') {
      const m = D.members[f.memberId];
      const status = ADMIN ? 'approved' : 'pending';
      await db.collection('positionRequests').add({ memberId: f.memberId, memberName: m.name, area: m.area, position: f.position, note: f.note, status, by: me.uid, createdAt: now });
      if (ADMIN) await db.collection('members').doc(f.memberId).update({ position: f.position });
      form.reset();
    } else if (kind === 'jamat') {
      await db.collection('jamats').add({ type: form.dataset.type, area: ADMIN ? f.area : myArea(), leaderName: f.leaderName, phone: f.phone,
        destination: f.destination || '', startDate: f.startDate, days: f.days, mosque: '', sathi: collectSathi(form),
        status: ADMIN ? 'running' : 'pending', applicantUid: me.uid, createdAt: now });
      form.reset();
      render(); // সাথীর সারি রিসেট করতে
    } else if (kind === 'saveJamat') {
      const up = { leaderName: f.leaderName, phone: f.phone, mosque: f.mosque || '', startDate: f.startDate, days: f.days, status: f.status, sathi: collectSathi(form) };
      if (f.destination !== undefined) up.destination = f.destination;
      await db.collection('jamats').doc(form.dataset.id).update(up);
      $('#modal').innerHTML = '';
    } else if (kind === 'createUser') { await createUser(f); form.reset(); }
    toast('সফলভাবে সম্পন্ন হয়েছে ✔');
  } catch (err) { fail(err); }
}

async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  const ask = m => confirm(m);
  try {
    if (act === 'addSathi') {
      const box = b.parentElement.querySelector('#sathiBox');
      box.insertAdjacentHTML('beforeend', `<div class="sathi-row"><input class="s-name" placeholder="সাথীর নাম"><input class="s-phone" placeholder="মোবাইল"><button type="button" class="btn sm red" data-act="rmSathi">✕</button></div>`);
    } else if (act === 'rmSathi') b.parentElement.remove();
    else if (act === 'closeModal') $('#modal').innerHTML = '';
    else if (act === 'editJamat') editJamatModal(id);
    else if (act === 'delNotice' && ask('নোটিস মুছবেন?')) await db.collection('notices').doc(id).delete();
    else if (act === 'memApprove') await db.collection('members').doc(id).update({ status: 'approved' });
    else if (act === 'memReject') await db.collection('members').doc(id).update({ status: 'rejected' });
    else if (act === 'memDel' && ask('মেম্বার মুছবেন?')) await db.collection('members').doc(id).delete();
    else if (act === 'posApprove') {
      const r = D.positionRequests[id];
      const batch = db.batch();
      batch.update(db.collection('positionRequests').doc(id), { status: 'approved' });
      batch.update(db.collection('members').doc(r.memberId), { position: r.position });
      await batch.commit();
    } else if (act === 'posReject') await db.collection('positionRequests').doc(id).update({ status: 'rejected' });
    else if (act === 'posDel' && ask('মুছবেন?')) await db.collection('positionRequests').doc(id).delete();
    else if (act === 'jRun') await db.collection('jamats').doc(id).update({ status: 'running' });
    else if (act === 'jReject') await db.collection('jamats').doc(id).update({ status: 'rejected' });
    else if (act === 'finishJamat') await db.collection('jamats').doc(id).update({ status: 'completed' });
    else if (act === 'delJamat' && ask('জামাত মুছবেন?')) await db.collection('jamats').doc(id).delete();
    else if (act === 'toggleUser') await db.collection('users').doc(id).update({ active: D.users[id].active === false });
  } catch (err) { fail(err); }
}
