/* Tonninyira "Get help with this order".
 * On each paid order card (Orders tab) the customer gets, in this order:
 *   1. their rider   - Call / WhatsApp
 *   2. the stall(s)  - Call / WhatsApp
 *   3. "Still not sorted?" - report a problem to Tonninyira with photo proof
 * Phone numbers come from order_contacts(), which only answers for the
 * customer's own paid order and only until 48 h after delivery.
 * A report becomes a case (support_conversations with order_id + case_ref);
 * its conversation is shared with support and the stall/rider on that order.
 */
(function(){
  'use strict';
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const intl = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('256') ? d : d.startsWith('0') ? '256' + d.slice(1) : d.length === 9 ? '256' + d : d; };
  let cases = {}, poll = null;

  const ICON = {
    phone:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    chat:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/></svg>'
  };

  function styles(){
    window.TNCase?.styles?.();
    if(document.getElementById('tn-help-style')) return;
    const s = document.createElement('style'); s.id = 'tn-help-style';
    s.textContent = `
      .tn-help-slot:empty{display:none}
      .tn-help-slot{margin-top:10px;display:grid;gap:8px}
      .tnh-open{min-height:44px;border-radius:12px;border:1px solid rgba(245,180,0,.45);background:transparent;color:var(--gold);font:inherit;font-weight:800;font-size:.84rem;cursor:pointer}
      .tnh-case{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:#241B2E;border:1px solid #45355A;cursor:pointer;color:inherit;font:inherit;text-align:left;width:100%}
      .tnh-case b{display:block;font-size:.82rem}.tnh-case small{display:block;font-size:.72rem;color:#B7A493}
      .tnh-back{position:fixed;inset:0;z-index:10030;background:rgba(0,0,0,.72);display:grid;place-items:end center}
      .tnh-sheet{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--ink);color:var(--sand);border-radius:22px 22px 0 0;padding:18px 16px calc(24px + env(safe-area-inset-bottom));font-family:'Work Sans',sans-serif}
      .tnh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}
      .tnh-eye{font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
      .tnh-h{font-size:1.15rem;font-weight:800;margin-top:3px}
      .tnh-x{width:44px;height:44px;border-radius:50%;border:0;background:var(--card);color:var(--sand);font-size:1.2rem;cursor:pointer;flex-shrink:0}
      .tnh-step{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:12px 0;border-top:1px solid #3A2E26}
      .tnh-n{width:28px;height:28px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;color:var(--gold)}
      .tnh-step b{display:block;font-size:.92rem}.tnh-sub{font-size:.76rem;color:#B7A493;line-height:1.45;margin-top:2px}
      .tnh-person{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
      .tnh-person .who{grid-column:1/-1}.tnh-person .who b{font-size:.88rem}
      .tnh-person .tnh-btn{justify-content:center}
      .tnh-btn{min-height:44px;padding:0 14px;border-radius:12px;border:0;display:inline-flex;align-items:center;gap:6px;font:inherit;font-weight:800;font-size:.82rem;text-decoration:none;background:var(--card2);color:var(--sand);cursor:pointer}
      .tnh-btn.wa{background:#1F3A26;color:#9FE0B0}
      .tnh-primary{min-height:50px;width:100%;border-radius:14px;border:0;background:var(--gold);color:var(--ink);font:inherit;font-weight:800;font-size:.95rem;cursor:pointer;margin-top:10px}
      .tnh-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      .tnh-chips button{min-height:40px;padding:0 12px;border-radius:99px;border:1px solid #4A3B30;background:transparent;color:var(--sand);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
      .tnh-chips button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:var(--ink)}
      .tnh-label{display:block;font-size:.78rem;font-weight:800;margin-top:14px}
      .tnh-sheet textarea{width:100%;box-sizing:border-box;min-height:90px;margin-top:6px;padding:11px;border-radius:12px;border:1px solid #4A3B30;background:var(--card);color:var(--sand);font:inherit;font-size:.88rem}
      .tnh-err{font-size:.78rem;color:#FFB0A5;min-height:1.2em;margin-top:8px}
      .tnh-res{padding:12px;border-radius:14px;background:#20301F;border:1px solid #3D6B45;font-size:.84rem;margin:10px 0}
      .tnh-thread{max-height:46vh;overflow:auto;margin-top:10px}
    `;
    document.head.appendChild(s);
  }

  function sheet(html){
    close(); styles();
    const back = document.createElement('div'); back.className = 'tnh-back'; back.id = 'tnHelp';
    back.innerHTML = `<div class="tnh-sheet" role="dialog" aria-modal="true">${html}</div>`;
    back.addEventListener('click', e => { if(e.target === back || e.target.closest('[data-x]')) close(); });
    document.body.appendChild(back); document.documentElement.style.overflow = 'hidden';
    back.querySelector('.tnh-x')?.focus();
    return back;
  }
  function close(){ clearInterval(poll); poll = null; document.getElementById('tnHelp')?.remove(); document.documentElement.style.overflow = ''; }
  const head = (eye, title) => `<div class="tnh-top"><div><div class="tnh-eye">${esc(eye)}</div><div class="tnh-h">${esc(title)}</div></div><button type="button" class="tnh-x" data-x aria-label="Close">✕</button></div>`;

  function person(name, sub, phone, orderId, greet){
    const tel = intl(phone), msg = encodeURIComponent(`Hello ${greet || name}, this is about my Tonninyira order ${orderId}.`);
    return `<div class="tnh-person"><div class="who"><b>${esc(name)}</b><div class="tnh-sub">${esc(sub)}</div></div>
      <a class="tnh-btn" href="tel:+${tel}">${ICON.phone}Call</a>
      <a class="tnh-btn wa" href="https://wa.me/${tel}?text=${msg}" target="_blank" rel="noopener">${ICON.chat}WhatsApp</a></div>`;
  }

  async function openHelp(orderId){
    const existing = cases[orderId];
    const back = sheet(`${head('Get help', 'Order ' + orderId)}
      <p class="tnh-sub" style="margin:0 0 6px">Most problems are fixed fastest by talking to your rider or the stall directly.</p>
      <div id="tnhContacts"><div class="tnh-sub">Loading contacts…</div></div>
      <div class="tnh-step"><span class="tnh-n">3</span><div><b>Still not sorted?</b>
        <div class="tnh-sub">Tell Tonninyira what went wrong. You can add photos as proof. Support, the stall and the rider on this order will see it.</div>
        <button type="button" class="tnh-primary" id="tnhReport">${existing ? 'View your case ' + esc(existing.case_ref) : 'Report a problem'}</button></div></div>`);
    back.querySelector('#tnhReport').onclick = () => existing ? openCase(existing.id) : openReport(orderId);
    const box = back.querySelector('#tnhContacts');
    try{
      const { data, error } = await c().rpc('order_contacts', { p_order_id: orderId });
      if(error) throw error;
      if(!data?.available){
        const why = { expired: 'Contact details are no longer shown for this order (more than 48 hours after delivery).', unpaid: 'This order was not paid, so no rider or stall was assigned.', cancelled: 'This order was cancelled.' }[data?.reason] || 'Contact details are not available for this order.';
        box.innerHTML = `<div class="tnh-step"><span class="tnh-n">1</span><div><b>Rider and stall</b><div class="tnh-sub">${esc(why)}</div></div></div>`;
        return;
      }
      const r = data.rider;
      box.innerHTML = `
        <div class="tnh-step"><span class="tnh-n">1</span><div><b>Talk to your rider</b>
          ${r ? person(r.name || 'Your rider', [r.vehicle, r.plate].filter(Boolean).join(' · ') || 'Your rider', r.phone, orderId) : '<div class="tnh-sub">No rider has been assigned yet. You will be able to reach them here once one accepts.</div>'}</div></div>
        <div class="tnh-step"><span class="tnh-n">2</span><div><b>Talk to the stall</b>
          ${(data.stalls || []).map(s => person(s.stall, s.owner ? 'Ask for ' + s.owner : 'Stall', s.phone, orderId, s.owner)).join('') || '<div class="tnh-sub">The stall has no phone number on file.</div>'}</div></div>`;
    }catch(e){ box.innerHTML = `<div class="tnh-err">Could not load contacts: ${esc(e.message || e)}</div>`; }
  }

  function openReport(orderId){
    let cat = null, tried = null, files = [];
    const back = sheet(`${head('Report a problem', 'Order ' + orderId)}
      <span class="tnh-label">What went wrong?</span>
      <div class="tnh-chips" id="tnhCat">${Object.entries(TNCase.CATEGORY).map(([k, v]) => `<button type="button" data-cat="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>
      <span class="tnh-label">Did you already talk to the rider or the stall?</span>
      <div class="tnh-chips" id="tnhTried"><button type="button" data-tried="yes" aria-pressed="false">Yes</button><button type="button" data-tried="unreachable" aria-pressed="false">I couldn't reach them</button><button type="button" data-tried="no" aria-pressed="false">Not yet</button></div>
      <label class="tnh-label" for="tnhDesc">Tell us what happened</label>
      <textarea id="tnhDesc" maxlength="2000" placeholder="E.g. the bag arrived with a torn strap."></textarea>
      <span class="tnh-label">Photos (up to 4) <span class="tnh-sub" style="font-weight:600">— optional, but they help us decide quickly</span></span>
      <div class="tnc-prev" id="tnhPrev" style="margin-top:6px"></div>
      <button type="button" class="tnh-btn" id="tnhAdd" style="margin-top:8px">📷 Add photos</button>
      <div class="tnh-err" id="tnhErr" role="status"></div>
      <button type="button" class="tnh-primary" id="tnhSend">Send to Tonninyira</button>`);
    const paint = () => { back.querySelector('#tnhPrev').innerHTML = files.map((f, i) => `<span style="background-image:url('${f.preview}')"><button type="button" data-rm="${i}" aria-label="Remove photo">✕</button></span>`).join(''); back.querySelector('#tnhAdd').disabled = files.length >= 4; };
    back.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.cat){ cat = b.dataset.cat; back.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      if(b.dataset.tried){ tried = b.dataset.tried; back.querySelectorAll('[data-tried]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
      if(b.dataset.rm != null){ URL.revokeObjectURL(files[+b.dataset.rm].preview); files.splice(+b.dataset.rm, 1); paint(); }
    });
    back.querySelector('#tnhAdd').onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
      i.onchange = () => { [...(i.files || [])].slice(0, 4 - files.length).forEach(f => files.push({ file: f, preview: URL.createObjectURL(f) })); paint(); };
      i.click();
    };
    back.querySelector('#tnhSend').onclick = async () => {
      const err = back.querySelector('#tnhErr'), btn = back.querySelector('#tnhSend'), desc = back.querySelector('#tnhDesc').value.trim();
      if(!cat) return err.textContent = 'Choose what went wrong.';
      if(!tried) return err.textContent = 'Tell us whether you already talked to the rider or the stall.';
      if(desc.length < 10) return err.textContent = 'Please describe the problem in a sentence or two.';
      btn.disabled = true; btn.textContent = 'Opening your case…'; err.textContent = '';
      const client = c(); const me = (await client.auth.getSession())?.data?.session?.user?.id;
      const { data: cs, error } = await client.from('support_conversations')
        .insert({ customer_id: me, order_id: orderId, category: cat, tried_contact: tried }).select('id,case_ref,status').single();
      if(error){ btn.disabled = false; btn.textContent = 'Send to Tonninyira'; err.textContent = 'Could not open the case: ' + error.message; return; }
      const attachments = [], failed = [];
      for(const [n, f] of files.entries()){
        btn.textContent = `Uploading photo ${n + 1} of ${files.length}…`;
        try{ attachments.push(await TNMedia.uploadEvidence(f.file, cs.id)); }catch(_){ failed.push(n + 1); }
      }
      await client.from('support_messages').insert({ conversation_id: cs.id, sender_user_id: me, body: desc, attachments });
      files.forEach(f => URL.revokeObjectURL(f.preview));
      cases[orderId] = cs;
      openCase(cs.id, failed.length ? `Photo ${failed.join(', ')} could not be uploaded. Add it again below.` : null);
      mount(true);
    };
  }

  async function openCase(caseId, notice){
    const client = c();
    const { data: cs, error } = await client.from('support_conversations').select('id,case_ref,order_id,status,category,resolution,refund_due').eq('id', caseId).maybeSingle();
    if(error || !cs) return sheet(`${head('Your case', '')}<div class="tnh-err">Could not open this case.</div>`);
    const back = sheet(`${head('Case ' + (cs.case_ref || ''), TNCase.CATEGORY[cs.category] || 'Your case')}
      <div class="tnh-sub">Order ${esc(cs.order_id)} · <span class="tnc-pill ${esc(cs.status)}">${esc(TNCase.STATUS[cs.status] || cs.status)}</span></div>
      ${notice ? `<div class="tnh-err">${esc(notice)}</div>` : ''}
      ${cs.resolution ? `<div class="tnh-res"><b>Decision:</b> ${esc(cs.resolution)}${cs.refund_due ? '<br>A refund is being arranged.' : ''}</div>` : ''}
      <div class="tnh-thread" id="tnhThread"></div>
      <div id="tnhComp"></div>`);
    const refresh = () => TNCase.thread(back.querySelector('#tnhThread'), cs.id, { viewerRole: 'customer' });
    await refresh();
    if(cs.status !== 'closed') TNCase.composer(back.querySelector('#tnhComp'), cs.id, { onSent: refresh, placeholder: 'Add more details or reply…' });
    else back.querySelector('#tnhComp').innerHTML = '<div class="tnh-sub" style="margin-top:10px">This case is closed. Open a new report from the order if something else goes wrong.</div>';
    poll = setInterval(() => { if(document.getElementById('tnHelp') && !document.hidden) refresh(); }, 15000);
  }

  /* Adds the Get help button (and any case status) to each paid order card. */
  async function mount(force){
    const slots = [...document.querySelectorAll('.tn-help-slot')].filter(s => force || !s.dataset.ready);
    if(!slots.length) return;
    slots.forEach(s => s.dataset.ready = '1');
    const ids = [...new Set(slots.map(s => s.dataset.order))];
    try{
      const client = c(); const me = (await client.auth.getSession())?.data?.session?.user?.id;
      if(me){
        const { data } = await client.from('support_conversations').select('id,case_ref,order_id,status,updated_at').eq('customer_id', me).in('order_id', ids).order('created_at', { ascending: false });
        (data || []).forEach(x => { if(!cases[x.order_id]) cases[x.order_id] = x; });
      }
    }catch(_){}
    styles();
    slots.forEach(s => {
      const id = s.dataset.order, cs = cases[id];
      if(!s.dataset.paid && !cs){ s.innerHTML = ''; return; }
      s.innerHTML = (cs ? `<button type="button" class="tnh-case" data-case="${esc(cs.id)}"><span style="flex:1;min-width:0"><b>Case ${esc(cs.case_ref || '')}</b><small>${esc(TNCase.STATUS[cs.status] || cs.status)} · tap to view</small></span><span class="tnc-pill ${esc(cs.status)}">${esc(TNCase.STATUS[cs.status] || cs.status)}</span></button>` : '')
        + (s.dataset.paid && !s.dataset.cancelled ? `<button type="button" class="tnh-open" data-help="${esc(id)}">Get help with this order</button>` : '');
    });
  }
  document.addEventListener('click', e => {
    const h = e.target.closest('.tn-help-slot [data-help]'); if(h) return openHelp(h.dataset.help);
    const k = e.target.closest('.tn-help-slot [data-case]'); if(k) return openCase(k.dataset.case);
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.getElementById('tnHelp')) close(); });
  window.tnOrderHelp = { mount, openHelp, openCase };
  /* The Orders tab may have rendered before this script loaded. */
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount()); else setTimeout(() => mount(), 0);
})();
