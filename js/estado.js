/**
 * estado.js — Estado global do app (um objeto só, fácil de inspecionar no F12: window.Telao).
 */
export const S = {
  // conta
  user: null,          // usuário do Firebase Auth
  nome: "",
  foto: "",

  // servidores
  servidores: new Map(), // id -> { nome, dono, membros, criadoEm }
  atual: null,           // id do servidor aberto na tela

  // call
  call: null,            // id do servidor onde estou em call (ou null)
  sessao: null,          // id aleatório desta entrada na call (muda a cada entrada)
  entrouEm: 0,
  batida: null,          // setInterval da presença
  pessoas: new Map(),    // quem está na call do servidor aberto: uid -> dados
  pares: new Map(),      // conexões WebRTC: uid -> par
  mic: null, cam: null, tela: null, // MediaStreams locais
  surdo: false,

  // ouvintes do Firestore (funções para cancelar)
  pararServidores: null, pararChat: null, pararPessoas: null, pararSinais: null,
};

/** Ordem fixa dos canais de mídia em cada conexão. */
export const CANAL = { MIC: 0, TELA: 1, SOM_TELA: 2, CAM: 3 };

window.Telao = S; // ajuda a depurar pelo console
