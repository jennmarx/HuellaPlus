```js
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Permite recibir datos en formato JSON
app.use(express.json());

// Servir la aplicación visual
app.use(express.static(path.join(__dirname, "public")));

// Ruta de prueba
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    message: "Huella+ está funcionando correctamente 🚀"
  });
});

// Analizar una publicación de prueba
app.post("/api/analyze", (req, res) => {
  const {
    text,
    context,
    locationVisible = false,
    academicContext = false,
    ambiguousContext = false
  } = req.body;

  if (!text) {
    return res.status(400).json({
      ok: false,
      message: "No se recibió ninguna publicación."
    });
  }

  const warnings = [];
  const observations = [];

  // -----------------------------------
  // 1. UBICACIÓN
  // -----------------------------------

  const locationWords = [
    "estoy en",
    "vivo en",
    "mi dirección",
    "mi casa",
    "ubicación",
    "location"
  ];

  const textHasLocation = locationWords.some(word =>
    text.toLowerCase().includes(word)
  );

  if (locationVisible || textHasLocation) {
    warnings.push(
      "Podría revelar información sobre tu ubicación."
    );

    observations.push({
      icon: "📍",
      title: "Ubicación",
      description:
        "La publicación permite relacionar el contenido con un lugar específico."
    });
  }

  // -----------------------------------
  // 2. CONTEXTO ACADÉMICO
  // -----------------------------------

  if (academicContext) {
    observations.push({
      icon: "🎓",
      title: "Contexto académico",
      description:
        "El contenido puede asociarse con tu vida universitaria y con la imagen que proyectas en ese entorno."
    });
  }

  // -----------------------------------
  // 3. DIFERENTES INTERPRETACIONES
  // -----------------------------------

  if (ambiguousContext) {
    observations.push({
      icon: "👀",
      title: "Diferentes interpretaciones",
      description:
        "Una persona que no conoce el contexto completo podría interpretar la publicación de otra manera."
    });
  }

  // -----------------------------------
  // 4. DATOS PERSONALES
  // -----------------------------------

  const personalWords = [
    "cédula",
    "documento",
    "teléfono",
    "número",
    "contraseña"
  ];

  const textHasPersonalData = personalWords.some(word =>
    text.toLowerCase().includes(word)
  );

  if (textHasPersonalData) {
    warnings.push(
      "Podría contener información personal que conviene proteger."
    );

    observations.push({
      icon: "🔐",
      title: "Información personal",
      description:
        "El contenido podría exponer información que conviene mantener protegida."
    });
  }

  // -----------------------------------
  // 5. NIVEL DE CUIDADO
  // -----------------------------------

  let level = "Bajo cuidado";

  if (warnings.length === 1) {
    level = "Requiere reflexión";
  }

  if (warnings.length >= 2) {
    level = "Alto cuidado";
  }

  // -----------------------------------
  // 6. MENSAJE FINAL
  // -----------------------------------

  let message;

  if (observations.length === 0) {
    message =
      "No detectamos señales de cuidado en esta revisión.";
  } else {
    message =
      "Huella+ detectó algunos aspectos que podrías revisar antes de publicar.";
  }

  // -----------------------------------
  // 7. RESPUESTA AL FRONTEND
  // -----------------------------------

  res.json({
    ok: true,
    level,
    warni
```
