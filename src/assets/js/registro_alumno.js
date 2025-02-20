// Archivo: registro_alumno.js

document.addEventListener('DOMContentLoaded', function () {
  
  // Función para mostrar u ocultar campos condicionales
  function toggleFieldContainer(selectElementId, containerElementId, valueToShow) {
    const selectElement = document.getElementById(selectElementId);
    const containerElement = document.getElementById(containerElementId);
    containerElement.style.display = selectElement.value === valueToShow ? 'block' : 'none';
  }

  // Eventos para mostrar u ocultar campos adicionales en el formulario
  document.getElementById('seguro-medico').addEventListener('change', function () {
    toggleFieldContainer('seguro-medico', 'nombre-seguro-container', 'si');
  });

  document.getElementById('alergias').addEventListener('change', function () {
    toggleFieldContainer('alergias', 'detalle-alergias-container', 'si');
  });

  document.getElementById('alergico-medicamento').addEventListener('change', function () {
    toggleFieldContainer('alergico-medicamento', 'detalle-medicamento-container', 'si');
  });

  document.getElementById('actividad-fisica').addEventListener('change', function () {
    toggleFieldContainer('actividad-fisica', 'detalle-deporte-container', 'si');
  });

  document.getElementById('practico-futbol').addEventListener('change', function () {
    const equiposParticipadosContainer = document.getElementById('equipos-participados-container');
    const posicionCampoContainer = document.getElementById('posicion-campo-container');
    if (this.value === 'si') {
      equiposParticipadosContainer.style.display = 'block';
      posicionCampoContainer.style.display = 'block';
    } else {
      equiposParticipadosContainer.style.display = 'none';
      posicionCampoContainer.style.display = 'none';
    }
  });

  document.getElementById('enterado').addEventListener('change', function () {
    toggleFieldContainer('enterado', 'otra-fuente-container', 'otra');
  });

  document.getElementById('hermano-inscrito').addEventListener('change', function () {
    toggleFieldContainer('hermano-inscrito', 'nombre-hermano-container', 'si');
  });

  // Función para controlar la selección de habilidades (máximo 3)
  function checkHabilidades() {
    const checkboxes = document.querySelectorAll('input[name="habilidades"]:checked');
    if (checkboxes.length > 3) {
      alert('Solo puedes seleccionar hasta 3 habilidades.');
      event.target.checked = false;
    }
  }

  // Evento para verificar el número de habilidades seleccionadas
  const habilidadesCheckboxes = document.querySelectorAll('input[name="habilidades"]');
  habilidadesCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('click', checkHabilidades);
  });

  // Evento para validar la selección de habilidades al enviar el formulario
  document.getElementById('registro-alumno-form').addEventListener('submit', function(event) {
    const checkboxes = document.querySelectorAll('input[name="habilidades"]:checked');
    if (checkboxes.length !== 3) {
      alert('Debe seleccionar exactamente 3 habilidades para continuar.');
      event.preventDefault();
    } else {
      // Concatenar las habilidades seleccionadas en una sola cadena separada por comas
      const habilidadesSeleccionadas = Array.from(checkboxes).map(checkbox => checkbox.value).join(',');
      document.getElementById('habilidades-seleccionadas').value = habilidadesSeleccionadas;
    }
  });

  // Función para confirmar la cancelación del registro
  function confirmarCancelarRegistro() {
    const confirmar = confirm("¿Estás seguro de que deseas cancelar el registro? Se perderá toda la información ingresada.");
    if (confirmar) {
      const userId = document.getElementById('userId').value; // Obtiene el ID del usuario
      if (userId) {
        window.location.href = `/panel-principal/${userId}`;
      } else {
        alert("Error: No se pudo obtener el ID del usuario. Inténtalo de nuevo.");
      }
    }
  }

  // Asignar eventos al botón de cancelación
  document.querySelector('button[onclick="confirmarCancelarRegistro()"]').addEventListener('click', confirmarCancelarRegistro);

});
