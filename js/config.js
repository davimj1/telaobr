/**
 * config.js — Configurações do Telão.
 * Tudo que você pode querer mudar sem mexer na lógica fica aqui.
 */

/** Projeto do Firebase (Console → Configurações do projeto → Seus apps). */
export const firebaseConfig = {
  apiKey: "AIzaSyBDF5sBzSjxWTTghkF1Gm7TzFYCkb0Lg8Q",
  authDomain: "telaobr.firebaseapp.com",
  projectId: "telaobr",
  storageBucket: "telaobr.firebasestorage.app",
  messagingSenderId: "270740684038",
  appId: "1:270740684038:web:210f5124c34f60f5b6f287",
  measurementId: "G-0M4QS5D2E5",
};

/**
 * Servidores que ajudam as pessoas a se conectarem direto (WebRTC).
 * STUN resolve a maioria das redes (Wi-Fi de casa).
 */
export const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

/**
 * TURN: "ponte" pra quem está no 4G, na rede da faculdade ou da empresa
 * e entra na call mas não ouve/vê ninguém. Passo a passo no LEIA-ME (seção 4).
 *
 * Jeito 1 (recomendado) — pelo próprio site: clique na sua foto → "Ponte de conexão (TURN)",
 *   cole o Username e o Password da Metered e salve. A senha fica no Firestore (config/turn),
 *   NÃO aqui no código. Só quem entrou com Google lê; só quem salvou primeiro pode trocar.
 * Jeito 2 — Metered com API Key: preencha meteredApp e meteredChave.
 * Jeito 3 — servidores fixos aqui (a senha fica visível no GitHub).
 */
export const TURN = {
  meteredApp: "",
  meteredChave: "",
  servidores: [],
};

/** Qualidades de transmissão de tela (bitrate = bits por segundo por pessoa assistindo). */
export const QUALIDADES = {
  "720p30":  { rotulo: "720p 30",  width: 1280, height: 720,  frameRate: 30, bitrate: 2_500_000 },
  "1080p30": { rotulo: "1080p 30", width: 1920, height: 1080, frameRate: 30, bitrate: 4_500_000 },
  "1080p60": { rotulo: "1080p 60", width: 1920, height: 1080, frameRate: 60, bitrate: 7_000_000 },
};

/** Qualidades de voz ("codec"): voz limpa ou som de alta qualidade. */
export const QUALIDADES_VOZ = {
  voz:    { rotulo: "Voz (reduz ruído e eco)", bitrate: 40_000,  processar: true,  estereo: false },
  musica: { rotulo: "Alta qualidade (música, instrumento)", bitrate: 128_000, processar: false, estereo: true },
};

/** Limites e tempos do sistema. */
export const LIMITES = {
  mensagensNoChat: 100,        // quantas mensagens antigas carregar por canal
  tamanhoMensagem: 2000,       // caracteres por mensagem
  tamanhoNome: 40,             // nome de servidor e canal
  imagemLado: 1280,            // imagens são reduzidas pra no máximo 1280px
  imagemQualidade: 0.72,       // compressão JPEG/WebP
  arquivoMaxBytes: 700_000,    // arquivos (não imagem) até ~700 KB
  batidaPresencaMs: 10_000,    // a cada quanto tempo avisa "ainda estou na call"
  presencaExpiraMs: 35_000,    // sem avisar por esse tempo = saiu da call
  batidaOnlineMs: 60_000,      // a cada quanto tempo avisa "estou online"
  onlineExpiraMs: 3 * 60_000,  // sem avisar por esse tempo = offline
  digitandoMs: 3000,          // de quanto em quanto tempo aviso que estou digitando
  digitandoExpiraMs: 6500,    // some "está digitando" depois disso sem sinal
  buscaMaxMensagens: 1000,    // quantas mensagens antigas a busca olha
  afkMinutos: 10,              // sem mexer no mouse/teclado = AFK
  bitrateCamera: 1_000_000,
};

/* ============================================================ cargos e permissões */

