/* Tonninyira session compatibility bridge.
 * The main page uses a global lexical `supabaseClient` binding. Some enhancement
 * modules access `window.supabaseClient`; this bridge makes both names refer to
 * the same client so Account, Support, Wishlist, Orders and Payments share one
 * authentication session.
 */
(function(){
  'use strict';
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      window.supabaseClient = supabaseClient;
      window.tnSessionClient = supabaseClient;
    }
  } catch (_) {}
})();
