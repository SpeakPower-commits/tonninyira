/* Tonninyira Support session guard.
 * Support is protected by Supabase RLS, so an authenticated customer must be
 * using the same live Auth session as the rest of the app. This guard stops the
 * misleading "sign in again" loop when a session is briefly stale and lets the
 * existing support handler continue when the session is valid.
 */
(function(){
  'use strict';
  function client(){
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (_) {}
    return window.supabaseClient || window.tnSessionClient || null;
  }

  async function getSession(){
    const c=client();
    if(!c?.auth) return null;
    try {
      let r=await c.auth.getSession();
      if(r?.data?.session) return r.data.session;
      if(c.auth.refreshSession){
        const rr=await c.auth.refreshSession();
        if(rr?.data?.session) return rr.data.session;
      }
      return null;
    } catch (_) { return null; }
  }

  function showAuth(){
    if(typeof window.authStart==='function') return window.authStart();
    if(typeof window.tnOpenAccount==='function') return window.tnOpenAccount();
    const b=document.querySelector('#tnHeaderAccount,#tn-account-session-button');
    if(b) b.click();
  }

  function boot(){
    document.addEventListener('click', async function(ev){
      const btn=ev.target?.closest?.('#tnSupportBtn');
      if(!btn || btn.dataset.tnSessionGuard==='1') return;
      btn.dataset.tnSessionGuard='1';
      const s=await getSession();
      if(s){
        // Let the original Support click handler proceed normally.
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      btn.dataset.tnSessionGuard='0';
      const saved=(()=>{try{return JSON.parse(localStorage.getItem('tonninyira_customer')||'null')}catch(_){return null}})();
      if(saved?.name){
        const ok=confirm('Your saved details say '+saved.name+', but this browser is not currently verified. Verify your Tonninyira account once to open Support.');
        if(ok) showAuth();
      } else {
        showAuth();
      }
    }, true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
