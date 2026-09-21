/* Tonninyira protected admin session layer: authentication + logout only. */
(function(){
  'use strict';
  const SUPABASE_URL='https://alxzmjgepftohwpqibmn.supabase.co';
  const SUPABASE_KEY='sb_publishable_vLr2S8qLRHN5gVv9IITVPQ_CTXc4aCv';
  const APP_URL=location.origin+location.pathname.replace(/[^/]*$/,''); /* derived, not pinned: see guest-access-flow.js */
  let client=null;
  function getClient(){
    if(client)return client;
    try{
      if(window.supabaseClient?.auth)return client=window.supabaseClient;
      if(window.supabase?.createClient)return client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    }catch(e){}
    return null;
  }
  async function adminState(){
    const c=getClient();
    if(!c?.auth)return {ok:false,error:'Authentication is unavailable.'};
    try{
      let r=await c.auth.getSession();
      let user=r?.data?.session?.user||null;
      if(!user){r=await c.auth.getUser();user=r?.data?.user||null;}
      if(!user)return {ok:false,error:'No administrator session is active.'};
      const q=await c.rpc('admin_session_check');
      if(q.error)throw q.error;
      if(q.data?.ok)return {ok:true,user,role:q.data.role,display_name:q.data.display_name,phone:q.data.phone};
      return {ok:false,error:q.data?.error||'Administrator access could not be verified'};
    }catch(e){
      return {ok:false,error:e?.message||'Administrator access could not be verified'};
    }
  }
  async function logout(){
    try{await getClient()?.auth?.signOut({scope:'global'});}catch(e){}
    try{
      sessionStorage.clear();
      Object.keys(localStorage).filter(k=>k.startsWith('sb-')).forEach(k=>localStorage.removeItem(k));
    }catch(e){}
    location.replace(APP_URL+'index.html?signed_out=1');
  }
  window.tnAdminClient=getClient;
  window.tnAdminState=adminState;
  window.tnAdminLogout=logout;
})();
