/* Tonninyira rider delivery alerts
 * Uses Supabase Realtime Broadcast on a private rider:<auth_user_id> channel.
 * The database trigger creates the alert row and broadcasts it when rider_tid
 * is assigned to an order. This file is intentionally self-contained so the
 * existing rider dashboard UI does not need to be rebuilt.
 */
(function(){
  'use strict';

  if (!location.pathname.toLowerCase().includes('rider-dashboard')) return;
  if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) return;

  let riderAlertChannel = null;
  const seen = new Set();

  function ensureStyles(){
    if (document.getElementById('tnRiderAlertStyles')) return;
    const style = document.createElement('style');
    style.id = 'tnRiderAlertStyles';
    style.textContent = `
      #tnRiderAlerts{margin-top:14px;display:grid;gap:10px}
      .tn-rider-alert{background:#463126;border:1px solid rgba(245,180,0,.35);border-left:4px solid #F5B400;border-radius:14px;padding:13px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
      .tn-rider-alert-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .tn-rider-alert-title{font-weight:800;color:#F5B400;font-size:.86rem}
      .tn-rider-alert-time{font-size:.68rem;color:#9C897A;white-space:nowrap}
      .tn-rider-alert-body{font-size:.82rem;color:#F3E8D8;margin-top:5px;line-height:1.4}
      .tn-rider-alert-link{display:inline-block;margin-top:9px;color:#F5B400;font-size:.76rem;font-weight:800;text-decoration:none}
      .tn-rider-alert-read{background:transparent;border:0;color:#9C897A;font-size:.7rem;font-weight:700;cursor:pointer;padding:0;margin-top:8px}
      .tn-rider-alert-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;width:min(92vw,420px);background:#2A1F19;color:#F3E8D8;border:1px solid rgba(245,180,0,.55);border-left:5px solid #F5B400;border-radius:14px;padding:13px 15px;box-shadow:0 14px 40px rgba(0,0,0,.35);font-family:'Work Sans',sans-serif}
      .tn-rider-alert-toast strong{color:#F5B400;display:block;margin-bottom:3px}
    `;
    document.head.appendChild(style);
  }

  function ensureContainer(){
    let el = document.getElementById('tnRiderAlerts');
    if (el) return el;
    const dash = document.getElementById('dashView');
    const list = document.getElementById('deliveriesList');
    if (!dash || !list) return null;
    el = document.createElement('div');
    el.id = 'tnRiderAlerts';
    list.parentNode.insertBefore(el, list);
    return el;
  }

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function timeLabel(iso){
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return new Date(iso).toLocaleDateString();
  }

  function showToast(alert){
    const old = document.querySelector('.tn-rider-alert-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'tn-rider-alert-toast';
    toast.innerHTML = `<strong>🚴 ${escapeHtml(alert.title || 'New delivery')}</strong><div>${escapeHtml(alert.body || 'A new delivery has been assigned to you.')}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6500);
  }

  function renderAlert(alert, prepend){
    const container = ensureContainer();
    if (!container || !alert?.id || seen.has(alert.id)) return;
    seen.add(alert.id);
    const card = document.createElement('div');
    card.className = 'tn-rider-alert';
    card.dataset.alertId = String(alert.id);
    card.innerHTML = `
      <div class="tn-rider-alert-top">
        <div class="tn-rider-alert-title">🚴 ${escapeHtml(alert.title || 'New delivery assigned')}</div>
        <div class="tn-rider-alert-time">${escapeHtml(timeLabel(alert.created_at))}</div>
      </div>
      <div class="tn-rider-alert-body">${escapeHtml(alert.body || 'A new delivery has been assigned to you.')}${alert.delivery_area ? ` · ${escapeHtml(alert.delivery_area)}` : ''}</div>
      <a class="tn-rider-alert-link" href="#deliveriesList" onclick="document.getElementById('deliveriesList')?.scrollIntoView({behavior:'smooth'});return false;">View deliveries ↓</a>
      ${alert.read_at ? '' : '<button class="tn-rider-alert-read" type="button">Mark read</button>'}
    `;
    const btn = card.querySelector('.tn-rider-alert-read');
    if (btn){
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await supabaseClient.from('rider_delivery_alerts').update({read_at:new Date().toISOString()}).eq('id', alert.id);
        if (!error) card.remove();
        else btn.disabled = false;
      });
    }
    if (prepend && container.firstChild) container.insertBefore(card, container.firstChild);
    else container.appendChild(card);
  }

  async function getSession(){
    try { return (await supabaseClient.auth.getSession())?.data?.session || null; }
    catch (_) { return null; }
  }

  async function loadRecentAlerts(){
    const { data, error } = await supabaseClient
      .from('rider_delivery_alerts')
      .select('id,order_id,title,body,delivery_area,created_at,read_at')
      .is('read_at', null)
      .order('created_at', {ascending:false})
      .limit(5);
    if (error) return;
    (data || []).reverse().forEach(a => renderAlert(a, false));
  }

  async function start(){
    ensureStyles();
    const session = await getSession();
    if (!session?.user?.id) return;
    try {
      await supabaseClient.realtime.setAuth(session.access_token);
    } catch (_) {}

    await loadRecentAlerts();

    const topic = `rider:${session.user.id}`;
    if (riderAlertChannel) {
      try { await supabaseClient.removeChannel(riderAlertChannel); } catch (_) {}
    }

    riderAlertChannel = supabaseClient
      .channel(topic, {config:{private:true}})
      .on('broadcast', {event:'INSERT'}, async (payload) => {
        const alert = payload?.payload;
        if (!alert?.id) return;
        renderAlert(alert, true);
        showToast(alert);
        try { await window.loadDeliveries?.(); } catch (_) {}
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') console.log('[Tonninyira] Rider realtime connected.');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.log('[Tonninyira] Rider realtime unavailable:', err || status);
      });
  }

  function boot(){
    if (!document.getElementById('dashView')) return;
    start();
  }

  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 700);
  setTimeout(start, 2500);
})();

// Load the automatic nearby-delivery dispatch module after this alert layer.
(function(){
  if(!location.pathname.toLowerCase().includes('rider-dashboard')) return;
  if(document.querySelector('script[data-tn-nearby-dispatch]')) return;
  const s=document.createElement('script');
  s.src='rider-nearby-dispatch.js';
  s.dataset.tnNearbyDispatch='1';
  document.body.appendChild(s);
})();
