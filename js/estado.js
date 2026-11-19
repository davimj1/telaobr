/**
 * estado.js — Estado global do app (um objeto só; no F12 digite Telao pra ver).
 */
import { guardar } from "./util.js";

const CONFIG_PADRAO = { modoMic: "sempre", teclaPtt: "KeyV", qualidadeVoz: "voz", micId: "", sons: true };

export const S = {
  /* conta */
  user: null, nome: "", foto: "",
  afk: false,

  /* navegação */
  modo: "servidor",          // "servidor" | "dm"
  servidores: new Map(),     // id -> { nome, dono, membros, cargos, banidos, permissoes, criadoEm }
  atual: null,               // servidor aberto
  canais: new Map(),         // canais do servidor aberto: id -> { nome, tipo, ordem }
  canalAtual: null,          // canal aberto (texto ou voz)
  dms: new Map(),            // conversas diretas: id -> { membros, ultima }
  dmAtual: null,
  amizades: new Map(),       // uidA_uidB -> { de, para, status, membros }
  meuCodigo: null,           // meu código de amigo
  atividade: new Map(),      // canais de TODOS os meus servidores: sid -> Map(cid -> canal), pra saber o que é novo

  /* pessoas */
  perfis: new Map(),         // uid -> { nome, foto, visto, status }
  pessoas: new Map(),        // presença nos canais de voz do servidor ABERTO
  pessoasCall: new Map(),    // presença no servidor onde EU estou em call

  /* chat */
  mensagens: [],             // mensagens do chat aberto
  respondendo: null,         // { id, nome, texto }
  editando: null,            // id da mensagem que estou editando

  /* call */
  call: null,                // { sid, cid } onde estou conectado
  sessao: null, entrouEm: 0, batida: null,
  pares: new Map(),          // conexões WebRTC: uid -> par
  volumes: new Map(),        // uid -> volume (0 a 1)
  mic: null, cam: null, tela: null,
  surdo: false,
  apertandoPtt: false,

  /* preferências (salvas no navegador) */
  config: { ...CONFIG_PADRAO, ...JSON.parse(guardar.ler("telao-config") || "{}") },

  /* ouvintes do Firestore (funções pra cancelar) */
  parar: {},
};

export function salvarConfig() {
  guardar.salvar("telao-config", JSON.stringify(S.config));
}

/** Ordem fixa dos canais de mídia em cada conexão. */
export const CANAL = { MIC: 0, TELA: 1, SOM_TELA: 2, CAM: 3 };

/** Servidor aberto (ou undefined). */
export const servidorAtual = () => S.servidores.get(S.atual);

/** Para um ouvinte do Firestore pelo nome. */
export function parar(nome) {
  S.parar[nome]?.();
  delete S.parar[nome];
}

window.Telao = S;
