require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURACIÓN
// ============================================================

const INSTAGRAM_REDIRECT_URI =
  process.env.INSTAGRAM_REDIRECT_URI ||
  "https://huellaplus.onrender.com/auth/instagram/callback";

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


// ============================================================
// ESTADOS TEMPORALES DE INSTAGRAM
// ============================================================

const instagramStates = new Map();


// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

async function obtenerUsuarioSupabase(accessToken) {

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY
  ) {

    throw new Error(
      "Falta configurar la conexión con Supabase."
    );

  }

  const response =
    await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey:
            process.env.SUPABASE_PUBLISHABLE_KEY,

          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.id
  ) {

    return null;

  }

  return data;

}


async function obtenerUsuarioDesdeRequest(req) {

  const authHeader =
    req.headers.authorization || "";

  if (
    !authHeader.startsWith("Bearer ")
  ) {

    return null;

  }

  const accessToken =
    authHeader
      .replace("Bearer ", "")
      .trim();

  if (!accessToken) {

    return null;

  }

  return await obtenerUsuarioSupabase(
    accessToken
  );

}


async function obtenerConexionInstagram(userId) {

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {

    throw new Error(
      "Falta configurar la clave segura de Supabase."
    );

  }

  const response =
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/instagram_connections?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,instagram_user_id,instagram_username,access_token,token_expires_at`,
      {
        headers: {
          apikey:
            process.env.SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    console.error(
      "Error consultando conexión de Instagram:",
      data
    );

    throw new Error(
      "No fue posible consultar la conexión de Instagram."
    );

  }

  return data[0] || null;

}


// ============================================================
// ESTADO DEL SERVIDOR
// ============================================================

app.get("/api/status", (req, res) => {

  res.json({

    ok: true,

    message:
      "Huella+ está funcionando correctamente 🚀"

  });

});


// ============================================================
// INSTAGRAM - INICIO DE SESIÓN
// ============================================================

app.get(
  "/auth/instagram",
  async (req, res) => {

    try {

      const authHeader =
        req.headers.authorization || "";

      if (
        !authHeader.startsWith("Bearer ")
      ) {

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

      const userData =
        await obtenerUsuarioSupabase(
          supabaseAccessToken
        );

      if (!userData) {

        return res.status(401).json({

          ok: false,

          message:
            "La sesión de Huella+ no es válida."

        });

      }

      if (
        !process.env.META_APP_ID ||
        !process.env.META_APP_SECRET
      ) {

        return res.status(500).json({

          ok: false,

          message:
            "Falta configurar la conexión con Instagram."

        });

      }


      // ======================================================
      // CREAR STATE
      // ======================================================

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


      setTimeout(
        () => {

          instagramStates.delete(state);

        },
        10 * 60 * 1000
      );


      // ======================================================
      // CREAR URL DE INSTAGRAM BUSINESS LOGIN
      // ======================================================

      const instagramUrl =
        new URL(
          "https://www.instagram.com/oauth/authorize"
        );

      instagramUrl.searchParams.set(
        "force_reauth",
        "true"
      );

      instagramUrl.searchParams.set(
        "client_id",
        process.env.META_APP_ID
      );

      instagramUrl.searchParams.set(
        "redirect_uri",
        INSTAGRAM_REDIRECT_URI
      );

      instagramUrl.searchParams.set(
        "response_type",
        "code"
      );

      instagramUrl.searchParams.set(
        "scope",
        [
          "instagram_business_basic",
          "instagram_business_manage_messages",
          "instagram_business_manage_comments",
          "instagram_business_content_publish",
          "instagram_business_manage_insights"
        ].join(",")
      );

      instagramUrl.searchParams.set(
        "state",
        state
      );


      console.log(
        "Instagram OAuth iniciado."
      );

      console.log(
        "Redirect URI:",
        INSTAGRAM_REDIRECT_URI
      );


      // ======================================================
      // RESPONDER AL FRONTEND
      // ======================================================

      if (
        req.headers.accept &&
        req.headers.accept.includes(
          "application/json"
        )
      ) {

        return res.json({

          ok: true,

          url:
            instagramUrl.toString()

        });

      }


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

  }
);


// ============================================================
// INSTAGRAM - CALLBACK
// ============================================================

app.get(
  "/auth/instagram/callback",
  async (req, res) => {

    const {
      code,
      state,
      error,
      error_description
    } = req.query;


    // ========================================================
    // USUARIO CANCELÓ
    // ========================================================

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


    // ========================================================
    // VERIFICAR STATE
    // ========================================================

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


    instagramStates.delete(state);


    // ========================================================
    // VERIFICAR CODE
    // ========================================================

    const instagramCode =
      String(code || "").trim();


    if (!instagramCode) {

      return res.status(400).send(
        "Instagram no devolvió el código de autorización."
      );

    }


    // ========================================================
    // DEPURACIÓN SEGURA DEL CODE
    //
    // NO mostramos el código completo.
    // Solo longitud y primeros/últimos caracteres.
    // ========================================================

    console.log(
      "Código recibido:",
      instagramCode.length,
      "caracteres"
    );

    console.log(
      "Código empieza por:",
      instagramCode.slice(0, 10)
    );

    console.log(
      "Código termina por:",
      instagramCode.slice(-10)
    );


    try {

      console.log(
        "Instagram autorizó al usuario de Huella+:",
        stateData.userId
      );


      // ======================================================
      // VARIABLES
      // ======================================================

      if (
        !process.env.META_APP_ID ||
        !process.env.META_APP_SECRET
      ) {

        throw new Error(
          "Faltan variables de configuración de Meta."
        );

      }


      if (
        !process.env.SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {

        throw new Error(
          "Falta configurar la clave segura de Supabase."
        );

      }


      // ======================================================
      // INTERCAMBIAR CODE POR TOKEN
      //
      // Instagram Business Login utiliza
      // application/x-www-form-urlencoded.
      // ======================================================

      const tokenForm =
        new URLSearchParams();

      tokenForm.set(
        "client_id",
        process.env.META_APP_ID
      );

      tokenForm.set(
        "client_secret",
        process.env.META_APP_SECRET
      );

      tokenForm.set(
        "grant_type",
        "authorization_code"
      );

      tokenForm.set(
        "redirect_uri",
        INSTAGRAM_REDIRECT_URI
      );

      tokenForm.set(
        "code",
        instagramCode
      );


      console.log(
        "Intercambiando código de Instagram."
      );

      console.log(
        "Redirect URI utilizado:",
        INSTAGRAM_REDIRECT_URI
      );


      const tokenResponse =
        await fetch(
          "https://api.instagram.com/oauth/access_token",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              tokenForm.toString()

          }
        );


      const tokenText =
        await tokenResponse.text();


      let tokenData;

      try {

        tokenData =
          JSON.parse(tokenText);

      } catch {

        tokenData = {
          raw: tokenText
        };

      }


      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {

        console.error(
          "Error intercambiando código de Instagram:",
          tokenData
        );

        throw new Error(
          "Instagram no permitió obtener el token."
        );

      }


      const shortLivedToken =
        tokenData.access_token;


      // ======================================================
      // TOKEN DE MAYOR DURACIÓN
      // ======================================================

      const longTokenUrl =
        new URL(
          "https://graph.instagram.com/access_token"
        );


      longTokenUrl.searchParams.set(
        "grant_type",
        "ig_exchange_token"
      );


      longTokenUrl.searchParams.set(
        "client_secret",
        process.env.META_APP_SECRET
      );


      longTokenUrl.searchParams.set(
        "access_token",
        shortLivedToken
      );


      const longTokenResponse =
        await fetch(longTokenUrl);


      const longTokenData =
        await longTokenResponse.json();


      let accessToken =
        shortLivedToken;


      let expiresIn =
        null;


      if (
        longTokenResponse.ok &&
        longTokenData.access_token
      ) {

        accessToken =
          longTokenData.access_token;

        expiresIn =
          longTokenData.expires_in || null;

      }


      // ======================================================
      // OBTENER PERFIL
      // ======================================================

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
        accessToken
      );


      const profileResponse =
        await fetch(profileUrl);


      const profileData =
        await profileResponse.json();


      if (
        !profileResponse.ok ||
        !profileData.id ||
        !profileData.username
      ) {

        console.error(
          "Error obteniendo perfil de Instagram:",
          profileData
        );

        throw new Error(
          "No fue posible obtener el perfil de Instagram."
        );

      }


      // ======================================================
      // EXPIRACIÓN
      // ======================================================

      let tokenExpiresAt =
        null;


      if (expiresIn) {

        tokenExpiresAt =
          new Date(
            Date.now() +
            Number(expiresIn) * 1000
          ).toISOString();

      }


      // ======================================================
      // HEADERS SUPABASE
      // ======================================================

      const supabaseHeaders = {

        "Content-Type":
          "application/json",

        apikey:
          process.env.SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,

        Prefer:
          "resolution=merge-duplicates,return=minimal"

      };


      // ======================================================
      // GUARDAR CONEXIÓN
      // ======================================================

      const connectionResponse =
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/instagram_connections?on_conflict=user_id`,
          {

            method: "POST",

            headers:
              supabaseHeaders,

            body:
              JSON.stringify({

                user_id:
                  stateData.userId,

                instagram_user_id:
                  String(profileData.id),

                instagram_username:
                  profileData.username,

                access_token:
                  accessToken,

                token_expires_at:
                  tokenExpiresAt,

                updated_at:
                  new Date().toISOString()

              })

          }
        );


      if (!connectionResponse.ok) {

        const connectionError =
          await connectionResponse.text();


        console.error(
          "Error guardando conexión de Instagram:",
          connectionError
        );


        throw new Error(
          "No fue posible guardar la conexión de Instagram."
        );

      }


      // ======================================================
      // ACTUALIZAR MIS REDES
      // ======================================================

      const socialResponse =
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/social_accounts?on_conflict=user_id,platform`,
          {

            method: "POST",

            headers:
              supabaseHeaders,

            body:
              JSON.stringify({

                user_id:
                  stateData.userId,

                platform:
                  "instagram",

                username:
                  profileData.username,

                updated_at:
                  new Date().toISOString()

              })

          }
        );


      if (!socialResponse.ok) {

        const socialError =
          await socialResponse.text();


        console.error(
          "Error actualizando Mis redes:",
          socialError
        );

      }


      console.log(
        `Instagram conectado correctamente: @${profileData.username}`
      );


      return res.redirect(
        "/?instagram=connected"
      );


    } catch (error) {

      console.error(
        "Error completando conexión de Instagram:",
        error
      );


      return res.status(500).send(`

        <h2>
          No se pudo completar la conexión con Instagram
        </h2>

        <p>
          ${error.message}
        </p>

        <p>
          Puedes cerrar esta ventana y volver a Huella+.
        </p>

      `);

    }

  }
);


// ============================================================
// INSTAGRAM - PERFIL
// ============================================================

app.get(
  "/api/instagram/profile",
  async (req, res) => {

    try {

      const user =
        await obtenerUsuarioDesdeRequest(req);


      if (!user) {

        return res.status(401).json({

          ok: false,

          message:
            "Debes iniciar sesión en Huella+."

        });

      }


      const connection =
        await obtenerConexionInstagram(
          user.id
        );


      if (!connection) {

        return res.status(404).json({

          ok: false,

          message:
            "No tienes una cuenta de Instagram conectada."

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
        connection.access_token
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

  }
);


// ============================================================
// FUNCIÓN CENTRAL DE ANÁLISIS
// ============================================================

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


  // ==========================================================
  // UBICACIÓN
  // ==========================================================

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


  // ==========================================================
  // CONTEXTO ACADÉMICO
  // ==========================================================

  if (academicContext) {

    observations.push({

      icon: "🎓",

      title: "Contexto académico",

      description:
        "El contenido puede asociarse con tu vida universitaria y con la imagen que proyectas en ese entorno."

    });

  }


  // ==========================================================
  // DIFERENTES INTERPRETACIONES
  // ==========================================================

  if (ambiguousContext) {

    observations.push({

      icon: "👀",

      title: "Diferentes interpretaciones",

      description:
        "Una persona que no conoce el contexto completo podría interpretar la publicación de otra manera."

    });

  }


  // ==========================================================
  // INFORMACIÓN PERSONAL
  // ==========================================================

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


  // ==========================================================
  // INFORMACIÓN DE CONTACTO
  // ==========================================================

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


  // ==========================================================
  // HASHTAGS
  // ==========================================================

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


  // ==========================================================
  // NIVEL
  // ==========================================================

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


  // ==========================================================
  // MENSAJE
  // ==========================================================

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


// ============================================================
// INSTAGRAM - PUBLICACIONES
// ============================================================

app.get(
  "/api/instagram/media",
  async (req, res) => {

    try {

      const user =
        await obtenerUsuarioDesdeRequest(req);


      if (!user) {

        return res.status(401).json({

          ok: false,

          message:
            "Debes iniciar sesión en Huella+."

        });

      }


      const connection =
        await obtenerConexionInstagram(
          user.id
        );


      if (!connection) {

        return res.status(404).json({

          ok: false,

          message:
            "No tienes una cuenta de Instagram conectada."

        });

      }


      // ======================================================
      // OBTENER PUBLICACIONES
      // ======================================================

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
        connection.access_token
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


      // ======================================================
      // ANALIZAR PUBLICACIONES
      // ======================================================

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

        media:
          publicaciones,

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

  }
);


// ============================================================
// ANALIZAR PUBLICACIÓN MANUAL
// ============================================================

app.post(
  "/api/analyze",
  (req, res) => {

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

        context ||
          "No especificado",

        {
          locationVisible,
          academicContext,
          ambiguousContext
        }

      );


    return res.json(
      resultado
    );

  }
);


// ============================================================
// INICIAR SERVIDOR
// ============================================================

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