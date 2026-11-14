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
 * STUN resolve a maioria das redes. Se algum amigo não conseguir ver/ouvir,
 * crie um TURN grátis (ex.: Metered.ca) e descomente a linha de baixo.
 */
export const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // { urls: "turn:SEU_SERVIDOR:3478", username: "usuario", credential: "senha" },
  ],
};

/** Qualidades de transmissão de tela (bitrate = bits por segundo por pessoa assistindo). */
export const QUALIDADES = {
  "720p30":  { rotulo: "720p 30",  width: 1280, height: 720,  frameRate: 30, bitrate: 2_500_000 },
  "1080p30": { rotulo: "1080p 30", width: 1920, height: 1080, frameRate: 30, bitrate: 4_500_000 },
  "1080p60": { rotulo: "1080p 60", width: 1920, height: 1080, frameRate: 60, bitrate: 7_000_000 },
};

/** Limites e tempos do sistema. */
export const LIMITES = {
  mensagensNoChat: 200,      // quantas mensagens antigas carregar
  tamanhoMensagem: 500,      // caracteres por mensagem
  tamanhoNomeServidor: 40,   // caracteres no nome do servidor
  batidaPresencaMs: 10_000,  // a cada quanto tempo avisa "ainda estou na call"
  presencaExpiraMs: 35_000,  // sem avisar por esse tempo = saiu da call
  bitrateCamera: 1_000_000,  // câmera leve pra sobrar banda pra tela
};
