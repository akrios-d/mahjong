"use strict";
/* Word list for Desenho & Adivinha (drawing & guessing). Simple, concrete,
   drawable nouns in Portuguese. */
const WORDS = [
  "cachorro", "gato", "casa", "carro", "sol", "lua", "estrela", "árvore", "flor", "peixe",
  "pássaro", "bola", "chapéu", "óculos", "guarda-chuva", "bicicleta", "avião", "barco",
  "coração", "nuvem", "chuva", "foguete", "robô", "fantasma", "coroa", "chave", "relógio",
  "telefone", "computador", "livro", "lápis", "tesoura", "pizza", "bolo", "sorvete",
  "hambúrguer", "café", "maçã", "banana", "uva", "elefante", "leão", "tigre", "cobra",
  "tartaruga", "borboleta", "abelha", "aranha", "dinossauro", "castelo", "ponte", "montanha",
  "praia", "futebol", "basquete", "violão", "piano", "tambor", "microfone", "câmera",
  "presente", "balão", "pipa", "escada", "porta", "janela", "cadeira", "mesa", "sapato",
  "camiseta", "boné", "luva", "anel", "vulcão", "arco-íris", "farol", "âncora", "trator",
  "foguetinho", "panela", "garfo", "faca", "escova de dentes", "sabonete", "toalha",
];

const api = { WORDS };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.DesenhoWords = api;