/** Cargos, do mais forte pro mais fraco. */
export const CARGOS = {
  dono:    { rotulo: "Dono",      nivel: 3, cor: "#ff7a1a" },
  admin:   { rotulo: "Admin",     nivel: 2, cor: "#ef4444" },
  mod:     { rotulo: "Moderador", nivel: 1, cor: "#3b82f6" },
  membro:  { rotulo: "Membro",    nivel: 0, cor: "#a39a90" },
};

/** Tudo que pode ser liberado ou bloqueado por cargo. */
export const PERMISSOES = {
  criarCanais:      "Criar canais",
  gerenciarCanais:  "Editar e apagar canais",
  fixar:            "Fixar mensagens",
  apagarMensagens:  "Apagar mensagens dos outros",
  enviarArquivos:   "Enviar imagens e arquivos",
  transmitir:       "Transmitir tela",
  expulsar:         "Expulsar membros",
  banir:            "Banir membros",
  gerenciarCargos:  "Dar cargos e mudar permissões",
};

/** Permissões que todo servidor novo começa. O dono sempre pode tudo. */
export const PERMISSOES_PADRAO = {
  admin:  Object.fromEntries(Object.keys(PERMISSOES).map(p => [p, true])),
  mod:    { criarCanais: true, gerenciarCanais: false, fixar: true, apagarMensagens: true, enviarArquivos: true,
            transmitir: true, expulsar: true, banir: false, gerenciarCargos: false },
  membro: { criarCanais: false, gerenciarCanais: false, fixar: false, apagarMensagens: false, enviarArquivos: true,
            transmitir: true, expulsar: false, banir: false, gerenciarCargos: false },
};

/* ============================================================ modelos de servidor */

/** Canais criados automaticamente conforme o modelo escolhido. */
export const MODELOS = {
  gamer: {
    rotulo: "🎮 Gamer",
    canais: [
      { nome: "geral", tipo: "texto" }, { nome: "clipes-e-prints", tipo: "texto" },
      { nome: "Lobby", tipo: "voz" }, { nome: "Jogando", tipo: "voz" }, { nome: "AFK", tipo: "voz" },
    ],
  },
  amigos: {
    rotulo: "🍿 Amigos",
    canais: [
      { nome: "geral", tipo: "texto" }, { nome: "memes", tipo: "texto" },
      { nome: "Bate-papo", tipo: "voz" }, { nome: "Cinema", tipo: "voz" },
    ],
  },
  estudos: {
    rotulo: "📚 Estudos",
    canais: [
      { nome: "avisos", tipo: "texto" }, { nome: "duvidas", tipo: "texto" }, { nome: "materiais", tipo: "texto" },
      { nome: "Sala de estudo", tipo: "voz" }, { nome: "Grupo", tipo: "voz" },
    ],
  },
  vazio: {
    rotulo: "✨ Simples",
    canais: [{ nome: "geral", tipo: "texto" }, { nome: "Bate-papo", tipo: "voz" }],
  },
};

/* ============================================================ emojis */

export const REACOES_RAPIDAS = ["👍", "😂", "❤️", "🔥", "😮", "😢"];

export const EMOJIS = {
  "Carinhas": "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖",
  "Gestos": "👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫡 🫶",
  "Corações": "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝",
  "Jogos": "🎮 🕹️ 🎯 🎲 ♟️ 🏆 🥇 🥈 🥉 🏅 ⚽ 🏀 🏈 🎾 🏐 🎳 🏓 🥊 🎰 🧩 🗡️ ⚔️ 🛡️ 🏹 💣 🔫",
  "Coisas": "🔥 ✨ ⭐ 🌟 💫 ⚡ 💥 💯 ✅ ❌ ⚠️ ❓ ❗ 💤 💬 👀 🎉 🎊 🎁 🎂 🍕 🍔 🍟 🍿 🥤 ☕ 🍺 💰 💸 📌 📎 🎵 🎶 🎧 🎤 📺 💻 📱 🖥️ 🚀 🌙 ☀️ 🌈",
};
