/* College Events Notice Board - app.js
   - loads default events from data/events.json
   - allows adding events (stored to localStorage)
   - search and filter by month
   - PWA install button support
   - offline caching via service-worker.js
*/

// ---------- Utilities ----------
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const formatDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const opts = { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' };
  return d.toLocaleString(undefined, opts);
};
const toast = (msg, t=1800) => {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(()=> el.classList.add('hidden'), t);
};

// ---------- Data Layer ----------
const STORAGE_KEY = 'ceb_user_events_v1';
let baseEvents = []; // loaded from data/events.json
let userEvents = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

async function loadBaseEvents(){
  try{
    const res = await fetch('data/events.json', {cache: "no-store"});
    baseEvents = await res.json();
  }catch(e){
    console.error('Failed to load base events',e);
    baseEvents = [];
  }
}
function allEvents(){
  // Merge base + user events. user events may have later dates; keep user events appended
  const merged = [...baseEvents, ...userEvents];
  // sort by datetime ascending
  merged.sort((a,b)=> {
    const A = new Date(a.datetime).getTime() || 0;
    const B = new Date(b.datetime).getTime() || 0;
    return A - B;
  });
  return merged;
}
function saveUserEvents(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userEvents));
}

// ---------- Rendering ----------
function renderEvents(list){
  const container = $('list');
  container.innerHTML = '';
  if(!list || list.length === 0){
    $('empty').classList.remove('hidden');
    return;
  } else {
    $('empty').classList.add('hidden');
  }

  for(const ev of list){
    const card = document.createElement('article');
    card.className = 'card';
    const tagsHTML = (ev.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    card.innerHTML = `
      <h3>${escapeHtml(ev.title)}</h3>
      <div class="meta">
        <div>${formatDateTime(ev.datetime)}</div>
        <div class="meta-right">${escapeHtml(ev.venue || '')}</div>
      </div>
      <div class="tags">${tagsHTML}</div>
      <p class="desc">${escapeHtml(ev.description || '')}</p>
      <div class="actions">
        <button class="edit btn" data-id="${ev.id}">Edit</button>
        <button class="delete btn ghost" data-id="${ev.id}">Delete</button>
      </div>
    `;
    container.appendChild(card);
  }

  // attach handlers
  container.querySelectorAll('button.edit').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      const id = e.currentTarget.getAttribute('data-id');
      openModal('edit', id);
    });
  });
  container.querySelectorAll('button.delete').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      const id = e.currentTarget.getAttribute('data-id');
      if(confirm('Delete this event?')) {
        deleteEvent(id);
      }
    });
  });
}

// escape html helper
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- Search & Filter ----------
function populateMonthFilter(){
  const sel = $('filterMonth');
  sel.innerHTML = '<option value="">All months</option>';
  const months = new Set();
  allEvents().forEach(ev=>{
    const d = new Date(ev.datetime);
    if(!isNaN(d)) months.add(`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`);
  });
  Array.from(months).sort().forEach(m=>{
    const [y,mm] = m.split('-');
    const dt = new Date(`${y}-${mm}-01`);
    const label = dt.toLocaleString(undefined,{month:'long',year:'numeric'});
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = label;
    sel.appendChild(opt);
  });
}
function applyFilters(){
  const q = ($('search').value || '').trim().toLowerCase();
  const month = $('filterMonth').value;
  let list = allEvents();
  if(month){
    list = list.filter(ev => {
      const d = new Date(ev.datetime);
      if(isNaN(d)) return false;
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
      return key === month;
    });
  }
  if(q){
    list = list.filter(ev => {
      const hay = `${ev.title} ${ev.description||''} ${ev.venue||''} ${(ev.tags||[]).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }
  renderEvents(list);
}

// ---------- Add/Edit/Delete ----------
function openModal(mode='add', id=null){
  const modal = $('modal');
  const form = document.getElementById('eventForm');
  modal.classList.remove('hidden');
  $('modalTitle').textContent = mode === 'add' ? 'Add Event' : 'Edit Event';
  if(mode === 'edit'){
    // find event
    const ev = allEvents().find(x => x.id === id);
    if(!ev) return;
    form.title.value = ev.title || '';
    form.datetime.value = ev.datetime ? ev.datetime : '';
    form.venue.value = ev.venue || '';
    form.tags.value = (ev.tags||[]).join(',');
    form.description.value = ev.description || '';
    form.setAttribute('data-edit-id', id);
  } else {
    form.reset();
    form.removeAttribute('data-edit-id');
  }
}
function closeModal(){
  $('modal').classList.add('hidden');
  const form = document.getElementById('eventForm');
  form.removeAttribute('data-edit-id');
}
function deleteEvent(id){
  // try userEvents first
  const idx = userEvents.findIndex(x=>x.id===id);
  if(idx>-1){
    userEvents.splice(idx,1);
    saveUserEvents();
    populateMonthFilter();
    applyFilters();
    toast('Event deleted');
    return;
  }
  // if not user event - ask cannot delete base events
  alert('This event is part of default data and cannot be deleted here. Edit data/events.json to remove it.');
}
function genId(){ return 'e' + Math.random().toString(36).slice(2,9); }

// handle form submit
document.addEventListener('submit', (e)=>{
  if(e.target && e.target.id === 'eventForm'){
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    const datetime = f.datetime.value;
    const venue = f.venue.value.trim();
    const tags = f.tags.value.split(',').map(s=>s.trim()).filter(Boolean);
    const description = f.description.value.trim();
    if(!title || !datetime){
      alert('Title and Date/Time are required.');
      return;
    }
    const editId = f.getAttribute('data-edit-id');
    if(editId){
      // find in userEvents; if not exist, create new user copy with same id
      let idx = userEvents.findIndex(x=>x.id===editId);
      const updated = { id: editId, title, datetime, venue, tags, description };
      if(idx>-1){
        userEvents[idx] = updated;
      } else {
        // create user override copy
        userEvents.push(updated);
      }
      saveUserEvents();
      toast('Event updated');
    } else {
      const newEv = { id: genId(), title, datetime, venue, tags, description };
      userEvents.push(newEv);
      saveUserEvents();
      toast('Event added');
    }
    closeModal();
    populateMonthFilter();
    applyFilters();
  }
});

// modal cancel
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'btnCancel') closeModal();
  if(e.target && e.target.id === 'btnNew') openModal('add');
});

// disable modal close via background click (keep simple)
$('btnNew') && $('btnNew').addEventListener && $('btnNew').addEventListener('click', ()=>openModal('add'));

// ---------- Export / Import ----------
$('btnExport') && $('btnExport').addEventListener('click', ()=>{
  const payload = { base: baseEvents, user: userEvents };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'college-events-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- Init UI wiring ----------
$('search').addEventListener('input', ()=> applyFilters());
$('filterMonth').addEventListener('change', ()=> applyFilters());
$('btnNew').addEventListener('click', ()=> openModal('add'));
$('modal').addEventListener('click', (e)=> {
  if(e.target === $('modal')) closeModal();
});

// ---------- Load app ----------
(async function init(){
  await loadBaseEvents();
  populateMonthFilter();
  applyFilters();
})();


// ---------- PWA Install handling ----------
let deferredPrompt;
const installBtn = $('installBtn');
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  if(installBtn) installBtn.hidden = false;
});
installBtn && installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if(choice.outcome === 'accepted'){
    toast('App installed');
  }else{
    toast('Install dismissed');
  }
  installBtn.hidden = true;
  deferredPrompt = null;
});

// ---------- Register service worker ----------
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('service-worker.js').catch(err=> console.warn('SW register failed',err));
}
