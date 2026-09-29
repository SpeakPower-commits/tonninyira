/* Tonninyira rider home: AI power with a human feel.
 * Rebuilds rider-dashboard.html into four tabs (Home, Deliveries, Earnings, Me)
 * with a bottom bar, and moves the sections other scripts add into the right
 * tab instead of stacking them in one long page:
 *   Home       greeting, Online switch, today's goal ring, Tonninyira Assist,
 *              live delivery requests (rider-nearby-dispatch.js), current delivery
 *   Deliveries step-by-step delivery cards with Call / WhatsApp / Maps
 *   Earnings   earnings (partner-dashboard-auth-earnings.js) and wallet (partner-wallet-payouts.js)
 *   Me         account details, vehicle, sign out
 * Tonninyira Assist reads rider_assist(): patterns from the last 30 days of
 * paid orders plus the rider's own week. It is honest when data is thin.
 */
(function(){
  'use strict';
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const ugx = n => 'UGX ' + Math.round(Number(n||0)).toLocaleString('en-US');
  const rider = () => { try{ return typeof currentRider!=='undefined' ? currentRider : null }catch(_){ return null } };
  const GOAL_KEY = 'tn_rider_goal', TAB_KEY = 'tn_rider_tab';
  let profile = null, assist = null, lastRows = [], booted = false;

  const ICON = {
    home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    deliv:'<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h5l3 8M10 9l-1-3H6"/>',
    earn:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    me:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    spark:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    shield:'<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
    pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    check:'<path d="M5 12l5 5 9-10"/>',
    paid:'<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'
  };
  const svg = (k, size=20, sw=2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  const TIPS = [
    'Helmet on, phone in the holder. Your safety matters more than any delivery.',
    'Check the parcel with the stall before you leave: right items, sealed, nothing missing.',
    'Ask the customer to read out the order number before you hand it over.',
    'Rain on the way? Keep food and bags covered; customers remember riders who care.',
    'Never ride while reading the app. Pull over, then check your next step.'
  ];

  function styles(){
    if(document.getElementById('rh-style')) return;
    const s = document.createElement('style'); s.id = 'rh-style';
    s.textContent = `
      body.rh-on header{display:none}
      body.rh-on{padding-bottom:96px}
      body.rh-on .wrap{padding-top:18px}
      #dashView.rh > .top-bar, #dashView.rh > p.helper, #dashView.rh > .btn-secondary{display:none}
      #dashView.rh [data-pane]{display:none}
      #dashView.rh[data-tab=home] [data-pane=home],#dashView.rh[data-tab=deliv] [data-pane=deliv],
      #dashView.rh[data-tab=earn] [data-pane=earn],#dashView.rh[data-tab=me] [data-pane=me]{display:grid;gap:14px}
      .rh-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
      .rh-av{width:54px;height:54px;border-radius:50%;background:var(--gold) center/cover;color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;flex-shrink:0}
      .rh-hi{font-family:'Alfa Slab One',serif;font-weight:400;font-synthesis:none;font-size:1.35rem;line-height:1.15;overflow-wrap:break-word}
      .rh-sub{font-size:.8rem;color:#B7A493;margin-top:3px;line-height:1.4}
      .rh-card{background:var(--card);border-radius:22px;padding:16px}
      .rh-eye{font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
      .rh-online{display:flex;align-items:center;gap:12px;border-radius:20px;padding:14px 16px;background:#20301F;border:1px solid #3D6B45}
      .rh-online.off{background:var(--card);border-color:#4A3B30}
      .rh-dot{width:10px;height:10px;border-radius:50%;background:#6FD08A;flex-shrink:0}
      .rh-online.off .rh-dot{background:#7D6C5E}
      .rh-online b{display:block;font-size:1rem}
      .rh-online small{display:block;font-size:.74rem;color:#B9CDB9;margin-top:2px;line-height:1.35}
      .rh-online.off small{color:#B7A493}
      .rh-switch{width:58px;height:34px;border-radius:99px;border:0;background:#6FD08A;position:relative;flex-shrink:0;cursor:pointer}
      .rh-switch::after{content:'';position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:#10200F;transition:right .2s}
      .rh-switch[aria-checked=false]{background:#4A3B30}.rh-switch[aria-checked=false]::after{right:28px;background:#B7A493}
      #tnDispatchStatus{margin:0!important;font-size:.72rem!important;border-radius:14px!important}
      .rh-today{display:flex;gap:14px;align-items:center}
      .rh-ring{width:96px;height:96px;position:relative;flex-shrink:0}
      .rh-ring div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
      .rh-ring b{font-size:1.2rem}.rh-ring span{font-size:.62rem;color:#B7A493}
      .rh-big{font-family:'Alfa Slab One',serif;font-weight:400;font-synthesis:none;font-size:1.45rem}
      .rh-link{background:none;border:0;color:var(--gold);font:inherit;font-weight:700;font-size:.78rem;cursor:pointer;padding:6px 2px;text-decoration:underline}
      .rh-assist{background:#241B2E;border:1px solid #45355A}
      .rh-assist .rh-eye{color:#C9B3F5;display:flex;align-items:center;gap:8px;letter-spacing:.08em}
      .rh-assist .rh-tag{margin-left:auto;font-size:.62rem;letter-spacing:0;text-transform:none;font-weight:700;border:1px solid #45355A;border-radius:99px;padding:3px 8px}
      .rh-says{font-size:.98rem;line-height:1.5;margin:10px 0 12px}
      .rh-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .rh-chip{background:#33261C;border-radius:14px;padding:9px 10px;min-width:0}
      .rh-chip span{display:block;font-size:.66rem;color:#B7A493}.rh-chip b{display:block;font-size:.8rem;overflow-wrap:break-word;margin-top:2px}
      .rh-foot{font-size:.7rem;color:#9D8FB5;margin-top:10px;line-height:1.4}
      .rh-line{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:18px;padding:12px 14px;font-size:.84rem;line-height:1.4}
      .rh-line svg{flex-shrink:0}
      .rh-now{display:flex;align-items:center;gap:12px;background:var(--card);border:2px solid var(--gold);border-radius:20px;padding:14px 16px;cursor:pointer;color:inherit;font:inherit;text-align:left;width:100%}
      .rh-now b{display:block}.rh-now small{display:block;font-size:.76rem;color:#B7A493;margin-top:2px}
      #tnNearbyOffers{margin:0!important;gap:12px!important}
      #tnNearbyOffers:empty{display:none!important}
      .tn-offer{border:2px solid var(--gold)!important;border-radius:22px!important;padding:16px!important;background:var(--card)!important}
      .tn-offer-title{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem}
      .tn-offer-btn{min-height:52px;border-radius:16px!important;font-size:.95rem}
      .tn-offer-accept{background:#6FD08A!important;color:#10200F!important}
      .rh-nav{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#221913;border-top:1px solid #332820;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:8px 8px calc(10px + env(safe-area-inset-bottom))}
      .rh-nav button{min-height:52px;border:0;background:none;color:#9C897A;font:inherit;font-size:.7rem;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;position:relative}
      .rh-nav button[aria-current=page]{color:var(--gold)}
      .rh-badge{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;border-radius:99px;background:var(--red);color:#fff;font-size:.62rem;display:flex;align-items:center;justify-content:center;padding:0 5px}
      .rh-h2{font-family:'Alfa Slab One',serif;font-weight:400;font-synthesis:none;font-size:1.25rem;margin:4px 0 0}
      .rh-deliv{background:var(--card);border-radius:22px;padding:16px;display:grid;gap:14px}
      .rh-deliv.done{opacity:.6}
      .rh-dhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .rh-dhead b{font-size:1rem}.rh-dhead small{display:block;font-size:.72rem;color:#B7A493;margin-top:2px}
      .rh-pill{padding:6px 11px;border-radius:99px;font-size:.7rem;font-weight:800;white-space:nowrap;background:#3A2A10;color:var(--gold)}
      .rh-pill.ready{background:#20301F;color:#9FE0B0}.rh-pill.done{background:#33261C;color:#B7A493}
      .rh-steps{list-style:none;margin:0;padding:0;display:grid}
      .rh-steps li{display:flex;gap:12px;position:relative;padding-bottom:14px;font-size:.88rem}
      .rh-steps li:last-child{padding-bottom:0}
      .rh-steps li::before{content:'';position:absolute;left:10px;top:24px;bottom:0;width:2px;background:#4A3B30}
      .rh-steps li:last-child::before{display:none}
      .rh-steps li.ok::before{background:#6FD08A}
      .rh-steps i{width:22px;height:22px;border-radius:50%;border:2px solid #4A3B30;flex-shrink:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
      .rh-steps li.ok i{background:#6FD08A;border-color:#6FD08A;color:#10200F}
      .rh-steps li.now i{border:5px solid var(--gold)}
      .rh-steps li.now b{color:var(--gold)}.rh-steps li.todo b{color:#9C897A}
      .rh-steps small{display:block;font-size:.72rem;color:#B7A493;margin-top:1px;overflow-wrap:break-word}
      .rh-who{display:flex;align-items:center;gap:12px}
      .rh-who .rh-av{width:46px;height:46px;font-size:.95rem;background:#3A2A4A;color:#E4D6FF}
      .rh-who .rh-av.stall{border-radius:14px;background:var(--red);color:#fff}
      .rh-who b{display:block;overflow-wrap:break-word}.rh-who small{display:block;font-size:.74rem;color:#B7A493}
      .rh-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}
      .rh-btn{min-height:46px;border-radius:14px;border:0;display:flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:800;font-size:.82rem;text-decoration:none;background:#33261C;color:var(--sand);cursor:pointer}
      .rh-btn.wa{background:#1F3A26;color:#9FE0B0}.rh-btn.map{background:transparent;border:1px solid rgba(245,180,0,.5);color:var(--gold)}
      .rh-paid{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;background:#20301F;border:1px solid #3D6B45;font-size:.84rem}
      .rh-go{min-height:58px;border-radius:18px;border:0;background:var(--gold);color:var(--ink);font:inherit;font-weight:800;font-size:1.02rem;cursor:pointer;width:100%}
      .rh-go.pick{background:#6FD08A;color:#10200F}
      .rh-wait{font-size:.8rem;color:#B7A493;text-align:center}
      .rh-sep{height:1px;background:#3A2E26}
      .rh-empty{text-align:center;padding:26px 16px;background:var(--card);border-radius:22px;color:#B7A493;font-size:.86rem;line-height:1.5}
      .rh-empty b{display:block;color:var(--sand);font-size:1rem;margin-bottom:4px}
      .rh-example{border:1px dashed var(--gold);border-radius:16px;padding:12px;font-size:.8rem;color:#B7A493}
      .rh-example b{color:var(--gold)}
      .rh-signout{min-height:50px;border-radius:16px;border:1px solid rgba(226,63,37,.5);background:transparent;color:#FFB0A5;font:inherit;font-weight:800;cursor:pointer;width:100%}
      #tn-wallet-card,#ptaEarnings,#ptaAccount{margin:0!important}
    `;
    document.head.appendChild(s);
  }

  /* ---------- layout ---------- */
  const PLACE = { tnDispatchStatus:'home-status', tnNearbyOffers:'home-offers', tnRiderAlerts:'deliv-alerts', tnPartnerCases:'deliv-cases', deliveriesList:'deliv-list',
                  ptaEarnings:'earn-summary', 'tn-wallet-card':'earn-wallet', ptaAccount:'me-account' };
  function place(){
    for(const [id, slot] of Object.entries(PLACE)){
      const el = document.getElementById(id), host = document.querySelector(`[data-slot="${slot}"]`);
      if(el && host && el.parentElement !== host) host.appendChild(el);
    }
  }
  function build(dash){
    const first = (rider()?.full_name || 'Rider').trim().split(/\s+/)[0];
    const head = document.createElement('div'); head.className = 'rh-head'; head.id = 'rhHead';
    head.innerHTML = `<div class="rh-av" id="rhAvatar">${esc(first.slice(0,2).toUpperCase())}</div><div style="min-width:0"><div class="rh-hi" id="rhHello"></div><div class="rh-sub">Webale kukola — thanks for keeping Kampala moving.</div></div>`;
    dash.prepend(head);
    const panes = document.createElement('div'); panes.id = 'rhPanes';
    panes.innerHTML = `
      <section data-pane="home" aria-label="Home">
        <div class="rh-online" id="rhOnline"><span class="rh-dot"></span><div style="flex:1;min-width:0"><b id="rhOnlineT"></b><small id="rhOnlineS"></small></div><button type="button" class="rh-switch" id="rhSwitch" role="switch" aria-label="Online"></button></div>
        <div data-slot="home-status"></div>
        <div data-slot="home-offers"></div>
        <div id="rhNow"></div>
        <div class="rh-card" id="rhToday"></div>
        <div class="rh-card rh-assist" id="rhAssist"></div>
        <div id="rhLines"></div>
      </section>
      <section data-pane="deliv" aria-label="Deliveries"><div><div class="rh-eye">Deliveries</div><div class="rh-h2">Your deliveries</div></div><div data-slot="deliv-alerts"></div><div data-slot="deliv-cases"></div><div data-slot="deliv-list"></div></section>
      <section data-pane="earn" aria-label="Earnings"><div><div class="rh-eye">Earnings</div><div class="rh-h2">What you've earned</div></div><div data-slot="earn-summary"></div><div data-slot="earn-wallet"></div></section>
      <section data-pane="me" aria-label="Me"><div class="rh-card" id="rhMe"></div><div data-slot="me-account"></div>
        <a class="rh-btn map" href="index.html" style="min-height:50px">Back to the Tonninyira market</a>
        <button type="button" class="rh-signout" id="rhSignOut">Sign out</button></section>`;
    dash.appendChild(panes);
    const nav = document.createElement('nav'); nav.className = 'rh-nav'; nav.id = 'rhNav'; nav.setAttribute('aria-label', 'Rider sections');
    nav.innerHTML = [['home','Home'],['deliv','Deliveries'],['earn','Earnings'],['me','Me']]
      .map(([k, l]) => `<button type="button" data-tab="${k}">${svg(k, 22)}${l}${k==='deliv'?'<span class="rh-badge" id="rhBadge" hidden></span>':''}</button>`).join('');
    document.body.appendChild(nav);
    nav.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b) tab(b.dataset.tab); });
    dash.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if(b) tab(b.dataset.goto); });
    document.getElementById('rhSwitch').onclick = () => setOnline(!online());
    document.getElementById('rhSignOut').onclick = signOut;
    let q = false;
    new MutationObserver(() => { if(q) return; q = true; requestAnimationFrame(() => { q = false; place(); }); }).observe(document.body, { childList: true, subtree: true });
    place();
  }
  function tab(k){
    const dash = document.getElementById('dashView'); dash.dataset.tab = k;
    document.querySelectorAll('#rhNav [data-tab]').forEach(b => { if(b.dataset.tab === k) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    try{ sessionStorage.setItem(TAB_KEY, k); }catch(_){}
    window.scrollTo(0, 0);
  }

  /* ---------- online ---------- */
  function online(){ try{ return localStorage.getItem('tn_rider_online') !== '0'; }catch(_){ return true; } }
  function setOnline(on){
    if(window.tnDispatch) window.tnDispatch.setOnline(on); else { try{ localStorage.setItem('tn_rider_online', on ? '1' : '0'); }catch(_){} }
    paintOnline();
  }
  function paintOnline(){
    const on = online();
    document.getElementById('rhOnline')?.classList.toggle('off', !on);
    const sw = document.getElementById('rhSwitch'); if(sw){ sw.setAttribute('aria-checked', String(on)); sw.setAttribute('aria-label', on ? 'Go offline' : 'Go online'); }
    const t = document.getElementById('rhOnlineT'), s = document.getElementById('rhOnlineS');
    if(t) t.textContent = on ? "You're online" : "You're offline";
    if(s) s.textContent = on ? 'Your location is shared only while you are online, so nearby customers reach you first.' : 'Location sharing is off. Requests open to all riders still appear here.';
  }

  /* ---------- home ---------- */
  function hello(){
    const h = new Date().getHours(), first = (profile?.full_name || rider()?.full_name || 'Rider').trim().split(/\s+/)[0];
    const el = document.getElementById('rhHello'); if(el) el.textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${first}`;
    const av = document.getElementById('rhAvatar');
    if(av && profile?.photo_url && /^https:\/\//.test(profile.photo_url)){ av.style.backgroundImage = `url("${profile.photo_url.replace(/"/g, '%22')}")`; av.textContent = ''; }
  }
  const hourLabel = h => { const a = h % 12 || 12, b = (h + 1) % 12 || 12; return `${a}–${b} ${h + 1 < 12 || h + 1 === 24 ? 'am' : 'pm'}`; };
  function goal(){ try{ return Math.max(1000, Number(localStorage.getItem(GOAL_KEY)) || 20000); }catch(_){ return 20000; } }
  function paintHome(){
    const me = assist?.me || {}, g = goal(), earned = Number(me.today_earned || 0), pct = Math.min(1, earned / g);
    const circ = 2 * Math.PI * 40;
    document.getElementById('rhToday').innerHTML = `<div class="rh-today">
      <div class="rh-ring"><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40" fill="none" stroke="#3A2E26" stroke-width="10"/><circle cx="48" cy="48" r="40" fill="none" stroke="#F5B400" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(circ * pct).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 48 48)"/></svg><div><b>${Math.round(pct * 100)}%</b><span>of goal</span></div></div>
      <div style="min-width:0"><div class="rh-eye">Today</div><div class="rh-big">${ugx(earned)}</div>
      <div class="rh-sub">Your goal: ${ugx(g)} · <button type="button" class="rh-link" id="rhGoal">change</button></div>
      <div class="rh-sub" style="color:var(--sand)"><b>${Number(me.today_deliveries || 0)}</b> delivered today · <b>${Number(me.week_deliveries || 0)}</b> this week</div></div></div>`;
    document.getElementById('rhGoal').onclick = () => {
      const v = prompt('Your daily earnings goal in UGX', String(g)); const n = Number(String(v || '').replace(/[^\d]/g, ''));
      if(n >= 1000){ try{ localStorage.setItem(GOAL_KEY, String(n)); }catch(_){} paintHome(); }
    };

    const a = assist || {}, n = Number(a.sample_orders || 0), hours = a.hours || [], areas = (a.areas_this_hour && a.areas_this_hour.length ? a.areas_this_hour : (a.areas || []).map(x => x.area));
    const nowH = new Date().getHours();
    const next = hours.map(x => x.hour).sort((x, y) => ((x - nowH + 24) % 24) - ((y - nowH + 24) % 24))[0];
    let says;
    if(Number(me.active || 0) > 0) says = `Finish your current delivery first — the customer has already paid and is waiting${areas[0] ? ` in <b>${esc(areas[0])}</b>` : ''}.`;
    else if(next != null) says = `Orders usually come in around <b>${esc(hourLabel(next))}</b>${areas[0] ? ` near <b>${esc(areas[0])}</b>` : ''}. ${next === nowH ? 'That is now — stay online.' : 'Be online a little before then.'}`;
    else says = 'No order history yet. Stay online — a request appears here the moment a customer pays.';
    document.getElementById('rhAssist').innerHTML = `
      <div class="rh-eye">${svg('spark', 18)}Tonninyira Assist<span class="rh-tag">from our orders</span></div>
      <div class="rh-says">${says}</div>
      <div class="rh-chips">
        <div class="rh-chip"><span>Best hours</span><b>${hours.length ? hours.slice(0, 2).map(x => esc(hourLabel(x.hour))).join(', ') : '—'}</b></div>
        <div class="rh-chip"><span>Busy areas</span><b>${areas.length ? areas.slice(0, 2).map(esc).join(', ') : '—'}</b></div>
        <div class="rh-chip"><span>Per delivery</span><b>${a.avg_minutes ? '~' + a.avg_minutes + ' min' : '—'}</b></div>
      </div>
      <div class="rh-foot">${n < 10 ? `Still learning: based on only ${n} paid order${n === 1 ? '' : 's'} in the last 30 days. It gets sharper as orders come in.` : `Based on ${n} paid Tonninyira orders in the last 30 days.`}</div>`;

    const wk = Number(me.week_deliveries || 0), best = Number(me.best_past_week || 0);
    const milestone = wk > 0 && wk > best ? `<b>${wk} deliver${wk === 1 ? 'y' : 'ies'} this week</b> — your best week yet.`
      : wk > 0 ? `<b>${wk} deliver${wk === 1 ? 'y' : 'ies'} this week.</b> ${best ? `Your best week was ${best}.` : 'Keep going.'}`
      : 'Your first delivery of the week is out there. Stay online.';
    document.getElementById('rhLines').innerHTML = `
      <div class="rh-line"><span style="color:var(--gold)">${svg('shield', 22)}</span><span>${esc(TIPS[new Date().getDate() % TIPS.length])}</span></div>
      <div class="rh-line" style="margin-top:12px"><span style="color:#6FD08A">${svg('trophy', 22)}</span><span>${milestone}</span></div>`;
    paintNow();
  }
  function paintNow(){
    const el = document.getElementById('rhNow'); if(!el) return;
    const active = groups(lastRows).filter(([, g]) => stage(g) !== 'done');
    const badge = document.getElementById('rhBadge'); if(badge){ badge.hidden = !active.length; badge.textContent = active.length; }
    if(!active.length){ el.innerHTML = ''; return; }
    const [id, g] = active[0], st = stage(g);
    el.innerHTML = `<button type="button" class="rh-now" data-goto="deliv"><span style="color:var(--gold)">${svg('deliv', 26)}</span><span style="flex:1;min-width:0"><b>Your delivery <span style="white-space:nowrap">${esc(id)}</span></b><small>${esc(STAGE[st])} · ${esc(g[0].customer_area || 'customer')}${active.length > 1 ? ` · +${active.length - 1} more` : ''}</small></span><span class="rh-pill ${st === 'ready' ? 'ready' : ''}">Open</span></button>`;
  }

  /* ---------- deliveries ---------- */
  const STAGE = { preparing:'Stalls preparing', ready:'Ready for pickup', out:'On the way', done:'Delivered' };
  function stage(rows){
    if(rows.every(r => r.status === 'completed')) return 'done';
    if(rows.some(r => r.status === 'out_for_delivery')) return 'out';
    if(rows.every(r => ['ready','out_for_delivery'].includes(r.status))) return 'ready';
    return 'preparing';
  }
  function groups(rows){ const m = new Map(); (rows || []).forEach(r => { if(!m.has(r.order_id)) m.set(r.order_id, []); m.get(r.order_id).push(r); }); return [...m.entries()]; }
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : new Date(iso).toLocaleDateString(); };
  const intl = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('256') ? d : d.startsWith('0') ? '256' + d.slice(1) : d.length === 9 ? '256' + d : d; };
  function card(id, g, example){
    const f = g[0], st = stage(g), first = String(f.customer_name || 'Customer').trim().split(/\s+/)[0];
    const vendors = g.map(r => esc(r.vendor_name)).join(', ');
    const step = (cls, title, sub) => `<li class="${cls}"><i>${cls === 'ok' ? svg('check', 12, 4) : ''}</i><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></li>`;
    const picked = st === 'out' || st === 'done';
    const steps = step('ok', 'Accepted', 'Paid order, assigned to you')
      + step(picked ? 'ok' : 'now', picked ? `Picked up from ${vendors}` : `Pick up from ${vendors}`, picked ? '' : (st === 'ready' ? 'Ready — go and collect it' : 'The stall is still preparing it'))
      + step(st === 'out' ? 'now' : st === 'done' ? 'ok' : 'todo', `On the way to ${esc(f.customer_area || 'the customer')}`, '')
      + step(st === 'done' ? 'ok' : 'todo', 'Delivered', '');
    const tel = intl(f.customer_phone);
    const maps = f.customer_lat != null && f.customer_lng != null ? `https://www.google.com/maps/search/?api=1&query=${Number(f.customer_lat)},${Number(f.customer_lng)}` : (f.customer_area ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.customer_area + ', Kampala')}` : null);
    const off = example ? ' tabindex="-1" aria-disabled="true" style="pointer-events:none"' : '';
    const action = st === 'ready' ? `<button type="button" class="rh-go pick" data-adv="${esc(id)}" data-to="out_for_delivery"${off}>I've picked it up</button>`
      : st === 'out' ? `<button type="button" class="rh-go" data-adv="${esc(id)}" data-to="completed"${off}>Mark as delivered</button>`
      : st === 'preparing' ? '<div class="rh-wait">Wait for the stall to mark it ready before you collect it.</div>' : '';
    if(st === 'done') return `<article class="rh-deliv done"><div class="rh-dhead"><div><b>${esc(id)}</b><small>${esc(first)} · ${esc(f.customer_area || '')} · ${ago(f.updated_at || f.created_at)}</small></div><span class="rh-pill done">Delivered</span></div></article>`;
    return `<article class="rh-deliv">
      <div class="rh-dhead"><div><div class="rh-eye">Your delivery</div><b>${esc(id)}</b><small>Paid ${ago(f.paid_at || f.created_at)}</small></div><span class="rh-pill ${st === 'ready' ? 'ready' : ''}">${esc(STAGE[st])}</span></div>
      <ol class="rh-steps">${steps}</ol>
      <div class="rh-sep"></div>
      <div class="rh-eye" style="color:#B7A493">Deliver to</div>
      <div class="rh-who"><div class="rh-av">${esc(first.slice(0, 1).toUpperCase())}</div><div style="min-width:0"><b>${esc(first)}</b><small>${esc(f.customer_area || 'Area not given')}</small></div></div>
      <div class="rh-btns">
        ${tel ? `<a class="rh-btn" href="tel:+${tel}"${off}>${svg('phone', 16)}Call</a><a class="rh-btn wa" href="https://wa.me/${tel}" target="_blank" rel="noopener"${off}>${svg('chat', 16)}WhatsApp</a>` : ''}
        ${maps ? `<a class="rh-btn map" href="${maps}" target="_blank" rel="noopener"${off}>${svg('pin', 16)}Maps</a>` : ''}
      </div>
      <div class="rh-sep"></div>
      <div class="rh-eye" style="color:#B7A493">Pick up from</div>
      ${g.map(r => `<div class="rh-who"><div class="rh-av stall">${esc(String(r.vendor_name || 'S').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</div><div style="flex:1;min-width:0"><b>${esc(r.vendor_name)}</b><small>${esc((Array.isArray(r.items) ? r.items : []).map(i => `${Number(i.qty || 1)}× ${i.name}`).join(', '))}</small></div><span class="rh-pill ${['ready','out_for_delivery','completed'].includes(r.status) ? 'ready' : ''}">${r.status === 'ready' ? 'Ready' : r.status === 'out_for_delivery' ? 'Picked up' : r.status === 'completed' ? 'Delivered' : 'Preparing'}</span></div>`).join('')}
      <div class="rh-paid"><span style="color:#9FE0B0">${svg('paid', 22)}</span><span><b>Paid by ${esc(String(f.payment_method || 'Mobile Money').replace(/^Flutterwave\s+/, ''))}.</b> Nothing to collect — just hand it over.</span></div>
      ${action}
    </article>`;
  }
  function renderDeliveries(rows){
    lastRows = rows || [];
    const el = document.getElementById('deliveriesList'); if(!el) return;
    const all = groups(lastRows), active = all.filter(([, g]) => stage(g) !== 'done'), done = all.filter(([, g]) => stage(g) === 'done');
    if(!all.length){
      el.innerHTML = `<div class="rh-empty"><b>No deliveries yet</b>When a customer pays, a request appears on your Home tab. Accept it and the delivery shows here, step by step.<br><button type="button" class="rh-btn map" style="margin:14px auto 0;padding:0 16px" onclick="showExampleDelivery()">Show an example delivery</button></div>`;
    }else{
      el.innerHTML = `<div style="display:grid;gap:14px">${active.map(([id, g]) => card(id, g)).join('')}
        ${done.length ? `<div class="rh-eye" style="color:#B7A493;margin-top:6px">Delivered</div>${done.slice(0, 10).map(([id, g]) => card(id, g)).join('')}` : ''}</div>`;
    }
    paintNow();
  }
  function showExampleDelivery(){
    const el = document.getElementById('deliveriesList'); if(!el) return;
    const now = new Date().toISOString();
    const sample = [{ order_id:'EXAMPLE', vendor_name:'Mama Rita Kitchen', status:'ready', items:[{ name:'Rolex', qty:2 }, { name:'Chapati', qty:1 }],
      payment_method:'MTN Mobile Money', customer_name:'Grace N', customer_phone:'0772000000', customer_area:'Kansanga', created_at:now, paid_at:now }];
    el.innerHTML = `<div style="display:grid;gap:14px"><div class="rh-example"><b>EXAMPLE — not a real order.</b> This is what you see after accepting a request. Buttons are switched off.</div>
      <div class="tn-offer" style="pointer-events:none"><div class="tn-offer-top"><div class="tn-offer-title">New delivery request</div><div class="tn-offer-distance">1.4 km away</div></div>
      <div class="tn-offer-route"><div><span>Pick up from</span><b>Mama Rita Kitchen</b><i>Kansanga</i></div><div><span>Deliver to</span><b>Kansanga</b></div></div>
      <div class="tn-offer-meta">Step 1: a paid order pops up like this on your Home tab · you earn UGX 2,850</div></div>
      ${card('EXAMPLE', sample, true)}
      <button type="button" class="rh-btn map" onclick="loadDeliveries()">Hide example</button></div>`;
  }

  /* ---------- data ---------- */
  async function loadAssist(){
    try{ const { data, error } = await c().rpc('rider_assist'); if(!error) assist = data; }catch(_){}
    paintHome();
  }
  async function loadProfile(){
    try{
      const s = (await c().auth.getSession())?.data?.session; if(!s) return;
      const { data } = await c().from('riders').select('tonninyira_id,full_name,photo_url,vehicle_type,plate_number').eq('auth_user_id', s.user.id).maybeSingle();
      profile = data || null;
    }catch(_){}
    hello();
    const me = document.getElementById('rhMe');
    if(me) me.innerHTML = `<div class="rh-who"><div class="rh-av" style="width:56px;height:56px;background:var(--gold);color:var(--ink);${profile?.photo_url && /^https:\/\//.test(profile.photo_url) ? `background-image:url('${esc(profile.photo_url)}');background-size:cover` : ''}">${profile?.photo_url ? '' : esc((profile?.full_name || 'R').slice(0, 2).toUpperCase())}</div>
      <div style="min-width:0"><b style="font-size:1.05rem">${esc(profile?.full_name || rider()?.full_name || 'Rider')}</b><small>${esc([profile?.tonninyira_id || rider()?.tonninyira_id, profile?.vehicle_type, profile?.plate_number].filter(Boolean).join(' · '))}</small></div></div>`;
  }
  async function signOut(){
    const b = document.getElementById('rhSignOut'); b.disabled = true; b.textContent = 'Signing out…';
    try{ await c().auth.signOut({ scope: 'global' }); }catch(_){}
    try{ if(typeof logOut === 'function') logOut(); }catch(_){}
    location.href = 'index.html';
  }

  function boot(){
    const dash = document.getElementById('dashView');
    if(booted || !dash || dash.classList.contains('hidden') || !rider()) return;
    booted = true; styles();
    document.body.classList.add('rh-on'); dash.classList.add('rh');
    build(dash);
    window.renderDeliveries = renderDeliveries;
    window.showExampleDelivery = showExampleDelivery;
    let t = 'home'; try{ t = sessionStorage.getItem(TAB_KEY) || 'home'; }catch(_){}
    tab(['home','deliv','earn','me'].includes(t) ? t : 'home');
    paintOnline(); hello(); paintHome();
    dash.addEventListener('click', async e => {
      const b = e.target.closest('[data-adv]'); if(!b) return;
      b.disabled = true; const label = b.textContent; b.textContent = 'Saving…';
      try{ await advanceGroup(b.dataset.adv, b.dataset.to); }catch(_){ b.disabled = false; b.textContent = label; }
      loadAssist();
    });
    loadProfile(); loadAssist();
    try{ loadDeliveries(); }catch(_){}
    setInterval(() => { if(!document.hidden) loadAssist(); }, 60000);
  }
  const iv = setInterval(() => { boot(); if(booted) clearInterval(iv); }, 400);
  window.tnRiderHome = { refresh: () => { loadAssist(); try{ loadDeliveries(); }catch(_){} } };
})();
