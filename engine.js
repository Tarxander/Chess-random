// Chess rules engine + AI. Works in the browser (window.Chess) and in Node (module.exports).
// Board uses 0x88 layout: square = row * 16 + col, row 0 is rank 8. Uppercase = white.
(function (root) {
  'use strict';

  const WK = 1, WQ = 2, BK = 4, BQ = 8;
  const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
  const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
  const BISHOP = [-17, -15, 15, 17];
  const ROOK = [-16, -1, 1, 16];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const isWhite = (p) => p >= 'A' && p <= 'Z';
  const colorOf = (p) => (isWhite(p) ? 'w' : 'b');
  const typeOf = (p) => p.toLowerCase();
  const sqName = (sq) => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));
  const nameSq = (n) => (8 - parseInt(n[1], 10)) * 16 + 'abcdefgh'.indexOf(n[0]);

  class Game {
    constructor(fen) { this.load(fen || START); }

    load(fen) {
      const [pos, turn, castle, ep, half, full] = fen.split(/\s+/);
      this.board = new Array(128).fill(null);
      let row = 0, col = 0;
      for (const ch of pos) {
        if (ch === '/') { row++; col = 0; }
        else if (/\d/.test(ch)) col += +ch;
        else { this.board[row * 16 + col] = ch; col++; }
      }
      this.turn = turn || 'w';
      this.castling = 0;
      if (castle && castle !== '-') {
        if (castle.includes('K')) this.castling |= WK;
        if (castle.includes('Q')) this.castling |= WQ;
        if (castle.includes('k')) this.castling |= BK;
        if (castle.includes('q')) this.castling |= BQ;
      }
      this.ep = ep && ep !== '-' ? nameSq(ep) : -1;
      this.halfmove = +(half || 0);
      this.fullmove = +(full || 1);
      this.history = [];
      this.positions = [this.key()];
      this.kings = { w: -1, b: -1 };
      for (let sq = 0; sq < 128; sq++) {
        if (this.board[sq] === 'K') this.kings.w = sq;
        if (this.board[sq] === 'k') this.kings.b = sq;
      }
    }

    // Position identity for repetition detection (placement + side + castling + ep).
    key() {
      let s = '';
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; s += '/'; continue; }
        s += this.board[sq] || '.';
      }
      return s + this.turn + this.castling + this.ep;
    }

    fen() {
      let s = '';
      for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let col = 0; col < 8; col++) {
          const p = this.board[row * 16 + col];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          s += p;
        }
        if (empty) s += empty;
        if (row < 7) s += '/';
      }
      let c = '';
      if (this.castling & WK) c += 'K';
      if (this.castling & WQ) c += 'Q';
      if (this.castling & BK) c += 'k';
      if (this.castling & BQ) c += 'q';
      return `${s} ${this.turn} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
    }

    attacked(sq, by) {
      const b = this.board;
      const pawnDir = by === 'w' ? 16 : -16; // look "behind" sq for attacking pawns
      const P = by === 'w' ? 'P' : 'p', N = by === 'w' ? 'N' : 'n', K = by === 'w' ? 'K' : 'k';
      const B = by === 'w' ? 'B' : 'b', R = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q';
      for (const d of [pawnDir - 1, pawnDir + 1]) {
        const t = sq + d;
        if (!(t & 0x88) && b[t] === P) return true;
      }
      for (const d of KNIGHT) { const t = sq + d; if (!(t & 0x88) && b[t] === N) return true; }
      for (const d of KING) { const t = sq + d; if (!(t & 0x88) && b[t] === K) return true; }
      for (const d of BISHOP) {
        for (let t = sq + d; !(t & 0x88); t += d) {
          if (b[t]) { if (b[t] === B || b[t] === Q) return true; break; }
        }
      }
      for (const d of ROOK) {
        for (let t = sq + d; !(t & 0x88); t += d) {
          if (b[t]) { if (b[t] === R || b[t] === Q) return true; break; }
        }
      }
      return false;
    }

    inCheck(color = this.turn) {
      return this.attacked(this.kings[color], color === 'w' ? 'b' : 'w');
    }

    pseudoMoves(capturesOnly = false) {
      const moves = [], b = this.board, us = this.turn, them = us === 'w' ? 'b' : 'w';
      const add = (from, to, flag) => {
        const piece = b[from];
        const captured = flag === 'e' ? (us === 'w' ? 'p' : 'P') : b[to];
        if (typeOf(piece) === 'p' && ((to >> 4) === 0 || (to >> 4) === 7)) {
          for (const pr of 'qrbn') moves.push({ from, to, piece, captured, promo: us === 'w' ? pr.toUpperCase() : pr, flag });
        } else {
          moves.push({ from, to, piece, captured, promo: null, flag });
        }
      };
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || colorOf(p) !== us) continue;
        const t = typeOf(p);
        if (t === 'p') {
          const dir = us === 'w' ? -16 : 16;
          const startRow = us === 'w' ? 6 : 1;
          const one = sq + dir;
          if (!(one & 0x88) && !b[one]) {
            const promoting = (one >> 4) === 0 || (one >> 4) === 7;
            if (!capturesOnly || promoting) add(sq, one);
            const two = one + dir;
            if (!capturesOnly && (sq >> 4) === startRow && !b[two]) add(sq, two, 'd');
          }
          for (const d of [dir - 1, dir + 1]) {
            const c = sq + d;
            if (c & 0x88) continue;
            if (b[c] && colorOf(b[c]) === them) add(sq, c);
            else if (c === this.ep) add(sq, c, 'e');
          }
        } else if (t === 'n' || t === 'k') {
          for (const d of t === 'n' ? KNIGHT : KING) {
            const c = sq + d;
            if (c & 0x88) continue;
            if (!b[c]) { if (!capturesOnly) add(sq, c); }
            else if (colorOf(b[c]) === them) add(sq, c);
          }
          if (t === 'k' && !capturesOnly) this.castleMoves(sq, add);
        } else {
          const dirs = t === 'b' ? BISHOP : t === 'r' ? ROOK : KING;
          for (const d of dirs) {
            for (let c = sq + d; !(c & 0x88); c += d) {
              if (!b[c]) { if (!capturesOnly) add(sq, c); continue; }
              if (colorOf(b[c]) === them) add(sq, c);
              break;
            }
          }
        }
      }
      return moves;
    }

    castleMoves(sq, add) {
      const b = this.board, us = this.turn, them = us === 'w' ? 'b' : 'w';
      const home = us === 'w' ? 116 : 4; // e1 / e8
      if (sq !== home || this.attacked(sq, them)) return;
      const [kFlag, qFlag] = us === 'w' ? [WK, WQ] : [BK, BQ];
      if ((this.castling & kFlag) && !b[sq + 1] && !b[sq + 2] &&
          !this.attacked(sq + 1, them) && !this.attacked(sq + 2, them)) add(sq, sq + 2, 'k');
      if ((this.castling & qFlag) && !b[sq - 1] && !b[sq - 2] && !b[sq - 3] &&
          !this.attacked(sq - 1, them) && !this.attacked(sq - 2, them)) add(sq, sq - 2, 'q');
    }

    moves(capturesOnly = false) {
      const legal = [];
      for (const m of this.pseudoMoves(capturesOnly)) {
        this.make(m);
        if (!this.inCheck(m.piece === m.piece.toUpperCase() ? 'w' : 'b')) legal.push(m);
        this.undo();
      }
      return legal;
    }

    make(m) {
      const b = this.board, us = this.turn;
      this.history.push({ move: m, castling: this.castling, ep: this.ep, halfmove: this.halfmove });
      b[m.to] = m.promo || m.piece;
      b[m.from] = null;
      if (m.flag === 'e') b[m.to + (us === 'w' ? 16 : -16)] = null;
      if (m.flag === 'k') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
      if (m.flag === 'q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
      if (typeOf(m.piece) === 'k') this.kings[us] = m.to;
      // Any move touching a king/rook home square clears the matching castling right.
      for (const sq of [m.from, m.to]) {
        if (sq === 116) this.castling &= ~(WK | WQ);
        else if (sq === 119) this.castling &= ~WK;
        else if (sq === 112) this.castling &= ~WQ;
        else if (sq === 4) this.castling &= ~(BK | BQ);
        else if (sq === 7) this.castling &= ~BK;
        else if (sq === 0) this.castling &= ~BQ;
      }
      this.ep = m.flag === 'd' ? (m.from + m.to) >> 1 : -1;
      this.halfmove = typeOf(m.piece) === 'p' || m.captured ? 0 : this.halfmove + 1;
      if (us === 'b') this.fullmove++;
      this.turn = us === 'w' ? 'b' : 'w';
      this.positions.push(this.key());
    }

    undo() {
      const h = this.history.pop();
      if (!h) return null;
      const m = h.move, b = this.board;
      this.positions.pop();
      this.turn = this.turn === 'w' ? 'b' : 'w';
      const us = this.turn;
      if (us === 'b') this.fullmove--;
      this.castling = h.castling; this.ep = h.ep; this.halfmove = h.halfmove;
      b[m.from] = m.piece;
      b[m.to] = m.flag === 'e' ? null : m.captured;
      if (m.flag === 'e') b[m.to + (us === 'w' ? 16 : -16)] = m.captured;
      if (m.flag === 'k') { b[m.from + 3] = b[m.from + 1]; b[m.from + 1] = null; }
      if (m.flag === 'q') { b[m.from - 4] = b[m.from - 1]; b[m.from - 1] = null; }
      if (typeOf(m.piece) === 'k') this.kings[us] = m.from;
      return m;
    }

    insufficientMaterial() {
      const minors = [];
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = this.board[sq];
        if (!p || typeOf(p) === 'k') continue;
        const t = typeOf(p);
        if (t !== 'b' && t !== 'n') return false;
        minors.push({ t, shade: ((sq >> 4) + (sq & 7)) & 1 });
      }
      if (minors.length <= 1) return true;
      // Only bishops, all on the same colour squares.
      return minors.every((m) => m.t === 'b' && m.shade === minors[0].shade);
    }

    repetitions() {
      const k = this.positions[this.positions.length - 1];
      return this.positions.filter((p) => p === k).length;
    }

    // Returns null while the game is in progress.
    result() {
      if (this.moves().length === 0) {
        return this.inCheck()
          ? { winner: this.turn === 'w' ? 'b' : 'w', reason: 'checkmate' }
          : { winner: null, reason: 'stalemate' };
      }
      if (this.halfmove >= 100) return { winner: null, reason: '50-move rule' };
      if (this.insufficientMaterial()) return { winner: null, reason: 'insufficient material' };
      if (this.repetitions() >= 3) return { winner: null, reason: 'threefold repetition' };
      return null;
    }

    san(m) {
      let s;
      const t = typeOf(m.piece);
      if (m.flag === 'k') s = 'O-O';
      else if (m.flag === 'q') s = 'O-O-O';
      else {
        s = '';
        if (t !== 'p') {
          s = t.toUpperCase();
          const rivals = this.moves().filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          if (rivals.length) {
            const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7));
            const sameRank = rivals.some((o) => (o.from >> 4) === (m.from >> 4));
            if (!sameFile) s += sqName(m.from)[0];
            else if (!sameRank) s += sqName(m.from)[1];
            else s += sqName(m.from);
          }
        }
        if (m.captured) s += (t === 'p' ? sqName(m.from)[0] : '') + 'x';
        s += sqName(m.to);
        if (m.promo) s += '=' + m.promo.toUpperCase();
      }
      this.make(m);
      if (this.inCheck()) s += this.moves().length ? '+' : '#';
      this.undo();
      return s;
    }

    perft(depth) {
      if (depth === 0) return 1;
      let n = 0;
      for (const m of this.moves()) { this.make(m); n += this.perft(depth - 1); this.undo(); }
      return n;
    }
  }

  // ---------------------------------------------------------------- AI

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // Piece-square tables from white's point of view, index = row * 8 + col (row 0 = rank 8).
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const MATE = 100000;

  // Static evaluation from the side to move's perspective.
  function evaluate(g) {
    let score = 0, material = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = g.board[sq];
      if (p && typeOf(p) !== 'k' && typeOf(p) !== 'p') material += VALUE[typeOf(p)];
    }
    const endgame = material <= 1300;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = g.board[sq];
      if (!p) continue;
      const t = typeOf(p), white = isWhite(p);
      const idx = white ? (sq >> 4) * 8 + (sq & 7) : (7 - (sq >> 4)) * 8 + (sq & 7);
      const table = t === 'k' && endgame ? PST.kEnd : PST[t];
      const v = VALUE[t] + table[idx];
      score += white ? v : -v;
    }
    return g.turn === 'w' ? score : -score;
  }

  function orderScore(m) {
    let s = 0;
    if (m.captured) s += 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] + 1000;
    if (m.promo) s += VALUE[typeOf(m.promo)];
    return s;
  }

  class TimeUp extends Error {}

  function search(g, opts = {}) {
    const maxDepth = opts.depth || 4;
    const deadline = Date.now() + (opts.timeMs || 2000);
    let nodes = 0;

    function quiesce(alpha, beta) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new TimeUp();
      const stand = evaluate(g);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      const caps = g.pseudoMoves(true).sort((a, b) => orderScore(b) - orderScore(a));
      const us = g.turn;
      for (const m of caps) {
        g.make(m);
        if (g.inCheck(us)) { g.undo(); continue; }
        const score = -quiesce(-beta, -alpha);
        g.undo();
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new TimeUp();
      if (ply > 0 && (g.halfmove >= 100 || g.repetitions() >= 2)) return 0;
      const check = g.inCheck();
      if (check) depth++; // check extension
      if (depth <= 0) return quiesce(alpha, beta);
      const us = g.turn;
      const moves = g.pseudoMoves().sort((a, b) => orderScore(b) - orderScore(a));
      let legal = 0;
      for (const m of moves) {
        g.make(m);
        if (g.inCheck(us)) { g.undo(); continue; }
        legal++;
        const score = -negamax(depth - 1, -beta, -alpha, ply + 1);
        g.undo();
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      if (!legal) return check ? -MATE + ply : 0;
      return alpha;
    }

    let rootMoves = g.moves();
    if (!rootMoves.length) return null;
    const noise = opts.noise || 0;
    let best = rootMoves[0], bestScore = -Infinity;
    // Iterative deepening; the best move of each finished iteration is searched first next time.
    for (let depth = 1; depth <= maxDepth; depth++) {
      let iterBest = null, iterScore = -Infinity, alpha = -Infinity;
      try {
        for (const m of rootMoves) {
          g.make(m);
          let score = -negamax(depth - 1, -Infinity, -alpha, 1);
          g.undo();
          if (noise) score += Math.floor((Math.random() * 2 - 1) * noise);
          if (score > iterScore) { iterScore = score; iterBest = m; }
          // With noise every root move needs an exact score, so keep the window open.
          if (!noise && score > alpha) alpha = score;
        }
      } catch (e) {
        if (!(e instanceof TimeUp)) throw e;
        // Unwind any moves left on the stack by the aborted search.
        while (g.history.length > opts.baseHistory) g.undo();
        break;
      }
      best = iterBest; bestScore = iterScore;
      rootMoves = [best, ...rootMoves.filter((m) => m !== best)];
      if (Math.abs(bestScore) > MATE - 1000) break; // forced mate found
    }
    return { move: best, score: bestScore, nodes };
  }

  function bestMove(g, level) {
    const settings = {
      1: { depth: 1, timeMs: 500, noise: 150 },
      2: { depth: 2, timeMs: 1000, noise: 40 },
      3: { depth: 3, timeMs: 2000, noise: 10 },
      4: { depth: 5, timeMs: 3000, noise: 0 },
    }[level] || { depth: 3, timeMs: 2000 };
    return search(g, { ...settings, baseHistory: g.history.length });
  }

  const api = { Game, bestMove, search, evaluate, sqName, nameSq, START };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chess = api;
})(typeof window !== 'undefined' ? window : globalThis);
