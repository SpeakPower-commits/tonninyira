/*
 * Tonninyira enhancement layer
 *
 * This file deliberately does NOT replace the original page structure.
 * It enhances the existing Eats / Shop tabs, search, basket, profile,
 * favourites, orders and market gallery in-place.
 */
(function () {
  'use strict';

  const CART_KEY = 'tonninyira_cart_v2';
  const SEARCH_KEY = 'tonninyira_recent_searches_v1';
  const REWARD_CACHE_KEY = 'tonninyira_reward_cache_v1';
  const PENDING_CHECKOUT_KEY = 'tonninyira_pending_checkout_method';

  const originalAddToCart = typeof window.addToCart === 'function' ? window.addToCart : null;
  const originalUpdateQty = typeof window.updateQty === 'function' ? window.updateQty : null;
  const originalResetApp = typeof window.resetApp === 'function' ? window.resetApp : null;
  const originalRenderSearchResults = typeof window.renderSearchResults === 'function' ? window.renderSearchResults : null;
  const originalRenderMain = typeof window.renderMain === 'function' ? window.renderMain : null;
  const originalGoView = typeof window.goView === 'function' ? window.goView : null;
  const originalRenderMyOrders = typeof window.renderMyOrders === 'function' ? window.renderMyOrders : null;
  const originalSubmitReview = typeof window.submitReview === 'function' ? window.submitReview : null;

  function state() { return (typeof AppState !== 'undefined') ? AppState : null; }
  function catalog() { return (typeof CATALOG !== 'undefined') ? CATALOG : null; }
  function db() { return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function icons() { return (typeof ICONS !== 'undefined') ? ICONS : {}; }

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function persistCart() {
    try {
      const s = state();
      localStorage.setItem(CART_KEY, JSON.stringify(s && Array.isArray(s.cart) ? s.cart : []));
    } catch (_) {}
  }

  function restoreCart() {
    try {
      const s = state();
      if (!s || !Array.isArray(s.cart)) return;
      const saved = safeParse(localStorage.getItem(CART_KEY), []);
      if (!Array.isArray(saved)) return;
      s.cart.splice(0, s.cart.length, ...saved);
      if (typeof window.updateCartUI === 'function') window.updateCartUI();
    } catch (_) {}
  }

  if (originalAddToCart) {
    window.addToCart = function (...args) {
      const result = originalAddToCart.apply(this, args);
      persistCart();
      return result;
    };
  }
  if (originalUpdateQty) {
    window.updateQty = function (...args) {
      const result = originalUpdateQty.apply(this, args);
      persistCart();
      return result;
    };
  }
  if (originalResetApp) {
    window.resetApp = function (...args) {
      const result = originalResetApp.apply(this, args);
      persistCart();
      return result;
    };
  }

  function recentSearches() {
    const value = safeParse(localStorage.getItem(SEARCH_KEY), []);
    return Array.isArray(value) ? value : [];
  }
  function saveRecentSearch(term) {
    term = String(term || '').trim();
    if (!term || term.length < 2) return;
    const next = [term, ...recentSearches().filter(x => x.toLowerCase() !== term.toLowerCase())].slice(0, 5);
    try { localStorage.setItem(SEARCH_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function enhancedSearchResults() {
    const el = document.getElementById('mainArea');
    const s = state();
    const c = catalog();
    if (!el || !s || !c) return;
    const term = String(s.searchTerm || '').trim().toLowerCase();
    if (!term) { if (originalRenderSearchResults) originalRenderSearchResults(); return; }

    const normalize = value => String(value || '').toLowerCase();
    const tokens = term.split(/\s+/).filter(Boolean);
    const score = text => tokens.reduce((n, token) => n + (text.includes(token) ? 1 : 0), 0);
    const matches = [];

    Object.entries(c).forEach(([catKey, cat]) => {
      Object.entries(cat.subs || {}).forEach(([subKey, sub]) => {
        (sub.vendors || []).forEach(v => {
          const vendorText = [v.name, v.location, cat.label, sub.label].map(normalize).join(' ');
          (v.items || []).forEach(item => {
            const itemText = [item.name, item.desc, vendorText].map(normalize).join(' ');
            const rank = score(itemText);
            if (rank > 0) matches.push({ vendor: v, item, catKey, subKey, rank });
          });
        });
      });
    });

    matches.sort((a, b) => b.rank - a.rank || String(a.vendor.name).localeCompare(String(b.vendor.name)));
    if (!matches.length) {
      const clean = term.replace(/[&<>\"']/g, '');
      el.innerHTML = `<div class="empty-state">${icons().search || ''}<p style="font-weight:700;color:var(--sand);">Nothing matches "${clean}"</p><p>Try the name of a dish, item, stall or area.</p></div>`;
      saveRecentSearch(term);
      return;
    }

    const groups = new Map();
    matches.forEach(m => {
      const key = m.vendor.id;
      if (!groups.has(key)) groups.set(key, { ...m.vendor, catKey: m.catKey, subKey: m.subKey, items: [] });
      groups.get(key).items.push(m.item);
    });
    el.innerHTML = `<div class="stall-list">${[...groups.values()].map(v => window.vendorCardHTML(v)).join('')}</div>`;
    saveRecentSearch(term);
  }
  window.renderSearchResults = enhancedSearchResults;

  function enhanceAccessibility() {
    document.querySelectorAll('.cat-tab').forEach(btn => {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', `Browse ${btn.textContent.trim()}`);
    });
    document.querySelectorAll('.subcat-chip').forEach(btn => {
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', btn.textContent.trim());
    });
    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.setAttribute('aria-label', 'Add item to basket');
      btn.title = 'Add to basket';
    });
    document.querySelectorAll('.fav-btn').forEach(btn => {
      btn.title = btn.classList.contains('active') ? 'Remove from favourite stalls' : 'Save this stall';
    });
    const search = document.getElementById('searchInput');
    if (search) {
      search.setAttribute('aria-label', 'Search stalls and items');
      search.setAttribute('inputmode', 'search');
      search.autocomplete = 'off';
    }
    const area = document.getElementById('areaSelect');
    if (area) area.setAttribute('aria-label', 'Your area');
  }

  function addSearchHint() {
    const search = document.getElementById('searchInput');
    if (!search || search.dataset.enhanced) return;
    search.dataset.enhanced = '1';
    search.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveRecentSearch(search.value);
    });
  }

  function ensureAuthModal() {
    if (document.getElementById('tnAuthModal')) return document.getElementById('tnAuthModal');
    const modal = document.createElement('div');
    modal.id = 'tnAuthModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px;';
    modal.innerHTML = `
      <div style="width:min(420px,100%);background:var(--card);border:1px solid rgba(243,232,216,.12);border-radius:18px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.35);">
        <button id="tnAuthClose" aria-label="Close" style="float:right;border:0;background:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>
        <div style="font-size:.7rem;font-weight:800;letter-spacing:1.5px;color:var(--gold);">SECURE TONNINYIRA ACCOUNT</div>
        <h2 class="display" style="font-size:1.3rem;margin:7px 0;">Keep your orders safe</h2>
        <p style="color:var(--muted);font-size:.84rem;line-height:1.45;margin-top:0;">Use your email once. We send a secure sign-in link—no password to remember.</p>
        <label for="tnAuthEmail" style="display:block;font-size:.78rem;font-weight:800;margin-top:12px;">Email address</label>
        <input id="tnAuthEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" style="width:100%;margin-top:6px;padding:12px;border-radius:10px;border:1px solid rgba(243,232,216,.12);background:var(--ink);color:var(--sand);font:inherit;">
        <button id="tnAuthSend" class="btn-primary" style="width:100%;margin-top:12px;">Send secure sign-in link</button>
        <div id="tnAuthMessage" style="font-size:.76rem;color:var(--muted);margin-top:9px;min-height:20px;"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tnAuthClose').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#tnAuthSend').onclick = async () => {
      const email = modal.querySelector('#tnAuthEmail').value.trim();
      const msg = modal.querySelector('#tnAuthMessage');
      const client = db();
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
      if (!client?.auth?.signInWithOtp) { msg.textContent = 'Secure sign-in is unavailable right now.'; return; }
      const button = modal.querySelector('#tnAuthSend');
      button.disabled = true;
      button.textContent = 'Sending…';
      const result = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href.split('#')[0] }
      });
      button.disabled = false;
      button.textContent = 'Send secure sign-in link';
      msg.textContent = result.error ? `Could not send link: ${result.error.message}` : 'Check your email, then return here. Your orders will be linked to your account.';
    };
    return modal;
  }

  async function getSession() {
    const client = db();
    if (!client?.auth?.getSession) return null;
    try {
      const { data } = await client.auth.getSession();
      return data?.session || null;
    } catch (_) { return null; }
  }

  function identityOrPrompt() {
    const id = (typeof getCustomerIdentity === 'function') ? getCustomerIdentity() : null;
    if (id?.name && id?.phone) return id;
    if (typeof window.openCart === 'function') window.openCart();
    if (typeof window.confirmIdentityAndContinue === 'function') {
      window.setTimeout(() => document.getElementById('identitySheet')?.classList.remove('hidden'), 0);
      window.setTimeout(() => document.getElementById('identityOverlay')?.classList.remove('hidden'), 0);
    }
    return null;
  }

  function writeOrderConfirmation(orderId, method, subtotal, deliveryFee, rider) {
    if (typeof window.closeCart === 'function') window.closeCart();
    const idBox = document.getElementById('confirmOrderId');
    if (idBox) idBox.textContent = orderId;
    const summary = document.getElementById('confirmSummary');
    const s = state();
    if (summary && s) {
      summary.innerHTML = `<div class="summary-box" style="text-align:left;">${s.cart.map(c => `<div class="summary-row"><span>${String(c.name).replace(/[&<>\"']/g,'')} ×${c.qty}</span><span>UGX ${(c.price*c.qty).toLocaleString()}</span></div>`).join('')}<div class="summary-row"><span>Delivery</span><span>UGX ${Number(deliveryFee).toLocaleString()}</span></div><div class="summary-row total"><span>Payment</span><span>${String(method)}</span></div><div class="summary-row total"><span>Total</span><span>UGX ${(Number(subtotal)+Number(deliveryFee)).toLocaleString()}</span></div></div>`;
    }
    const riderEl = document.getElementById('confirmRider');
    if (riderEl && rider) {
      const safeName = String(rider.name || 'Tonninyira Rider').replace(/[&<>\"']/g,'');
      riderEl.innerHTML = `<div class="rider-card"><div class="avatar" style="background:${typeof avatarColor==='function'?avatarColor(safeName):'var(--gold)'};width:44px;height:44px;font-size:.85rem;">${typeof initials==='function'?initials(safeName):'TR'}</div><div style="flex:1;"><div style="font-weight:800;">${safeName} <span class="verify-check">${icons().check||''}</span></div><div style="font-size:.78rem;color:var(--muted);">${String(rider.vehicle||'Boda-boda')}</div></div><div style="text-align:right;color:var(--gold);font-weight:800;">★ ${Number(rider.rating||0).toFixed(1)}</div></div>`;
    }
    document.getElementById('confirmOverlay')?.classList.remove('hidden');
    document.getElementById('confirmSheet')?.classList.remove('hidden');
  }

  async function secureFinishOrder(method, custId, session) {
    const s = state();
    const c = catalog();
    const client = db();
    if (!s || !c || !client || !session) return false;
    if (!Array.isArray(s.cart) || !s.cart.length) return false;
    if (typeof SAMPLE_RIDERS === 'undefined' || !SAMPLE_RIDERS.length) {
      alert("No delivery riders are registered yet, so orders can't be placed right now. Check back once a rider signs up from the Profile tab.");
      return false;
    }

    const orderId = 'TN-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const subtotal = typeof cartSubtotal === 'function' ? cartSubtotal() : s.cart.reduce((sum, x) => sum + Number(x.price||0)*Number(x.qty||0), 0);
    const deliveryFee = typeof computeDeliveryFee === 'function' ? computeDeliveryFee() : 0;
    const rider = SAMPLE_RIDERS[Math.floor(Math.random() * SAMPLE_RIDERS.length)];
    const area = document.getElementById('areaSelect')?.value || '';

    const byVendor = {};
    s.cart.forEach(item => {
      const vendorId = item.vendorId;
      if (!byVendor[vendorId]) byVendor[vendorId] = { vendorName: item.vendorName, items: [] };
      byVendor[vendorId].items.push({ name: item.name, qty: Number(item.qty||1) });
    });

    const rows = Object.entries(byVendor).map(([vendorId, group]) => ({
      order_id: orderId,
      vendor_id: vendorId,
      vendor_name: group.vendorName,
      items: group.items,
      user_id: session.user.id,
      user_email: session.user.email || null,
      customer_name: custId.name,
      customer_phone: custId.phone,
      customer_area: area,
      delivery_option: 'standard',
      delivery_fee: Number(deliveryFee),
      payment_method: method,
      rider_tid: rider.tid,
      customer_lat: s.customerLocation ? s.customerLocation.lat : null,
      customer_lng: s.customerLocation ? s.customerLocation.lng : null,
      status: 'new'
    }));

    const { error } = await client.from('orders').insert(rows);
    if (error) {
      alert(`Your order could not be placed — ${error.message}. Your basket has been kept.`);
      return false;
    }

    writeOrderConfirmation(orderId, method, subtotal, deliveryFee, rider);
    s.cart = [];
    persistCart();
    if (typeof window.updateCartUI === 'function') window.updateCartUI();
    return true;
  }

  async function enhancedFinishOrder(method) {
    if (!state()?.cart?.length) return;
    const custId = identityOrPrompt();
    if (!custId) return;
    const session = await getSession();
    if (!session) {
      try { sessionStorage.setItem(PENDING_CHECKOUT_KEY, String(method)); } catch (_) {}
      ensureAuthModal();
      return;
    }
    await secureFinishOrder(method, custId, session);
  }
  window.finishOrder = enhancedFinishOrder;

  async function enhancedRenderMyOrders() {
    const client = db();
    const el = document.getElementById('mainArea');
    if (!client || !el) { if (originalRenderMyOrders) originalRenderMyOrders(); return; }
    const session = await getSession();
    if (!session) { if (originalRenderMyOrders) originalRenderMyOrders(); return; }
    const id = (typeof getCustomerIdentity === 'function') ? getCustomerIdentity() : null;
    el.innerHTML = `<div class="placeholder">${icons().box||''}<h3>Loading your orders…</h3></div>`;
    try {
      const { data: orderRows, error } = await client.from('orders').select('*').eq('user_id', session.user.id).order('created_at', { ascending:false });
      if (error) throw error;
      const { data: myReviews } = await client.from('reviews').select('target_type,target_id,order_id').eq('user_id', session.user.id);
      if (typeof renderOrderGroups === 'function') renderOrderGroups(orderRows || [], myReviews || [], id || {name: session.user.email || 'Customer'});
    } catch (e) {
      el.innerHTML = `<div class="placeholder">${icons().box||''}<h3>Couldn't load your orders</h3><p>Please check your connection and try again.</p></div>`;
    }
  }
  window.renderMyOrders = enhancedRenderMyOrders;

  async function enhancedSubmitReview(targetType, targetId, orderId, btnEl) {
    const client = db();
    const session = await getSession();
    if (!client || !session) { ensureAuthModal(); return; }
    const errEl = document.getElementById('reviewError-'+orderId);
    if (typeof activeRatingStars === 'undefined' || activeRatingStars < 1) { if (errEl) errEl.classList.remove('hidden'); return; }
    if (errEl) errEl.classList.add('hidden');
    const commentEl = document.getElementById('reviewComment-'+orderId);
    const id = (typeof getCustomerIdentity === 'function' ? getCustomerIdentity() : null) || {name:'Customer',phone:null};
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Submitting…'; }
    try {
      const { error } = await client.from('reviews').insert({
        target_type: targetType,
        target_id: targetId,
        order_id: orderId,
        user_id: session.user.id,
        reviewer_name: id.name,
        reviewer_phone: id.phone || null,
        rating: activeRatingStars,
        comment: commentEl ? commentEl.value.trim() : ''
      });
      if (error) throw error;
      enhancedRenderMyOrders();
    } catch (e) {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Submit Rating'; }
      if (errEl) { errEl.textContent = 'Could not submit that rating. Please try again.'; errEl.classList.remove('hidden'); }
    }
  }
  window.submitReview = enhancedSubmitReview;

  async function loadRewards() {
    const client = db();
    if (!client?.auth?.getSession) return null;
    try {
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return null;
      const { data, error } = await client.from('loyalty_accounts').select('points,lifetime_points').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (data) localStorage.setItem(REWARD_CACHE_KEY, JSON.stringify(data));
      return data || null;
    } catch (_) { return safeParse(localStorage.getItem(REWARD_CACHE_KEY), null); }
  }

  function injectProfileExtras() {
    const s = state();
    if (!s || s.view !== 'profile') return;
    const main = document.getElementById('mainArea');
    if (!main || main.querySelector('[data-tn-enhancements]')) return;
    const wrap = document.createElement('section');
    wrap.dataset.tnEnhancements = '1';
    wrap.style.cssText = 'padding:0 16px 24px;max-width:420px;margin:0 auto;';
    wrap.innerHTML = `
      <div style="background:var(--card);border-radius:14px;padding:14px;margin-top:8px;border:1px solid rgba(243,232,216,.08)">
        <div style="font-weight:800;color:var(--gold);margin-bottom:6px;">MY REWARDS</div>
        <div id="tnRewardsLine" style="font-weight:700;">Checking your points…</div>
        <div style="font-size:.76rem;color:var(--muted);margin-top:4px;">Earn points when completed orders are recorded.</div>
      </div>
      <div style="background:var(--card);border-radius:14px;padding:14px;margin-top:10px;border:1px solid rgba(243,232,216,.08)">
        <div style="font-weight:800;color:var(--gold);margin-bottom:6px;">SUPPORT</div>
        <div style="font-size:.82rem;color:var(--muted);">Private support is available from your signed-in account.</div>
        <button id="tnSupportBtn" class="btn-primary" style="width:100%;margin-top:10px;">Open Support</button>
      </div>`;
    main.appendChild(wrap);

    const rewardLine = wrap.querySelector('#tnRewardsLine');
    loadRewards().then(reward => {
      if (!rewardLine) return;
      rewardLine.textContent = reward ? `Available: ${Number(reward.points||0).toLocaleString()} points · Lifetime: ${Number(reward.lifetime_points||0).toLocaleString()}` : 'Sign in to see your points.';
    });

    wrap.querySelector('#tnSupportBtn')?.addEventListener('click', async () => {
      const client = db();
      const session = await getSession();
      if (!client || !session) { ensureAuthModal(); return; }
      let convo;
      const found = await client.from('support_conversations').select('id,status').eq('customer_id', session.user.id).eq('status','open').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if (found.data) convo = found.data;
      else {
        const created = await client.from('support_conversations').insert({customer_id:session.user.id,status:'open'}).select('id,status').single();
        convo = created.data;
      }
      if (!convo) { alert('Could not open support right now.'); return; }
      const messages = await client.from('support_messages').select('body,created_at,sender_user_id').eq('conversation_id',convo.id).order('created_at');
      const text = (messages.data||[]).map(m => `${m.sender_user_id===session.user.id?'You':'Support'}: ${m.body}`).join('\n\n');
      const body = prompt(`Private support chat\n\n${text || 'No messages yet.'}\n\nType your message:`);
      if (!body?.trim()) return;
      const sent = await client.from('support_messages').insert({conversation_id:convo.id,sender_user_id:session.user.id,body:body.trim()});
      if (sent.error) alert('Your support message could not be sent. Please try again.');
      else alert('Message sent to Tonninyira Support.');
    });
  }

  function installProfileHook() {
    if (!originalRenderMain) return;
    window.renderMain = function (...args) {
      const result = originalRenderMain.apply(this,args);
      window.setTimeout(injectProfileExtras,0);
      window.setTimeout(enhanceAccessibility,0);
      return result;
    };
  }
  function installGoViewHook() {
    if (!originalGoView) return;
    window.goView = function (...args) {
      const result = originalGoView.apply(this,args);
      window.setTimeout(injectProfileExtras,0);
      return result;
    };
  }

  function improveGallery() {
    const gallery = document.getElementById('heroTrack');
    if (!gallery || gallery.dataset.enhanced) return;
    gallery.dataset.enhanced = '1';
    gallery.setAttribute('aria-live','polite');
  }

  async function handleAuthReturn() {
    const session = await getSession();
    if (!session) return;
    try {
      const pendingMethod = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
      if (pendingMethod) sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    } catch (_) {}
  }

  function refreshEnhancements() {
    restoreCart();
    addSearchHint();
    enhanceAccessibility();
    improveGallery();
  }

  installProfileHook();
  installGoViewHook();
  handleAuthReturn();

  document.addEventListener('DOMContentLoaded', refreshEnhancements);
  window.setTimeout(refreshEnhancements,250);
  window.setTimeout(refreshEnhancements,1200);
})();
