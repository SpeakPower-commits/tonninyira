/* Compatibility hooks for the original Tonninyira inline handlers. */
(function(){
  'use strict';

  function enhancedFinish(method){
    if(typeof window.finishOrder === 'function') return window.finishOrder(method);
    if(typeof window.completeOrder === 'function') return window.completeOrder(method);
  }

  /* The original checkout button calls completeOrder() from inline HTML.
     Redirect that single entry point to the security-aware enhancement. */
  if(typeof window.finishOrder === 'function'){
    window.completeOrder = enhancedFinish;
  }

  /* The original search listener calls its lexical renderMain(). Attach a
     second listener so the enhanced search renderer gets the final say. */
  const search = document.getElementById('searchInput');
  if(search && !search.dataset.enhancedSearchHook){
    search.dataset.enhancedSearchHook = '1';
    search.addEventListener('input', function(){
      if(typeof window.renderSearchResults === 'function' && typeof AppState !== 'undefined' && AppState.searchTerm){
        window.setTimeout(function(){ window.renderSearchResults(); }, 0);
      }
    });
  }

  /* Inline goView() is a global entry point. After the original navigation
     paints the screen, refresh the authenticated order view when needed. */
  if(typeof window.goView === 'function' && !window.goView.__tnHooked){
    const previousGoView = window.goView;
    const hooked = function(view){
      const result = previousGoView.apply(this, arguments);
      if(view === 'orders' && typeof window.renderMyOrders === 'function'){
        window.setTimeout(function(){ window.renderMyOrders(); }, 0);
      }
      return result;
    };
    hooked.__tnHooked = true;
    window.goView = hooked;
  }

  /* After dynamic vendor cards render, reapply accessible labels. */
  const observer = new MutationObserver(function(){
    if(typeof window.setTimeout === 'function') window.setTimeout(function(){
      document.querySelectorAll('.add-btn').forEach(function(btn){
        btn.setAttribute('aria-label','Add item to basket');
        btn.title='Add to basket';
      });
      document.querySelectorAll('.fav-btn').forEach(function(btn){
        btn.title=btn.classList.contains('active')?'Remove from favourite stalls':'Save this stall';
      });
    },0);
  });
  const main = document.getElementById('mainArea');
  if(main) observer.observe(main,{childList:true,subtree:true});
})();
