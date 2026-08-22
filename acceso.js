// AluConecta - Bloqueo de datos sensibles
document.addEventListener("DOMContentLoaded", function(){
  const logueado = localStorage.getItem("alu_user");
  
  document.querySelectorAll(".dato-sensible").forEach(caja=>{
    if(!logueado){
      // Guardamos el contenido real
      if(!caja.dataset.real) caja.dataset.real = caja.innerHTML;
      
      caja.innerHTML = `
        <div style="text-align:center;padding:20px">
          <div style="font-size:40px">🔒</div>
          <p style="font-weight:bold;margin:10px 0">Contenido exclusivo para usuarios registrados</p>
          <p style="font-size:13px;color:#666">Registrate gratis para ver WhatsApp, Instagram, Web y teléfono</p>
          <a href="registro.html" style="display:inline-block;margin-top:12px;padding:12px 22px;background:#0F2E4D;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Registrate gratis para ver</a>
          <a href="ingresar.html" style="display:block;margin-top:10px;color:#0F2E4D;font-size:13px">¿Ya tenés cuenta? Ingresá</a>
        </div>
      `;
      caja.style.filter = "none";
      caja.style.background = "#fffbeb";
      caja.style.border = "2px dashed #f59e0b";
    }
  });
});
