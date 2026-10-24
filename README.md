# Chess vs AI

A chess game you play in the browser against a computer opponent. It has no dependencies and no build step.

**To play:** open `index.html` in any modern browser.

## Features
- **Two modes**, switched with the Classic / Random toggle at the top of the panel:
  - **Classic:** standard chess (the default).
  - **Random:** each side's 16 pawns and pieces are shuffled together across its first two rows,
    separately for each side, every game. Bishops always land on opposite colours, setups where a
    king starts in check are rerolled, and castling is disabled. A pawn that starts on the back
    row moves one square at a time; only pawns on their normal starting row can move two.
- Full rules: castling, en passant, promotion (with a piece picker), check, checkmate, stalemate,
  the 50-move rule, threefold repetition and insufficient material
- Move by clicking or by dragging pieces
- Works on phones in portrait and landscape: tap or drag with a finger, and the status line stays above the board
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
