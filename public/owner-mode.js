(()=>{
  const q=new URLSearchParams(location.search);
  const ownerNative=q.get('channel')==='beta'&&q.get('native')==='android';
  const ownerUA=/AMStudioAndroid\/[^\s]+\s+OwnerBeta/i.test(navigator.userAgent||'');
  if(!ownerNative&&!ownerUA)return;
  document.documentElement.dataset.amOwnerMode='1';
  document.title='AM STUDIO — Owner Admin';
  const style=document.createElement('style');
  style.id='am-owner-mode-style';
  style.textContent=`html[data-am-owner-mode="1"] body{background:#05070b}html[data-am-owner-mode="1"] #app,html[data-am-owner-mode="1"]>body>.nav{filter:saturate(.55) brightness(.42);pointer-events:none}html[data-am-owner-mode="1"] #am-admin-launch{display:none!important}`;
  document.head.appendChild(style);
  const openAdmin=()=>{
    const launch=document.getElementById('am-admin-launch');
    const panel=document.getElementById('am-admin-panel');
    if(panel){panel.classList.add('open');return true}
    if(launch){launch.click();return true}
    return false;
  };
  let tries=0;
  const timer=setInterval(()=>{tries++;if(openAdmin()||tries>80)clearInterval(timer)},100);
  addEventListener('pageshow',()=>setTimeout(openAdmin,60));
})();