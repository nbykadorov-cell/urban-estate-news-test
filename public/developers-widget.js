(function () {
  "use strict";
  const API = "https://urban-estate-news-test.vercel.app/api/developers";
  const MODAL = "ue-developers-modal";
  let dataCache = null, loading = false;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  function styles() {
    if (document.getElementById("ue-dev-style")) return;
    const s = document.createElement("style"); s.id = "ue-dev-style";
    s.textContent = `
      .ue-category.ue-developers-category{--category-color:#ec407a}
      .ue-dev-modal{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.56)}
      .ue-dev-modal.is-open{display:flex}.ue-dev-box{width:min(1120px,100%);max-height:90vh;overflow:auto;background:#f7f8fa;border-radius:20px;box-shadow:0 25px 90px #0003}
      .ue-dev-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;padding:22px 24px;background:#fffffff5;border-bottom:1px solid #e6e8ed}
      .ue-dev-title{font-size:24px;font-weight:750;color:#202633}.ue-dev-subtitle{margin-top:5px;color:#737b8a;font-size:13px}.ue-dev-close{width:38px;height:38px;border:1px solid #e2e5eb;border-radius:11px;background:#fff;font-size:24px;cursor:pointer}
      .ue-dev-tools{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:10px;padding:16px 24px 4px}.ue-dev-input,.ue-dev-select{box-sizing:border-box;width:100%;min-width:0;border:1px solid #dfe3ea;border-radius:11px;padding:12px;background:#fff;color:#202633;font:inherit;font-size:14px}
      .ue-dev-count{padding:12px 24px 14px;color:#737b8a;font-size:12px}.ue-dev-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:0 24px 24px}
      .ue-dev-card{min-width:0;overflow:hidden;border:1px solid #e4e7ed;border-radius:16px;background:#fff}.ue-dev-top{display:flex;align-items:center;gap:13px;padding:17px}.ue-dev-logo{display:flex;align-items:center;justify-content:center;flex:0 0 66px;width:66px;height:66px;overflow:hidden;border-radius:13px;background:#f1f3f7;color:#8a93a3;font-size:22px;font-weight:750}.ue-dev-logo img{width:100%;height:100%;object-fit:cover}.ue-dev-name{margin:0;color:#202633;font-size:18px;overflow-wrap:anywhere}.ue-dev-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ue-dev-chip{padding:4px 8px;border-radius:7px;background:#f4f5f8;color:#667085;font-size:11px}
      .ue-dev-section{padding:14px 17px;border-top:1px solid #eef0f4}.ue-dev-section h4{margin:0 0 10px;color:#7a8290;font-size:10px;letter-spacing:.07em;text-transform:uppercase}.ue-dev-link{display:flex;gap:9px;padding:7px 0;color:#333c4b;text-decoration:none;font-size:13px;line-height:1.4;overflow-wrap:anywhere}.ue-dev-link:hover{color:#d92f6d}.ue-dev-empty{min-height:12px;color:#b2b7c1;font-size:12px}.ue-dev-contact{display:flex;align-items:center;gap:10px;padding:7px 0}.ue-dev-contact-icon{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#f3f4f7}.ue-dev-contact-name{font-size:13px;font-weight:650;color:#313948}.ue-dev-phone{display:inline-block;margin-top:3px;color:#737b8a;font-size:12px;text-decoration:none}.ue-dev-status{padding:28px 24px;text-align:center;color:#747d8b;font-size:14px}
      @media(max-width:700px){.ue-dev-modal{padding:0;align-items:stretch}.ue-dev-box{width:100%;height:100%;max-height:100dvh;border-radius:0}.ue-dev-head{padding:18px 16px}.ue-dev-title{font-size:21px}.ue-dev-tools{grid-template-columns:1fr 1fr;padding:13px 16px 2px}.ue-dev-input{grid-column:1/-1}.ue-dev-count{padding:11px 16px}.ue-dev-grid{grid-template-columns:1fr;gap:11px;padding:0 12px 18px}.ue-dev-top{padding:14px}.ue-dev-section{padding:12px 14px}}
    `;
    document.head.appendChild(s);
  }
  function ensureModal() {
    if (document.getElementById(MODAL)) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="ue-dev-modal" id="${MODAL}" aria-hidden="true"><div class="ue-dev-box" role="dialog" aria-modal="true" aria-labelledby="ue-dev-title"><div class="ue-dev-head"><div><div class="ue-dev-title" id="ue-dev-title">Застройщики</div><div class="ue-dev-subtitle">Каталог компаний, групп и контактов</div></div><button type="button" class="ue-dev-close" aria-label="Закрыть">×</button></div><div class="ue-dev-tools"><input class="ue-dev-input" id="ue-dev-search" type="search" placeholder="Поиск застройщика…" autocomplete="off"><select class="ue-dev-select" id="ue-dev-city"><option value="">Все города</option></select><select class="ue-dev-select" id="ue-dev-category" disabled><option value="">Все категории</option></select></div><div class="ue-dev-count" id="ue-dev-count">Загрузка каталога…</div><div class="ue-dev-grid" id="ue-dev-grid"><div class="ue-dev-status">Загружаем…</div></div></div></div>`);
    const modal = document.getElementById(MODAL);
    modal.addEventListener("click", e => { if (e.target === modal || e.target.closest(".ue-dev-close")) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    document.getElementById("ue-dev-search").addEventListener("input", render);
    document.getElementById("ue-dev-city").addEventListener("change", updateCategories);
    document.getElementById("ue-dev-category").addEventListener("change", render);
  }
  function open() { ensureModal(); const m=document.getElementById(MODAL);m.classList.add("is-open");m.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";load(); }
  function close() { const m=document.getElementById(MODAL);if(m){m.classList.remove("is-open");m.setAttribute("aria-hidden","true");document.body.style.overflow="";} }
  function addCategory() {
    const grid=document.getElementById("ue-category-grid");if(!grid||grid.querySelector("[data-developers-open]"))return;
    const card=document.createElement("div");card.className="ue-category ue-developers-category";card.dataset.developersOpen="1";card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","Открыть каталог застройщиков");
    card.innerHTML='<div style="position:relative;z-index:1"><div style="font-size:25px;margin-bottom:14px">⌂</div><div style="font-size:16px;font-weight:750;color:#202633">Застройщики</div><div style="font-size:12px;color:#747d8b;margin-top:6px">Компании, группы и контакты</div></div><div style="position:relative;z-index:1;display:flex;justify-content:space-between;margin-top:18px"><span id="ue-dev-card-count" style="font-size:11px;color:#747d8b">MAX</span><span style="font-size:18px;color:#ec407a">↗</span></div>';
    grid.appendChild(card);
  }
  function fill(select, values, placeholder) { const old=select.value;select.innerHTML=`<option value="">${esc(placeholder)}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");if(values.includes(old))select.value=old; }
  async function load() {
    if(dataCache){populate();render();return;}if(loading)return;loading=true;
    try { const r=await fetch(API,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const d=await r.json();if(!d.ok||!Array.isArray(d.developers))throw Error("Некорректный ответ API");dataCache=d;populate();render();const c=document.getElementById("ue-dev-card-count");if(c)c.textContent=`${d.count} компаний`; }
    catch(e){document.getElementById("ue-dev-grid").innerHTML='<div class="ue-dev-status">Не удалось загрузить каталог. Проверьте API /api/developers.</div>';document.getElementById("ue-dev-count").textContent="Ошибка загрузки";console.error("[UE developers]",e);}finally{loading=false;}
  }
  function populate(){fill(document.getElementById("ue-dev-city"),dataCache.cities||[],"Все города");updateCategories(false);}
  function updateCategories(doRender=true){if(!dataCache)return;const city=document.getElementById("ue-dev-city").value,select=document.getElementById("ue-dev-category");const opts=city?(dataCache.categoriesByCity?.[city]||[]):[...new Set(dataCache.developers.map(x=>x.category))].sort();fill(select,opts,"Все категории");select.disabled=!city;if(doRender)render();}
  function links(items, icon){if(!items?.length)return '<div class="ue-dev-empty"></div>';return items.map(x=>`<a class="ue-dev-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><span>${icon}</span><span>${esc(x.title||"Открыть ссылку")}</span></a>`).join("");}
  function card(x){const logo=x.image?`<img src="${esc(x.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:esc((x.name||"?").slice(0,2).toUpperCase());const contacts=x.contacts?.length?x.contacts.map(c=>`<div class="ue-dev-contact"><div class="ue-dev-contact-icon">♙</div><div><div class="ue-dev-contact-name">${esc(c.name||"Менеджер")}</div><a class="ue-dev-phone" href="tel:${esc(String(c.phone||"").replace(/[^\d+]/g,""))}">${esc(c.phone||"")}</a></div></div>`).join(""):'<div class="ue-dev-empty"></div>';
    return `<article class="ue-dev-card"><div class="ue-dev-top"><div class="ue-dev-logo">${logo}</div><div style="min-width:0"><h3 class="ue-dev-name">${esc(x.name)}</h3><div class="ue-dev-meta"><span class="ue-dev-chip">${esc(x.city)}</span><span class="ue-dev-chip">${esc(x.category)}</span></div></div></div><section class="ue-dev-section"><h4>Сайт и группы</h4>${links(x.groups,"↗")}</section><section class="ue-dev-section"><h4>Ресурсы</h4>${links(x.resources,"▤")}</section><section class="ue-dev-section"><h4>Контакты менеджеров</h4>${contacts}</section></article>`;
  }
  function render(){if(!dataCache)return;const q=document.getElementById("ue-dev-search").value.trim().toLocaleLowerCase("ru"),city=document.getElementById("ue-dev-city").value,cat=document.getElementById("ue-dev-category").value;const items=dataCache.developers.filter(x=>(!city||x.city===city)&&(!cat||x.category===cat)&&(!q||x.name.toLocaleLowerCase("ru").includes(q)));document.getElementById("ue-dev-count").textContent=`Найдено: ${items.length} из ${dataCache.developers.length}`;document.getElementById("ue-dev-grid").innerHTML=items.length?items.map(card).join(""):'<div class="ue-dev-status">По вашему запросу ничего не найдено.</div>';}
  function init(){styles();ensureModal();addCategory();document.addEventListener("click",e=>{if(e.target.closest("[data-developers-open]")){e.preventDefault();open();}});document.addEventListener("keydown",e=>{if(e.target.closest?.("[data-developers-open]")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();open();}});const grid=document.getElementById("ue-category-grid");if(grid&&window.MutationObserver)new MutationObserver(addCategory).observe(grid,{childList:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

