/**
 * Pantalla de carga de Resellap. Solo aparece al abrir o recargar la página
 * (no al cambiar de pantalla dentro de la app: para eso está la barra fina
 * de carga). Las cuatro piezas del símbolo se ensamblan, la diagonal —la
 * venta— entra la última y, cuando la página está lista, el símbolo se
 * encoge hacia su centro y la pantalla se desvanece.
 *
 * Sin JavaScript desaparece sola a los 3 s. Con «reducir animaciones» (del
 * sistema o de Ajustes) no hay movimiento: un fundido corto y listo.
 */
const A1 = "M0 0H38V50H0Z";
const A2 = "M43 0H71A25 25 0 0 1 71 50H43Z";
const A3 = "M0 55H38V96H0Z";
const B = "M43 55H67L96 96H72Z";

const CSS = `
#rs-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--paper);
  animation:rs-boot-failsafe .3s ease 3s forwards}
#rs-boot svg{width:56px;height:56px;overflow:visible}
#rs-boot .a{fill:var(--ink)} #rs-boot .b{fill:var(--brand-mark)}
#rs-boot path{transform-box:fill-box;transform-origin:center;opacity:0;animation:rs-piece .42s cubic-bezier(.2,.7,.2,1) forwards}
#rs-boot .p2{animation-delay:.06s} #rs-boot .p3{animation-delay:.12s}
#rs-boot .b{animation-name:rs-diag;animation-delay:.2s}
#rs-boot .bar{position:absolute;bottom:max(32px,env(safe-area-inset-bottom));left:50%;width:56px;height:2px;margin-left:-28px;border-radius:2px;background:var(--line);overflow:hidden}
#rs-boot .bar::after{content:"";position:absolute;inset:0;width:40%;background:var(--brand-mark);animation:rs-bar 1s ease-in-out infinite}
html.rs-booted #rs-boot{animation:rs-out .28s ease .16s forwards;pointer-events:none}
html.rs-booted #rs-boot svg{animation:rs-absorb .36s cubic-bezier(.6,0,.8,.4) forwards}
@keyframes rs-piece{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes rs-diag{from{opacity:0;transform:translate(-30%,-45%)}to{opacity:1;transform:none}}
@keyframes rs-absorb{0%{transform:none}100%{transform:scale(.05) rotate(90deg);opacity:0}}
@keyframes rs-out{to{opacity:0;visibility:hidden}}
@keyframes rs-boot-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
@keyframes rs-bar{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){
  #rs-boot path{animation:none;opacity:1} #rs-boot .bar{display:none}
  html.rs-booted #rs-boot svg{animation:none}
  html.rs-booted #rs-boot{animation:rs-out .15s linear forwards}
}
html[data-motion="reduce"] #rs-boot path{animation:none;opacity:1}
html[data-motion="reduce"] #rs-boot .bar{display:none}
html[data-motion="reduce"].rs-booted #rs-boot svg{animation:none}
@media print{#rs-boot{display:none}}
`;

// Se quita cuando la página ha cargado (mínimo 450 ms para que no parpadee).
const JS = `(function(){var t0=Date.now(),d=document.documentElement;function done(){var w=Math.max(0,450-(Date.now()-t0));setTimeout(function(){d.classList.add("rs-booted");setTimeout(function(){var e=document.getElementById("rs-boot");if(e)e.style.display="none"},700)},w)}if(document.readyState==="complete")done();else{addEventListener("load",done,{once:true});setTimeout(done,2500)}})();`;

export function BootSplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div id="rs-boot" role="status" aria-label="Cargando Resellap" suppressHydrationWarning>
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <path className="a" d={A1} />
          <path className="a p2" d={A2} />
          <path className="a p3" d={A3} />
          <path className="b" d={B} />
        </svg>
        <span className="bar" aria-hidden="true" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
