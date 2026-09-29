/* Tonninyira case conversation: one thread UI shared by customers, stalls,
 * riders and the Command Center.
 *   TNCase.thread(el, caseId, opts)    -> renders messages (text + photos)
 *   TNCase.composer(el, caseId, opts)  -> reply box with up to 4 photos
 * Photos are complaint evidence: stored in the private 'support-evidence'
 * bucket (TNMedia.uploadEvidence) and shown through short-lived signed links.
 * Who may read or post is enforced by the database (tn_case_party + RLS);
 * support-only notes (internal) never reach customers, stalls or riders.
 */
(function(){
  'use strict';
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const STATUS = { open:'Open', investigating:'Investigating', awaiting_customer:'Waiting for you', resolved:'Resolved', closed:'Closed' };
  const CATEGORY = { not_delivered:'Not delivered', damaged:'Arrived damaged', wrong_item:'Wrong item', missing_item:'Something missing',
                     late:'Very late', rider_conduct:'Rider behaviour', stall_conduct:'Stall behaviour', other:'Something else' };
  const MAX_PHOTOS = 4;

  function styles(){
    if(document.getElementById('tn-case-style')) return;
    const s = document.createElement('style'); s.id = 'tn-case-style';
    s.textContent = `
      .tnc-thread{display:grid;gap:10px}
      .tnc-msg{max-width:88%;padding:10px 12px;border-radius:14px;background:var(--card2,#33261C);font-size:.84rem;line-height:1.45;color:var(--sand,#F3E8D8);overflow-wrap:break-word}
      .tnc-msg.me{justify-self:end;background:#3A2A10;border:1px solid rgba(245,180,0,.35)}
      .tnc-msg.support{border:1px solid rgba(201,179,245,.4);background:#241B2E}
      .tnc-msg.internal{border:1px dashed #C9B3F5;background:#1E1826}
      .tnc-who{font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#B7A493;margin-bottom:3px}
      .tnc-msg.support .tnc-who{color:#C9B3F5}
      .tnc-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px;margin-top:8px}
      .tnc-photos a{display:block;aspect-ratio:1;border-radius:10px;background:#3A2C22 center/cover no-repeat}
      .tnc-time{font-size:.64rem;color:#9C897A;margin-top:4px}
      .tnc-empty{font-size:.8rem;color:#B7A493;text-align:center;padding:10px}
      .tnc-comp{display:grid;gap:8px;margin-top:10px}
      .tnc-comp textarea{width:100%;box-sizing:border-box;min-height:64px;padding:11px;border-radius:12px;border:1px solid #4A3B30;background:var(--ink,#1C1410);color:var(--sand,#F3E8D8);font:inherit;font-size:.88rem;resize:vertical}
      .tnc-prev{display:flex;gap:6px;flex-wrap:wrap}
      .tnc-prev span{position:relative;width:60px;height:60px;border-radius:10px;background:#3A2C22 center/cover}
      .tnc-prev button{position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:0;background:#1C1410;color:#F3E8D8;font-size:12px;cursor:pointer}
      .tnc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .tnc-btn{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid #4A3B30;background:transparent;color:var(--sand,#F3E8D8);font:inherit;font-weight:800;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
      .tnc-send{background:var(--gold,#F5B400);border-color:var(--gold,#F5B400);color:var(--ink,#1C1410);margin-left:auto}
      .tnc-note{font-size:.72rem;color:#B7A493}
      .tnc-err{font-size:.76rem;color:#FFB0A5;min-height:1em}
      .tnc-internal{display:inline-flex;gap:6px;align-items:center;font-size:.76rem;color:#C9B3F5}
      .tnc-pill{display:inline-block;padding:4px 10px;border-radius:99px;font-size:.7rem;font-weight:800;background:#3A2A10;color:var(--gold,#F5B400)}
      .tnc-pill.resolved,.tnc-pill.closed{background:#20301F;color:#9FE0B0}
      .tnc-pill.awaiting_customer{background:#3A1F1A;color:#FFB0A5}
    `;
    document.head.appendChild(s);
  }

  function whoLabel(role, mine, viewerRole){
    if(mine) return 'You';
    if(role === 'support') return 'Tonninyira support';
    if(role === 'vendor') return viewerRole === 'customer' ? 'The stall' : 'Stall';
    if(role === 'rider') return viewerRole === 'customer' ? 'Your rider' : 'Rider';
    return 'Customer';
  }
  const when = iso => { const d = new Date(iso); return d.toLocaleDateString(undefined, { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }); };

  /* Renders the conversation into el. opts: { viewerRole } */
  async function thread(el, caseId, opts = {}){
    styles();
    const client = c(); if(!client || !el) return;
    const me = (await client.auth.getSession())?.data?.session?.user?.id;
    const { data, error } = await client.from('support_messages')
      .select('id,body,created_at,sender_user_id,sender_role,attachments,internal')
      .eq('conversation_id', caseId).order('created_at');
    if(error){ el.innerHTML = `<div class="tnc-err">Could not load messages. ${esc(error.message)}</div>`; return; }
    const rows = data || [];
    const urls = window.TNMedia?.evidenceUrls ? await TNMedia.evidenceUrls(rows.flatMap(m => (m.attachments || []).map(a => a.path))) : {};
    el.innerHTML = rows.length ? `<div class="tnc-thread">${rows.map(m => {
      const mine = m.sender_user_id === me;
      const photos = (m.attachments || []).filter(a => urls[a.path]);
      return `<div class="tnc-msg ${mine ? 'me' : ''} ${m.sender_role === 'support' ? 'support' : ''} ${m.internal ? 'internal' : ''}">
        <div class="tnc-who">${esc(whoLabel(m.sender_role, mine, opts.viewerRole))}${m.internal ? ' · support-only note' : ''}</div>
        ${m.body ? `<div>${esc(m.body)}</div>` : ''}
        ${photos.length ? `<div class="tnc-photos">${photos.map((a, i) => `<a href="${esc(urls[a.path])}" target="_blank" rel="noopener" aria-label="Open photo ${i + 1}" style="background-image:url('${esc(urls[a.path])}')"></a>`).join('')}</div>` : ''}
        <div class="tnc-time">${esc(when(m.created_at))}</div></div>`;
    }).join('')}</div>` : '<div class="tnc-empty">No messages yet.</div>';
    el.scrollTop = el.scrollHeight;
  }

  /* Reply box. opts: { onSent, allowInternal, placeholder } */
  function composer(el, caseId, opts = {}){
    styles();
    let files = [];
    el.innerHTML = `<div class="tnc-comp">
      <textarea maxlength="2000" placeholder="${esc(opts.placeholder || 'Write a message…')}" aria-label="Message"></textarea>
      <div class="tnc-prev"></div>
      <div class="tnc-row">
        <button type="button" class="tnc-btn" data-a="photo">📷 Add photo</button>
        ${opts.allowInternal ? '<label class="tnc-internal"><input type="checkbox" data-a="internal"> Support-only note</label>' : ''}
        <button type="button" class="tnc-btn tnc-send" data-a="send">Send</button>
      </div>
      <div class="tnc-note">Up to ${MAX_PHOTOS} photos. Only the people on this case and Tonninyira support can see them.</div>
      <div class="tnc-err" role="status"></div></div>`;
    const ta = el.querySelector('textarea'), prev = el.querySelector('.tnc-prev'), err = el.querySelector('.tnc-err');
    const paint = () => {
      prev.innerHTML = files.map((f, i) => `<span style="background-image:url('${f.preview}')"><button type="button" data-rm="${i}" aria-label="Remove photo">✕</button></span>`).join('');
      el.querySelector('[data-a=photo]').disabled = files.length >= MAX_PHOTOS;
    };
    el.addEventListener('click', async e => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.dataset.rm != null){ URL.revokeObjectURL(files[+b.dataset.rm].preview); files.splice(+b.dataset.rm, 1); paint(); return; }
      if(b.dataset.a === 'photo'){
        const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
        i.onchange = () => { [...(i.files || [])].slice(0, MAX_PHOTOS - files.length).forEach(f => files.push({ file: f, preview: URL.createObjectURL(f) })); paint(); };
        i.click(); return;
      }
      if(b.dataset.a === 'send'){
        const body = ta.value.trim();
        if(!body && !files.length){ err.textContent = 'Write a message or add a photo.'; return; }
        b.disabled = true; err.textContent = '';
        try{
          const attachments = [];
          for(const [n, f] of files.entries()){ b.textContent = `Uploading photo ${n + 1}/${files.length}…`; attachments.push(await TNMedia.uploadEvidence(f.file, caseId)); }
          b.textContent = 'Sending…';
          const client = c(); const me = (await client.auth.getSession())?.data?.session?.user?.id;
          const internal = !!el.querySelector('[data-a=internal]')?.checked;
          const { error } = await client.from('support_messages').insert({ conversation_id: caseId, sender_user_id: me, body, attachments, internal });
          if(error) throw error;
          files.forEach(f => URL.revokeObjectURL(f.preview)); files = []; ta.value = ''; paint();
          opts.onSent?.();
        }catch(ex){
          const m = String(ex?.message || ex);
          err.textContent = /row-level security/i.test(m) ? 'This case is closed, so no more messages can be added.' : 'Not sent: ' + m;
        }finally{ b.disabled = false; b.textContent = 'Send'; }
      }
    });
    paint();
  }

  window.TNCase = { thread, composer, styles, STATUS, CATEGORY, esc };
})();
