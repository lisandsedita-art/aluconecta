// acceso.js - AluConecta - Sistema de registro obligatorio
// 1. Copiar este archivo a tu repo
// 2. En cada pagina sensible agregar: <script src="acceso.js"></script>

function estaLogueado(){
  return localStorage.getItem('alu_user') !== null;
}
function getUser(){
  try{ return JSON.parse(localStorage.getItem('alu_user')); }catch(e){ return null; }
}
function proteger(tipo){
  // tipo = 'cliente' | 'profesional' | 'cualquiera'
  if(!estaLogueado()){
    const actual = window.location.pathname.split('/').pop() + window.location.search;
    window.location.href = 'ingresar.html?next=' + encodeURIComponent(actual) + '&req=' + tipo;
    return false;
  }
  return true;
}
function aplicarCandados(){
  const log = estaLogueado();
  document.querySelectorAll('.dato-sensible').forEach(el=>{
    if(log){
      el.classList.remove('bloqueado');
      const cand = el.querySelector('.candado-overlay');
      if(cand) cand.remove();
      el.style.filter = '';
    } else {
      if(el.querySelector('.candado-overlay')) return;
      el.style.position = 'relative';
      el.style.filter = 'blur(4px)';
      el.style.userSelect = 'none';
      el.insertAdjacentHTML('beforeend', `
        <div class="candado-overlay" style="position:absolute;inset:0;background:rgba(15,46,77,0.85);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;filter:none;cursor:pointer;z-index:10">
          <div style="font-size:18px">🔒</div>
          <div style="font-weight:700;font-size:13px;margin-top:4px;text-align:center">Registrate gratis<br>para ver este dato</div>
        </div>
      `);
      el.querySelector('.candado-overlay').onclick = ()=> window.location.href='registro.html';
    }
  });
}
document.addEventListener('DOMContentLoaded', aplicarCandados);
