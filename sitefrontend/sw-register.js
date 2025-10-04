if ("serviceWorker" in navigator) {
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("/sitefrontend/sw.js").catch(console.error);
  });
}