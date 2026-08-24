# Mahjong Solitaire & Landlord (斗地主)

Duas implementações originais, em HTML/CSS/JS puro (sem dependências, sem build),
dos dois mini-jogos clássicos chineses que aparecem em *Where Winds Meet*:

- **Mahjong Solitaire** (Turtle) — combine pares de peças livres até limpar o tabuleiro.
- **Landlord / Dou Dizhu (斗地主)** — jogo de cartas 1 "landlord" contra 2 "peasants",
  aqui jogado contra 2 bots.

Este projeto **não usa nenhum asset, código ou texto do jogo** *Where Winds Meet* —
é uma recriação independente das regras dos jogos tradicionais chineses (mahjong
solitaire e dou dizhu), que são de domínio público e existem em inúmeras outras
implementações há décadas.

## Como jogar

Basta abrir `index.html` num navegador (não precisa de servidor nem instalação).

- `mahjong/index.html` — Mahjong Solitaire
- `landlord/index.html` — Landlord (Dou Dizhu)

## Estrutura

```
index.html              landing page
style.css                estilos compartilhados da landing page
mahjong/
  index.html
  mahjong.css
  mahjong.js
landlord/
  index.html
  landlord.css
  landlord.js
```
