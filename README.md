# Jogos de Mesa Online — Mahjong, Landlord, Dominó, Adedonha & Desenho

Cinco implementações originais, em HTML/CSS/JS puro no front-end (sem build,
sem frameworks) mais um servidor Node/WebSocket para o multiplayer, dos
jogos clássicos chineses/brasileiros/de festa que aparecem em
*Where Winds Meet* (ou combinam com o clima):

- **Mahjong Solitaire** (Turtle) — single-player: combine pares de peças
  livres até limpar o tabuleiro.
- **Landlord / Dou Dizhu (斗地主)** — multiplayer online (até 3 jogadores
  reais por sala) **ou** sozinho contra IA sem precisar de servidor.
- **Dominó em Duplas** — multiplayer online (até 4 jogadores reais por sala,
  em duplas fixas) **ou** sozinho contra IA sem precisar de servidor.
- **Adedonha** (Stop!) — até 8 jogadores propõem categorias, sorteiam a
  letra e escrevem palavras até alguém gritar "PARE!"; bots preenchem
  cadeiras vazias usando um banco de palavras para as categorias padrão.
- **Desenho & Adivinha** (estilo Gartic/Pictionary) — um jogador desenha,
  os outros adivinham pelo chat; só entre pessoas reais (desenhar e
  adivinhar não dá pra automatizar com bot aqui).

O app também funciona como **PWA**: dá pra instalar no celular/desktop e o
app shell funciona offline (o multiplayer sempre precisa de rede, mas o
Mahjong Solitaire e os modos "sozinho contra IA" funcionam sem internet
depois de instalado).

Este projeto **não usa nenhum asset, código ou texto do jogo**
*Where Winds Meet* — é uma recriação independente das regras de jogos
tradicionais chineses e brasileiros, que são de domínio público.

## Rodando localmente

O Mahjong Solitaire e os modos **"sozinho contra IA"** do Landlord/Dominó
não precisam de servidor — é só abrir o `index.html` do jogo no navegador.

Landlord, Dominó, Adedonha e Desenho (multiplayer online) precisam do
servidor WebSocket rodando (ele guarda o estado das mesas e comanda a IA):

```bash
cd server
npm install
npm start        # sobe em ws://localhost:8787 (ou $PORT, se definido)
```

Depois abra o `index.html` do jogo — o endereço do servidor já vem
pré-preenchido como `ws://localhost:8787`. Cada pessoa que quiser jogar
entra com o mesmo código de sala; quem estiver na sala pode clicar em
**"Começar com IA"** (Landlord/Dominó/Adedonha) para preencher as cadeiras
vazias com bots, ou **"Começar só com quem entrou"** (Adedonha/Desenho)
para travar a sala só com quem já está presente.

> Se alguém desconectar no meio da partida, a IA assume o assento
> automaticamente (exceto no Desenho, que não tem bots — o assento só
> fica marcado como desconectado).

## Publicando o servidor (ex.: Render)

O servidor é um app Node comum (`server/server.js`, escuta em
`process.env.PORT`), então funciona em qualquer host que rode Node com
WebSocket — Render inclusive:

1. Crie um **Web Service** no Render apontando para este repositório.
2. **Root Directory**: `server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. O Render injeta `PORT` automaticamente — o servidor já lê `process.env.PORT`.
6. Depois do deploy, use a URL que o Render te dá, trocando `https://` por
   `wss://`, no campo "Endereço do servidor" da tela de login do jogo
   (ex.: `wss://seu-app.onrender.com`).

O front-end (`index.html` e as pastas de cada jogo) pode ficar em qualquer
hospedagem estática (GitHub Pages, Render Static Site, etc.) — ele só
precisa saber o endereço do WebSocket do servidor.

## Regras do Dominó adotadas

- 28 peças (double-six), 4 jogadores recebem 6 peças cada (24), as 4
  peças restantes formam o **morto**: ficam de lado, escondidas, e nunca
  são compradas ou reveladas durante a partida.
- Duplas fixas: assentos 1+3 contra 2+4 (parceiros sentados de frente).
- Abre quem tiver a maior carroça (peça dobrada) na mão; se ninguém tiver
  nenhuma (pode acontecer porque 4 peças ficam escondidas no morto), abre
  quem tiver a peça de maior soma de pontos.
- Partida vai até **6 pontos**. Pontuação por tipo de batida:
  - **Batida normal** — bate com peça comum: **1 ponto**
  - **Carroça** — bate com peça dobrada: **2 pontos**
  - **Lá-e-lô** — jogo tranca (ninguém consegue jogar) e as duas pontas
    do tabuleiro ficam com o mesmo número: **3 pontos**
  - **Cruzada** — bate com peça dobrada e essa jogada deixa as duas pontas
    do tabuleiro com o mesmo número: **4 pontos**
  - Quando o jogo tranca sem as pontas iguais, vence a dupla com menor
    soma de pontos na mão (marca 1 ponto, "batida normal por pontos"); em
    caso de empate de soma, a mão é redistribuída sem pontuar.

Essas definições foram a interpretação padrão adotada para a implementação;
se no seu grupo alguma dessas 4 batidas funciona diferente, é só pedir o
ajuste.

## Regras da Adedonha adotadas

- Até 8 jogadores; qualquer um propõe categorias (máx. 8) ou usa o botão
  de categorias padrão (País, Fruta, Animal, Cor, Nome, Objeto, Cidade,
  Profissão).
- Uma letra é sorteada por rodada (sem repetir até esgotar o alfabeto).
  Todo mundo escreve, e quem gritar "PARE!" encerra a rodada na hora
  (ou o tempo acaba sozinho em 60s).
- Pontuação por categoria: resposta válida (começa com a letra sorteada)
  e única entre os jogadores = **10 pontos**; válida mas repetida por mais
  de um jogador = **5 pontos** cada; inválida ou em branco = **0**.
- Os bots só respondem categorias que reconhecem (as padrão); categoria
  personalizada não reconhecida fica em branco para eles.

## Limitações conhecidas

- Sem reconexão "retomando o mesmo assento": se você cair da sala durante
  uma partida, a IA assume seu lugar imediatamente (exceto no Desenho).
- Sem espectadores — a sala aceita só o número de assentos do jogo.
- Landlord não implementa avião (trincas consecutivas) nem sequências de
  pares — só single, par, trinca, trinca+1, trinca+par, sequência, bomba
  e rocket.
- Adedonha não valida se a palavra realmente existe/pertence à categoria
  (fica no sistema de honra, como no jogo físico) — só confere se começa
  com a letra sorteada e se é única entre as respostas.
- Desenho & Adivinha não tem bots (nenhuma IA desenha ou adivinha aqui).

## Estrutura

```
index.html                    landing page
style.css
manifest.json / sw.js / icons/   PWA (instalável, app shell offline)
shared/
  pwa.js                        registra o service worker
  roomUtils.js                  helpers de sala/assento comuns a todos os jogos
  landlordRules.js / landlordEngine.js     regras + orquestração do Landlord
  dominoRules.js / dominoEngine.js          regras + orquestração do Dominó
  adedonhaWords.js / adedonhaEngine.js      banco de palavras + orquestração da Adedonha
  desenhoWords.js / desenhoEngine.js        banco de palavras + orquestração do Desenho
server/
  server.js                     servidor WebSocket (salas, estado autoritativo, IA)
  package.json
mahjong/                        Mahjong Solitaire (single-player)
landlord/                       Landlord — online ou sozinho contra IA
domino/                         Dominó em duplas — online ou sozinho contra IA
adedonha/                       Adedonha — online (com bots)
desenho/                        Desenho & Adivinha — online (sem bots)
```
