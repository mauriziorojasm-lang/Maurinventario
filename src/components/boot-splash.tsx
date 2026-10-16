/**
 * Pantalla de carga de Resellap. Solo aparece al abrir o recargar la página
 * (no al cambiar de pantalla dentro de la app: para eso está la barra fina
 * de carga). Las cuatro piezas del símbolo se ensamblan, la diagonal —la
 * venta— entra la última y el símbolo gira en sentido horario mientras carga.
 * Cuando la página está lista, gira más deprisa, se comprime hacia su centro
 * como un agujero negro y la pantalla se desvanece.
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
  animation:rs-boot-failsafe .3s ease 2.4s forwards}
#rs-boot .wrap{position:relative;width:56px;height:56px;display:grid;place-items:center}
#rs-boot svg{width:56px;height:56px;overflow:visible;animation:rs-spin 1.1s linear infinite}
#rs-boot .a{fill:var(--ink)} #rs-boot .b{fill:var(--brand-mark)}
#rs-boot path{transform-box:fill-box;transform-origin:center;opacity:0;animation:rs-piece .42s cubic-bezier(.2,.7,.2,1) forwards}
#rs-boot .p2{animation-delay:.06s} #rs-boot .p3{animation-delay:.12s}
#rs-boot .b{animation-name:rs-diag;animation-delay:.2s}
#rs-boot .hole{position:absolute;inset:50%;width:0;height:0;margin:0;border-radius:50%;background:radial-gradient(circle,#000 55%,var(--ink) 70%,transparent 72%);opacity:0;transform:translate(-50%,-50%)}
html.rs-booted #rs-boot{animation:rs-out .25s ease .5s forwards;pointer-events:none}
html.rs-booted #rs-boot svg{animation:rs-collapse .5s cubic-bezier(.55,0,.9,.4) forwards}
html.rs-booted #rs-boot .hole{animation:rs-core .5s ease forwards}
@keyframes rs-spin{to{transform:rotate(360deg)}}
@keyframes rs-piece{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes rs-diag{from{opacity:0;transform:translate(-30%,-45%)}to{opacity:1;transform:none}}
@keyframes rs-collapse{0%{transform:rotate(0) scale(1);opacity:1;filter:none}65%{transform:rotate(300deg) scale(.3);opacity:1}100%{transform:rotate(420deg) scale(0);opacity:0;filter:blur(2px)}}
@keyframes rs-core{0%{opacity:0;width:0;height:0}45%{opacity:1;width:120px;height:120px}100%{opacity:0;width:0;height:0}}
@keyframes rs-out{to{opacity:0;visibility:hidden}}
@keyframes rs-boot-failsafe{to{opacity:0;visibility:hidden;pointer-events:none}}
@media (prefers-reduced-motion:reduce){
  #rs-boot path{animation:none;opacity:1} #rs-boot svg{animation:none} #rs-boot .hole{display:none}
  html.rs-booted #rs-boot svg{animation:none}
  html.rs-booted #rs-boot{animation:rs-out .15s linear forwards}
}
html[data-motion="reduce"] #rs-boot path{animation:none;opacity:1}
html[data-motion="reduce"] #rs-boot svg{animation:none}
html[data-motion="reduce"] #rs-boot .hole{display:none}
html[data-motion="reduce"].rs-booted #rs-boot svg{animation:none}
@media print{#rs-boot{display:none}}
`;

// Se quita cuando la página ha cargado (mínimo 450 ms para que no parpadee).
const JS = `(function(){var t0=Date.now(),d=document.documentElement;function done(){var w=Math.max(0,450-(Date.now()-t0));setTimeout(function(){d.classList.add("rs-booted");setTimeout(function(){var e=document.getElementById("rs-boot");if(e)e.style.display="none"},700)},w)}if(document.readyState==="complete")done();else{addEventListener("load",done,{once:true});setTimeout(done,1800)}})();`;

export function BootSplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div id="rs-boot" role="status" aria-label="Cargando Resellap" suppressHydrationWarning>
        <div className="wrap">
          <svg viewBox="0 0 96 96" aria-hidden="true">
            <path className="a" d={A1} />
            <path className="a p2" d={A2} />
            <path className="a p3" d={A3} />
            <path className="b" d={B} />
          </svg>
          <span className="hole" aria-hidden="true" />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
