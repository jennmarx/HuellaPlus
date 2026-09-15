const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    message: "Huella+ está funcionando correctamente 🚀"
  });
});

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

  if (academicContext) {
    observations.push({
      icon: "🎓",
      title: "Contexto académico",
      description:
        "El contenido puede asociarse con tu vida universitaria y con la imagen que proyectas en ese entorno."
    });
  }

  if (ambiguousContext) {
    observations.push({
      icon: "👀",
      title: "Diferentes interpretaciones",
      description:
        "Una persona que no conoce el contexto completo podría interpretar la publicación de otra manera."
    });
  }

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

  let level = "Bajo cuidado";

  if (warnings.length === 1) {
    level = "Requiere reflexión";
  }

  if (warnings.length >= 2) {
    level = "Alto cuidado";
  }

  let message;

  if (observations.length === 0) {
    message =
      "No detectamos señales de cuidado en esta revisión.";
  } else {
    message =
      "Huella+ detectó algunos aspectos que podrías revisar antes de publicar.";
  }

  res.json({
    ok: true,
    level,
    warnings,
    observations,
    context: context || "No especificado",
    message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Huella+ está funcionando en el puerto ${PORT}`);
});