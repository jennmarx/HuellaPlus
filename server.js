require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));


// ================================
// ESTADOS TEMPORALES DE INSTAGRAM
// ================================

const instagramStates = new Map();


// ================================
// ESTADO DEL SERVIDOR
// ================================

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    message: "Huella+ está funcionando correctamente 🚀"
  });
});


// ================================
// INSTAGRAM - INICIO DE SESION
// ================================

app.get("/auth/instagram", async (req, res) => {

  try {

    const authHeader =
      req.headers.authorization || "";


    if (!authHeader.startsWith("Bearer ")) {

      return res.status(401).json({

        ok: false,

        message:
          "Debes iniciar sesión en Huella+."

      });

    }


    const supabaseAccessToken =
      authHeader
        .replace("Bearer ", "")
        .trim();


    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_PUBLISHABLE_KEY
    ) {

      return res.status(500).json({

        ok: false,

        message:
          "Falta configurar la conexión con Supabase."

      });

    }


    // ================================
    // VERIFICAR USUARIO DE SUPABASE
    // ================================

    const userResponse =
      await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/user`,
        {

          headers: {

            apikey:
              process.env.SUPABASE_PUBLISHABLE_KEY,

            Authorization:
              `Bearer ${supabaseAccessToken}`

          }

        }
      );


    const userData =
      await userResponse.json();


    if (
      !userResponse.ok ||
      !userData.id
    ) {

      return res.status(401).json({

        ok: false,

        message:
          "La sesión de Huella+ no es válida."

      });

    }


    // ================================
    // CREAR STATE DE SEGURIDAD
    // ================================

    const state =
      crypto.randomBytes(32).toString("hex");


    instagramStates.set(
      state,
      {

        userId:
          userData.id,

        createdAt:
          Date.now()

      }
    );


    // El state será válido durante 10 minutos

    setTimeout(
      () => {

        instagramStates.delete(state);

      },
      10 * 60 * 1000
    );


    // ================================
    // CREAR URL DE INSTAGRAM
    // ================================

    const instagramUrl =
      new URL(
        "https://www.instagram.com/oauth/authorize"
      );


    instagramUrl.searchParams.set(
      "client_id",
      process.env.META_APP_ID
    );


    instagramUrl.searchParams.set(
      "redirect_uri",
      process.env.INSTAGRAM_REDIRECT_URI
    );


    instagramUrl.searchParams.set(
      "response_type",
      "code"
    );


    instagramUrl.searchParams.set(
      "scope",
      "instagram_business_basic"
    );


    instagramUrl.searchParams.set(
      "state",
      state
    );


    // ================================
    // RESPONDER AL FRONTEND
    // ================================

    if (
      req.headers.accept &&
      req.headers.accept.includes("application/json")
    ) {

      return res.json({
        ok: true,
        url: instagramUrl.toString()
      });

    }


    // Si alguien entra directamente a la ruta,
    // seguimos permitiendo la redirección normal.

    return res.redirect(
      instagramUrl.toString()
    );


  } catch (error) {

    console.error(
      "Error iniciando Instagram OAuth:",
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        "No fue posible iniciar la conexión con Instagram."

    });

  }

});


// ================================
// INSTAGRAM - CALLBACK
// ================================

app.get(
  "/auth/instagram/callback",
  (req, res) => {

    const {
      code,
      state,
      error,
      error_description
    } = req.query;


    // ================================
    // USUARIO CANCELÓ
    // ================================

    if (error) {

      return res.status(400).send(`

        <h2>
          Conexión con Instagram cancelada
        </h2>

        <p>
          ${
            error_description ||
            "La autorización fue cancelada."
          }
        </p>

        <p>
          Puedes cerrar esta ventana y volver a Huella+.
        </p>

      `);

    }


    // ================================
    // VERIFICAR STATE
    // ================================

    if (!state) {

      return res.status(400).send(
        "Falta el parámetro de seguridad."
      );

    }


    const stateData =
      instagramStates.get(state);


    if (!stateData) {

      return res.status(400).send(
        "La sesión de autorización expiró o no es válida."
      );

    }


    // El state ya cumplió su función

    instagramStates.delete(state);


    // ================================
    // VERIFICAR CODE
    // ================================

    if (!code) {

      return res.status(400).send(
        "Instagram no devolvió el código de autorización."
      );

    }


    // ================================
    // PRUEBA DEL CALLBACK
    // ================================

    console.log(
      "Instagram autorizó al usuario de Huella+:",
      stateData.userId
    );


    // Todavía NO guardamos el token.
    // Eso lo haremos en el siguiente paso.


    return res.send(`

      <h2>
        Instagram autorizado correctamente 🎉
      </h2>

      <p>
        Huella+ recibió la autorización de Instagram.
      </p>

      <p>
        Ya podemos continuar con la conexión de la cuenta.
      </p>

      <p>
        Puedes cerrar esta ventana.
      </p>

    `);

  }
);


// ================================
// INSTAGRAM - PERFIL
// ================================

app.get("/api/instagram/profile", async (req, res) => {

  try {

    const token =
      process.env.INSTAGRAM_ACCESS_TOKEN;


    if (!token) {

      return res.status(500).json({

        ok: false,

        message:
          "No se encontró el token de Instagram."

      });

    }


    const profileUrl =
      new URL(
        "https://graph.instagram.com/me"
      );


    profileUrl.searchParams.set(
      "fields",
      "id,username"
    );


    profileUrl.searchParams.set(
      "access_token",
      token
    );


    const response =
      await fetch(profileUrl);


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "Error de Instagram:",
        data
      );


      return res.status(
        response.status
      ).json({

        ok: false,

        message:
          "Instagram no pudo devolver los datos del perfil."

      });

    }


    return res.json({

      ok: true,

      profile: data

    });


  } catch (error) {

    console.error(
      "Error conectando con Instagram:",
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        "No fue posible conectar con Instagram."

    });

  }

});


// ================================
// FUNCION CENTRAL DE ANALISIS
// ================================

function analizarTextoHuella(
  text,
  context = "No especificado",
  options = {}
) {

  const {
    locationVisible = false,
    academicContext = false,
    ambiguousContext = false
  } = options;


  const texto =
    String(text || "").toLowerCase();


  const warnings = [];
  const observations = [];


  // ================================
  // UBICACION
  // ================================

  const locationWords = [

    "estoy en",
    "vivo en",
    "mi dirección",
    "mi direccion",
    "mi casa",
    "ubicación",
    "ubicacion",
    "location",
    "bucaramanga",
    "floridablanca",
    "girón",
    "giron",
    "bogotá",
    "bogota",
    "medellín",
    "medellin",
    "cali",
    "cartagena"

  ];


  const textHasLocation =
    locationWords.some(
      (word) =>
        texto.includes(word)
    );


  if (
    locationVisible ||
    textHasLocation
  ) {

    warnings.push(
      "Podría revelar información sobre tu ubicación."
    );


    observations.push({

      icon: "📍",

      title: "Ubicación",

      description:
        "La publicación puede permitir relacionar el contenido con un lugar específico."

    });

  }


  // ================================
  // CONTEXTO ACADEMICO
  // ================================

  if (academicContext) {

    observations.push({

      icon: "🎓",

      title: "Contexto académico",

      description:
        "El contenido puede asociarse con tu vida universitaria y con la imagen que proyectas en ese entorno."

    });

  }


  // ================================
  // DIFERENTES INTERPRETACIONES
  // ================================

  if (ambiguousContext) {

    observations.push({

      icon: "👀",

      title: "Diferentes interpretaciones",

      description:
        "Una persona que no conoce el contexto completo podría interpretar la publicación de otra manera."

    });

  }


  // ================================
  // INFORMACION PERSONAL
  // ================================

  const personalWords = [

    "cédula",
    "cedula",
    "documento",
    "teléfono",
    "telefono",
    "número",
    "numero",
    "contraseña",
    "password",
    "correo",
    "email",
    "gmail.com"

  ];


  const textHasPersonalData =
    personalWords.some(
      (word) =>
        texto.includes(word)
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


  // ================================
  // INFORMACION DE CONTACTO
  // ================================

  const contactWords = [

    "whatsapp",
    "escríbeme al",
    "escribeme al",
    "contáctame",
    "contactame",
    "dm",
    "link en bio"

  ];


  const textHasContact =
    contactWords.some(
      (word) =>
        texto.includes(word)
    );


  if (textHasContact) {

    observations.push({

      icon: "📱",

      title: "Información de contacto",

      description:
        "La publicación incluye referencias que pueden dirigir a otras personas hacia tus canales de contacto."

    });

  }


  // ================================
  // HASHTAGS
  // ================================

  const hashtags =
    text.match(
      /#[\wáéíóúñÁÉÍÓÚÑ]+/g
    ) || [];


  if (hashtags.length >= 5) {

    observations.push({

      icon: "#️⃣",

      title: "Cantidad de hashtags",

      description:
        "La publicación utiliza varios hashtags que amplían la información asociada públicamente al contenido."

    });

  }


  // ================================
  // NIVEL
  // ================================

  let level =
    "Bajo cuidado";


  if (warnings.length === 1) {

    level =
      "Requiere reflexión";

  }


  if (warnings.length >= 2) {

    level =
      "Alto cuidado";

  }


  // ================================
  // MENSAJE
  // ================================

  let message;


  if (observations.length === 0) {

    message =
      "No detectamos señales de cuidado en esta revisión.";

  } else {

    message =
      "Huella+ detectó algunos aspectos que podrías revisar antes de publicar.";

  }


  return {

    ok: true,

    level,

    warnings,

    observations,

    context,

    message

  };

}


// ================================
// INSTAGRAM - PUBLICACIONES
// ================================

app.get("/api/instagram/media", async (req, res) => {

  try {

    const token =
      process.env.INSTAGRAM_ACCESS_TOKEN;


    if (!token) {

      return res.status(500).json({

        ok: false,

        message:
          "No se encontró el token de Instagram."

      });

    }


    const mediaUrl =
      new URL(
        "https://graph.instagram.com/me/media"
      );


    mediaUrl.searchParams.set(
      "fields",
      "id,caption,media_type,media_url,permalink,timestamp"
    );


    mediaUrl.searchParams.set(
      "limit",
      "10"
    );


    mediaUrl.searchParams.set(
      "access_token",
      token
    );


    const response =
      await fetch(mediaUrl);


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "Error obteniendo publicaciones:",
        data
      );


      return res.status(
        response.status
      ).json({

        ok: false,

        message:
          "Instagram no pudo devolver las publicaciones."

      });

    }


    // ================================
    // ANALIZAR CADA PUBLICACION
    // ================================

    const publicaciones =
      (data.data || []).map(
        (publicacion) => {

          const caption =
            publicacion.caption || "";


          const analysis =
            analizarTextoHuella(
              caption,
              "Instagram"
            );


          return {

            ...publicacion,

            analysis

          };

        }
      );


    return res.json({

      ok: true,

      media: publicaciones,

      paging:
        data.paging || null

    });


  } catch (error) {

    console.error(
      "Error obteniendo publicaciones de Instagram:",
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        "No fue posible obtener las publicaciones de Instagram."

    });

  }

});


// ================================
// ANALIZAR PUBLICACION MANUAL
// ================================

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

      message:
        "No se recibió ninguna publicación."

    });

  }


  const resultado =
    analizarTextoHuella(

      text,

      context || "No especificado",

      {

        locationVisible,

        academicContext,

        ambiguousContext

      }

    );


  return res.json(resultado);

});


// ================================
// INICIAR SERVIDOR
// ================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "Huella+ está funcionando en el puerto " +
      PORT
    );

  }
);