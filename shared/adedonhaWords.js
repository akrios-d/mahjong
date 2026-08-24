"use strict";
/* Word bank used only so AI bots can propose plausible answers for the
   built-in default categories in Adedonha. Custom categories typed by
   players are NOT covered (bots just leave those blank) — the word bank
   is intentionally small and not meant to validate human answers, only
   to give bots something reasonable to write. */

const DEFAULT_CATEGORIES = ["País", "Fruta", "Animal", "Cor", "Nome", "Objeto", "Cidade", "Profissão"];

function stripAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalize(s) {
  return stripAccents(String(s || "")).trim().toLowerCase();
}

const WORD_BANK = {
  pais: {
    A: ["Alemanha", "Argentina", "Argélia"], B: ["Brasil", "Bolívia", "Bélgica"],
    C: ["Chile", "Canadá", "China", "Colômbia", "Cuba"], D: ["Dinamarca"],
    E: ["Espanha", "Egito", "Equador"], F: ["França"], G: ["Grécia", "Guatemala"],
    H: ["Holanda", "Honduras"], I: ["Itália", "Índia", "Indonésia", "Irlanda", "Israel"],
    J: ["Japão", "Jamaica"], L: ["Líbano"], M: ["México", "Marrocos"],
    N: ["Noruega", "Nicarágua"], P: ["Portugal", "Peru", "Panamá", "Paraguai"],
    R: ["Rússia"], S: ["Suécia", "Suíça"], T: ["Turquia", "Tailândia"],
    U: ["Uruguai"], V: ["Venezuela"],
  },
  fruta: {
    A: ["Abacaxi", "Abacate", "Ameixa"], B: ["Banana", "Bergamota"],
    C: ["Caju", "Coco", "Cereja"], F: ["Figo", "Framboesa"], G: ["Goiaba", "Graviola"],
    J: ["Jabuticaba", "Jaca"], K: ["Kiwi"], L: ["Laranja", "Limão"],
    M: ["Manga", "Maçã", "Melancia", "Mamão", "Morango", "Melão"],
    N: ["Nectarina"], P: ["Pêra", "Pêssego", "Pitanga"], R: ["Romã"],
    T: ["Tangerina"], U: ["Uva"],
  },
  animal: {
    A: ["Águia", "Aranha", "Abelha"], B: ["Baleia", "Boi", "Borboleta"],
    C: ["Cachorro", "Cavalo", "Cobra", "Coelho"], E: ["Elefante"], F: ["Foca"],
    G: ["Gato", "Girafa", "Gorila"], H: ["Hipopótamo", "Hiena"], J: ["Jacaré"],
    L: ["Leão", "Lobo", "Leopardo"], M: ["Macaco", "Morcego"],
    O: ["Onça", "Ovelha", "Orangotango"], P: ["Pato", "Peixe", "Panda", "Pinguim"],
    R: ["Rato", "Raposa"], S: ["Sapo"], T: ["Tigre", "Tartaruga", "Tubarão"],
    U: ["Urso", "Urubu"], V: ["Vaca"], Z: ["Zebra"],
  },
  cor: {
    A: ["Amarelo", "Azul"], B: ["Bege", "Branco"], C: ["Cinza"], D: ["Dourado"],
    L: ["Lilás"], M: ["Marrom", "Magenta"], P: ["Preto", "Púrpura", "Prata", "Pink"],
    R: ["Roxo", "Rosa", "Rubi"], T: ["Turquesa"], V: ["Verde", "Vermelho", "Violeta"],
  },
  nome: {
    A: ["Ana", "André", "Antônio", "Alice"], B: ["Bruno", "Beatriz", "Bernardo"],
    C: ["Carlos", "Camila", "Carla"], D: ["Daniel", "Diego", "Diana"],
    E: ["Eduardo", "Elena", "Elisa"], F: ["Felipe", "Fernanda", "Fábio"],
    G: ["Gabriel", "Gustavo", "Giovanna"], H: ["Helena", "Henrique"],
    I: ["Igor", "Isabela", "Isadora"], J: ["João", "Julia", "José", "Juliana"],
    L: ["Lucas", "Laura", "Leonardo"], M: ["Marcos", "Maria", "Mateus", "Marina"],
    N: ["Natália", "Nicolas"], O: ["Otávio", "Olívia"], P: ["Pedro", "Paula", "Patrícia"],
    R: ["Rafael", "Renata", "Ricardo"], S: ["Sofia", "Sérgio", "Sara"],
    T: ["Tiago", "Tatiana"], V: ["Vitor", "Vanessa", "Valentina"],
  },
  objeto: {
    A: ["Almofada", "Abajur"], B: ["Bola", "Bolsa"], C: ["Cadeira", "Caneta", "Copo", "Chave"],
    E: ["Escova", "Espelho"], F: ["Faca"], G: ["Garfo"], J: ["Janela"],
    L: ["Lápis", "Livro"], M: ["Mesa", "Mochila", "Martelo"], O: ["Óculos"],
    P: ["Panela", "Porta", "Prato"], R: ["Relógio", "Régua"], S: ["Sapato"],
    T: ["Telefone", "Tesoura", "Tapete"], V: ["Vaso", "Vassoura"],
  },
  cidade: {
    A: ["Amsterdã"], B: ["Berlim", "Bogotá", "Brasília"], C: ["Cairo", "Curitiba"],
    D: ["Dublin"], L: ["Lisboa", "Londres", "Lima"], M: ["Madri", "Manaus", "Miami"],
    N: ["Natal"], O: ["Osaka"], P: ["Paris", "Praga", "Porto"],
    R: ["Roma", "Recife"], S: ["Salvador", "Santiago", "Sydney"],
    T: ["Tóquio", "Toronto"], V: ["Veneza"],
  },
  profissao: {
    A: ["Advogado", "Arquiteto", "Ator"], B: ["Bombeiro", "Bancário"],
    C: ["Cozinheiro", "Cabeleireiro"], D: ["Dentista", "Designer"],
    E: ["Engenheiro", "Enfermeiro", "Escritor"], F: ["Farmacêutico", "Fotógrafo"],
    J: ["Jardineiro", "Jornalista"], M: ["Médico", "Mecânico", "Motorista"],
    P: ["Professor", "Pintor", "Piloto"], T: ["Técnico"], V: ["Veterinário"],
  },
};

function pickWord(category, letter) {
  const bank = WORD_BANK[normalize(category)];
  if (!bank) return null;
  const options = bank[letter.toUpperCase()];
  if (!options || options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

const AW_API = { DEFAULT_CATEGORIES, WORD_BANK, normalize, stripAccents, pickWord };
if (typeof module !== "undefined" && module.exports) module.exports = AW_API;
if (typeof window !== "undefined") window.AdedonhaWords = AW_API;
