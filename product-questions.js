/* Tonninyira "Ask if it's available".
 * Customers (storefront): each in-stock product card has "Ask if it's
 * available". The question goes to the stall (product_questions); a sheet
 * waits for the answer, and the card then shows what the stall said.
 * Stalls (vendor dashboard): a "Customers asking" list with Yes / No. "No"
 * can also mark the product sold out, which blocks it from the basket.
 * Validation, rate limits and notifications live in the database
 * (product_question_before_insert, answer_product_question).
 */
(function(){
  'use strict';
  const onVendor = /vendor-dashboard/i.test(location.pathname);
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : new Date(iso).toLocaleDateString(); };
  const uid = async () => (await c()?.auth.getSession())?.data?.session?.user?.id || null;

  function styles(){
    if(document.getElementById('tn-ask-style')) return;
    const s = document.createElement('style'); s.id = 'tn-ask-style';
    s.textContent = `
      .tna-said{margin:-4px 8px 8px;font-size:.72rem;font-weight:700;line-height:1.35}
      .tna-said.yes{color:#9FE0B0}.tna-said.no{color:#FFB0A5}.tna-said.wait{color:var(--muted,#B7A493)}
      .tna-back{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);display:grid;place-items:end center}
      .tna-sheet{width:min(520px,100%);background:var(--ink,#1C1410);color:var(--sand,#F3E8D8);border-radius:22px 22px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom));font-family:'Work Sans',sans-serif}
      .tna-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .tna-eye{font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#F5B400)}
      .tna-h{font-size:1.08rem;font-weight:800;margin-top:3px}
      .tna-x{width:44px;height:44px;border-radius:50%;border:0;background:var(--card,#2A1F19);color:inherit;font-size:1.1rem;cursor:pointer;flex-shrink:0}
      .tna-box{margin-top:14px;padding:14px;border-radius:14px;background:var(--card,#2A1F19);font-size:.9rem;line-height:1.45}
      .tna-box.yes{background:#1E2A1F;border:1px solid #3D6B45}.tna-box.no{background:#2E1D1A;border:1px solid #6B4A40}
      .tna-dots::after{content:'';animation:tnadots 1.2s steps(4) infinite}
      @keyframes tnadots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
      .tna-go{min-height:48px;width:100%;margin-top:12px;border:0;border-radius:14px;background:var(--gold,#F5B400);color:var(--ink,#1C1410);font:inherit;font-weight:800;cursor:pointer}
      .tna-sub{font-size:.76rem;color:var(--muted,#B7A493);margin-top:8px}
      #tnAskPanel{margin:12px 0;display:grid;gap:10px}#tnAskPanel[hidden]{display:none}
      .tna-ph{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#F5B400)}
      .tna-badge{min-width:20px;height:20px;border-radius:99px;background:#E23F25;color:#fff;font-size:.66rem;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;letter-spacing:0}
      .tna-q{background:var(--card,#2A1F19);border:1px solid rgba(245,180,0,.45);border-radius:16px;padding:12px}
      .tna-q.done{border-color:#3A2E26;opacity:.75}
      .tna-q b{display:block;font-size:.92rem}.tna-q small{display:block;font-size:.74rem;color:#B7A493;margin-top:2px}
      .tna-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .tna-yes,.tna-no{min-height:44px;border-radius:12px;font:inherit;font-weight:800;cursor:pointer}
      .tna-yes{border:0;background:#6BD08A;color:#10261A}.tna-no{border:1px solid #6B4A40;background:transparent;color:#FFB0A5}
      .tna-q label{display:flex;align-items:center;gap:8px;font-size:.78rem;margin-top:8px;color:#B7A493}
      .tna-q input[type=text]{width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border-radius:10px;border:1px solid #4A3B30;background:transparent;color:inherit;font:inherit;font-size:.84rem}
    `;
    document.head.appendChild(s);
  }

  /* ---------------- customer side ---------------- */
  let mine = [], lastLoad = 0, poll = null;
  /* A question can be about one option (one photo/version) of a product. */
  const key = (v, n, o) => v + '|' + String(n).toLowerCase() + '|' + (o || '');

  async function loadMine(force){
    if(!force && Date.now() - lastLoad < 25000) return;
    lastLoad = Date.now();
    const me = await uid(); if(!me){ mine = []; return; }
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data } = await c().from('product_questions').select('id,vendor_id,item_name,option_id,answer,answer_note,created_at,answered_at').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
    mine = data || [];
  }

  function annotate(){
    const latest = {};
    mine.forEach(q => { const k = key(q.vendor_id, q.item_name, q.option_id); if(!latest[k]) latest[k] = q; });
    document.querySelectorAll('[data-ask-vendor]').forEach(btn => {
      const q = latest[key(btn.dataset.askVendor, btn.dataset.askItem, btn.dataset.askOption)];
      let line = btn.nextElementSibling?.classList.contains('tna-said') ? btn.nextElementSibling : null;
      if(!q){ line?.remove(); return; }
      if(!line){ line = document.createElement('div'); btn.after(line); }
      line.className = 'tna-said ' + (q.answer || 'wait');
      line.textContent = q.answer === 'yes' ? `✓ Stall says it's available (${ago(q.answered_at)})`
        : q.answer === 'no' ? `✕ Stall says not available${q.answer_note ? ': ' + q.answer_note : ''}`
        : 'Waiting for the stall to answer…';
    });
  }

  function sheet(html){
    closeSheet(); styles();
    const back = document.createElement('div'); back.className = 'tna-back'; back.id = 'tnAsk';
    back.innerHTML = `<div class="tna-sheet" role="dialog" aria-modal="true">${html}</div>`;
    back.addEventListener('click', e => { if(e.target === back || e.target.closest('[data-x]')) closeSheet(); });
    document.body.appendChild(back);
    return back;
  }
  function closeSheet(){ clearInterval(poll); poll = null; document.getElementById('tnAsk')?.remove(); }

  async function ask(btn){
    const vendorId = btn.dataset.askVendor, item = btn.dataset.askItem, optionId = btn.dataset.askOption || null;
    const title = item + (btn.dataset.askLabel ? ` (${btn.dataset.askLabel})` : '');
    const me = await uid();
    if(!me){ if(typeof window.tnAuthEntry === 'function') window.tnAuthEntry(); return; }
    const stall = btn.dataset.askStall || btn.closest('.stall-card')?.querySelector('.stall-name')?.textContent?.trim() || 'the stall';
    btn.disabled = true;
    const { data, error } = await c().from('product_questions').insert({ vendor_id: vendorId, customer_id: me, item_name: item, ...(optionId ? { option_id: optionId } : {}) }).select('id').single();
    btn.disabled = false;
    if(error){ alert(error.message); return; }
    const back = sheet(`<div class="tna-top"><div><div class="tna-eye">Ask the stall</div><div class="tna-h">${esc(title)}</div></div><button type="button" class="tna-x" data-x aria-label="Close">✕</button></div>
      <div class="tna-box" id="tnaBox">We asked <b>${esc(stall)}</b> if it is still available<span class="tna-dots"></span></div>
      <div class="tna-sub">You can close this. The answer will also show on the product.</div>`);
    const addBtn = btn.parentElement?.querySelector('.prod-add, .tv-add');
    const check = async () => {
      const { data: q } = await c().from('product_questions').select('answer,answer_note,answered_at').eq('id', data.id).maybeSingle();
      if(!q?.answer) return;
      clearInterval(poll); poll = null;
      const box = back.querySelector('#tnaBox'); if(!box) return;
      box.className = 'tna-box ' + q.answer;
      box.innerHTML = q.answer === 'yes'
        ? `<b>Yes, it's available.</b>${q.answer_note ? '<br>' + esc(q.answer_note) : ''}`
        : `<b>Not available right now.</b>${q.answer_note ? '<br>' + esc(q.answer_note) : ''}`;
      if(q.answer === 'yes' && addBtn && !addBtn.disabled){
        const go = document.createElement('button'); go.type = 'button'; go.className = 'tna-go'; go.textContent = 'Add to basket';
        go.onclick = () => { addBtn.click(); closeSheet(); };
        box.after(go);
      }
      await loadMine(true); annotate();
    };
    poll = setInterval(() => { if(document.getElementById('tnAsk') && !document.hidden) check(); }, 6000);
    await loadMine(true); annotate();
  }

  /* ---------------- vendor side ---------------- */
  let vendorBooted = false;
  function host(){
    let el = document.getElementById('tnAskPanel'); if(el) return el;
    const dash = document.getElementById('dashView'); if(!dash) return null;
    el = document.createElement('section'); el.id = 'tnAskPanel'; el.hidden = true; el.setAttribute('aria-label', 'Customers asking');
    const before = document.getElementById('tnPartnerCases') || document.getElementById('ordersList');
    before && before.parentNode === dash ? dash.insertBefore(el, before) : dash.appendChild(el);
    return el;
  }
  async function loadVendor(){
    const el = host(); if(!el) return;
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data, error } = await c().from('product_questions').select('id,item_name,option_label,answer,answer_note,created_at,answered_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30);
    if(error){ el.hidden = true; return; }
    const rows = data || [];
    if(!rows.length){ el.hidden = true; el.innerHTML = ''; return; }
    const open = rows.filter(q => !q.answer);
    el.hidden = false;
    el.innerHTML = `<div class="tna-ph">Customers asking ${open.length ? `<span class="tna-badge">${open.length}</span>` : ''}</div>`
      + rows.map(q => ({ ...q, item_name: q.item_name + (q.option_label ? ` (${q.option_label})` : '') })).map(q => q.answer
        ? `<div class="tna-q done"><b>${esc(q.item_name)}</b><small>You answered ${q.answer === 'yes' ? 'Yes' : 'No'} · ${esc(ago(q.answered_at))}</small></div>`
        : `<div class="tna-q" data-q="${q.id}"><b>Is “${esc(q.item_name)}” still available?</b><small>Asked ${esc(ago(q.created_at))}. Customers buy faster when you answer quickly.</small>
            <input type="text" maxlength="140" placeholder="Optional note, e.g. new stock on Friday" data-note>
            <label><input type="checkbox" data-soldout> If No, also mark ${q.option_label ? 'this one' : 'it'} sold out</label>
            <div class="tna-row"><button type="button" class="tna-yes" data-answer="yes">Yes, I have it</button><button type="button" class="tna-no" data-answer="no">No</button></div></div>`).join('');
  }
  async function answer(btn){
    const card = btn.closest('[data-q]'); if(!card) return;
    card.querySelectorAll('button').forEach(b => b.disabled = true);
    const { error } = await c().rpc('answer_product_question', {
      p_id: Number(card.dataset.q), p_answer: btn.dataset.answer,
      p_note: card.querySelector('[data-note]')?.value || null,
      p_mark_sold_out: btn.dataset.answer === 'no' && !!card.querySelector('[data-soldout]')?.checked });
    if(error){ card.querySelectorAll('button').forEach(b => b.disabled = false); alert('Could not send your answer: ' + error.message); return; }
    loadVendor();
  }
  function bootVendor(){
    const dash = document.getElementById('dashView');
    if(vendorBooted || !dash || dash.classList.contains('hidden')) return;
    vendorBooted = true; styles(); loadVendor();
    setInterval(() => { if(!document.hidden) loadVendor(); }, 30000);
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ask-vendor]'); if(a){ e.preventDefault(); return ask(a); }
    const b = e.target.closest('#tnAskPanel [data-answer]'); if(b) return answer(b);
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.getElementById('tnAsk')) closeSheet(); });

  if(onVendor){
    const iv = setInterval(() => { bootVendor(); if(vendorBooted) clearInterval(iv); }, 600);
  } else {
    styles();
    /* Product cards are re-rendered as the customer browses; keep the
       "stall says" lines in step without hammering the database. */
    setInterval(async () => {
      if(document.hidden || !document.querySelector('[data-ask-vendor]')) return;
      await loadMine(false); annotate();
    }, 4000);
  }
  window.tnProductQuestions = { ask, loadVendor };
})();
