/* Tonninyira "Issues" for stalls and riders.
 * When a customer reports a problem on an order, the stall(s) and rider on
 * that order see the case here (vendor: Orders tab; rider: Deliveries tab,
 * placed by rider-home.js) and can reply with their side and photos.
 * Visibility is enforced by the database (support_conversations_partner_read
 * via tn_case_party); support-only notes are never returned to partners.
 */
(function(){
  'use strict';
  const onVendor = /vendor-dashboard/i.test(location.pathname), onRider = /rider-dashboard/i.test(location.pathname);
  if(!onVendor && !onRider) return;
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : new Date(iso).toLocaleDateString(); };
  let me = null, openId = null, booted = false;

  function styles(){
    window.TNCase?.styles?.();
    if(document.getElementById('tn-pcases-style')) return;
    const s = document.createElement('style'); s.id = 'tn-pcases-style';
    s.textContent = `
      #tnPartnerCases{margin:12px 0;display:grid;gap:10px}
      #tnPartnerCases[hidden]{display:none}
      .tpc-h{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#FFB0A5}
      .tpc-badge{min-width:20px;height:20px;border-radius:99px;background:#E23F25;color:#fff;font-size:.66rem;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;letter-spacing:0}
      .tpc-card{background:var(--card,#2A1F19);border:1px solid rgba(226,63,37,.45);border-radius:18px;padding:14px}
      .tpc-card.done{border-color:#3A2E26;opacity:.75}
      .tpc-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;cursor:pointer;background:none;border:0;color:inherit;font:inherit;text-align:left;width:100%;padding:0}
      .tpc-top b{display:block;font-size:.92rem}.tpc-top small{display:block;font-size:.74rem;color:#B7A493;margin-top:2px}
      .tpc-need{font-size:.72rem;font-weight:800;color:#FFB0A5;margin-top:6px}
      .tpc-body{margin-top:12px;border-top:1px solid #3A2E26;padding-top:12px}
      .tpc-thread{max-height:50vh;overflow:auto}
    `;
    document.head.appendChild(s);
  }

  function host(){
    let el = document.getElementById('tnPartnerCases');
    if(el) return el;
    const dash = document.getElementById('dashView'); if(!dash) return null;
    el = document.createElement('section'); el.id = 'tnPartnerCases'; el.hidden = true; el.setAttribute('aria-label', 'Customer issues');
    const before = document.getElementById('ordersList') || document.getElementById('deliveriesList');
    before && before.parentNode === dash ? dash.insertBefore(el, before) : dash.appendChild(el);
    return el;
  }

  async function load(){
    const client = c(); const el = host(); if(!client || !el) return;
    me = me || (await client.auth.getSession())?.data?.session?.user?.id;
    if(!me) return;
    const { data, error } = await client.from('support_conversations')
      .select('id,case_ref,order_id,category,status,resolution,last_message_at,last_sender_role,created_at,customer_id')
      .not('order_id', 'is', null).neq('customer_id', me).order('last_message_at', { ascending: false }).limit(30);
    if(error){ el.hidden = true; return; }
    const rows = data || [];
    if(!rows.length){ el.hidden = true; el.innerHTML = ''; return; }
    const active = rows.filter(r => !['resolved','closed'].includes(r.status));
    el.hidden = false;
    el.innerHTML = `<div class="tpc-h">Customer issues ${active.length ? `<span class="tpc-badge">${active.length}</span>` : ''}</div>`
      + rows.map(r => {
        const done = ['resolved','closed'].includes(r.status);
        const needs = !done && ['customer','support'].includes(r.last_sender_role);
        return `<div class="tpc-card ${done ? 'done' : ''}" data-case="${esc(r.id)}">
          <button type="button" class="tpc-top" data-toggle="${esc(r.id)}" aria-expanded="${openId === r.id}">
            <span style="min-width:0"><b>${esc(TNCase.CATEGORY[r.category] || 'Problem reported')} · ${esc(r.order_id)}</b><small>${esc(r.case_ref || '')} · ${esc(ago(r.last_message_at || r.created_at))}</small>
            ${needs ? '<div class="tpc-need">Waiting for your reply</div>' : ''}</span>
            <span class="tnc-pill ${esc(r.status)}">${esc(TNCase.STATUS[r.status] || r.status)}</span></button>
          ${done && r.resolution ? `<div class="tnc-note" style="margin-top:8px">Decision: ${esc(r.resolution)}</div>` : ''}
          <div class="tpc-body" ${openId === r.id ? '' : 'hidden'}><div class="tpc-thread"></div><div class="tpc-comp"></div></div></div>`;
      }).join('');
    if(openId) expand(openId, rows.find(r => r.id === openId));
  }

  async function expand(id, row){
    const card = document.querySelector(`#tnPartnerCases [data-case="${CSS.escape(id)}"]`); if(!card) return;
    const body = card.querySelector('.tpc-body'); body.hidden = false;
    const refresh = () => TNCase.thread(card.querySelector('.tpc-thread'), id, { viewerRole: onVendor ? 'vendor' : 'rider' });
    await refresh();
    if(row && row.status !== 'closed') TNCase.composer(card.querySelector('.tpc-comp'), id, { onSent: () => { refresh(); load(); }, placeholder: onVendor ? 'Your side: what happened at the stall?' : 'Your side: what happened on delivery?' });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('#tnPartnerCases [data-toggle]'); if(!t) return;
    const id = t.dataset.toggle; const body = t.closest('.tpc-card').querySelector('.tpc-body');
    if(!body.hidden){ body.hidden = true; openId = null; t.setAttribute('aria-expanded', 'false'); return; }
    openId = id; t.setAttribute('aria-expanded', 'true'); load();
  });

  function boot(){
    const dash = document.getElementById('dashView');
    if(booted || !dash || dash.classList.contains('hidden') || !window.TNCase) return;
    booted = true; styles(); load();
    setInterval(() => { if(!document.hidden && !openId) load(); }, 60000);
  }
  const iv = setInterval(() => { boot(); if(booted) clearInterval(iv); }, 600);
})();
