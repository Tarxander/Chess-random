# Chess vs AI

A chess game you play in the browser against a computer opponent. It has no dependencies and no build step.

**To play:** open `index.html` in any modern browser.

## Features
- **Randomized start** (default): each side's back-row pieces are shuffled separately every game.
  Bishops always land on opposite colours and castling is disabled. Switch "Starting pieces" to
  Classic for the normal setup.
- Full rules: castling, en passant, promotion (with a piece picker), check, checkmate, stalemate,
  the 50-move rule, threefold repetition and insufficient material
- Move by clicking or by dragging pieces (works with touch)
- Play as White, Black or a random colour
- Four difficulty levels: Easy, Medium, Hard, Expert
- Undo, board flip, hints, a move list in algebraic notation, captured pieces and the material balance

## How the AI works
`engine.js` contains the rules engine and the AI. The AI uses negamax alpha-beta search with
iterative deepening, quiescence search, check extensions, MVV-LVA move ordering, and an
evaluation based on material and piece-square tables. Lower levels search less deeply and add
random noise to their choices.

Move generation is checked against standard perft counts:
`node -e "const C=require('./engine.js'); console.log(new C.Game().perft(4))"` → `197281`.
