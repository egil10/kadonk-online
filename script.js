/* ============================================================
   Kadonk — a two-player dice bluffing game (a Mia / Liar's-dice variant)
   ------------------------------------------------------------
   Each roll is two dice sorted high-low into a two-digit number.
   `RANKING` lists every combination from weakest (31) to strongest (21,
   the "Kadonk"). A turn is: shake in secret, announce a roll that must
   rank higher than the standing claim (truthfully or as a bluff), then the
   opponent either out-claims you or calls your bluff.
   ============================================================ */

"use strict";

// Combinations from lowest rank (index 0) to highest (Kadonk = 21).
const RANKING = [
    31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65,
    11, 22, 33, 44, 55, 66, 21,
];
const KADONK = 21;
const PLAYERS = ["Player 1", "Player 2"];

// Pip layout per die face (positions on a 3x3 grid).
const PIP_LAYOUT = {
    1: ["mc"],
    2: ["tl", "br"],
    3: ["tl", "mc", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "mc", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"],
};

const rankOf = (combo) => RANKING.indexOf(combo);

// ---- Cached DOM references (queried once) ----
const el = {
    players: [document.getElementById("player1"), document.getElementById("player2")],
    lives: [document.getElementById("lives1"), document.getElementById("lives2")],
    claim: document.getElementById("claim"),
    dice: document.getElementById("dice"),
    dieEls: Array.from(document.querySelectorAll(".die")),
    status: document.getElementById("status"),
    startButton: document.getElementById("startButton"),
    shakeButton: document.getElementById("shakeButton"),
    openButton: document.getElementById("openButton"),
    claimForm: document.getElementById("claimForm"),
    claimSelect: document.getElementById("claimSelect"),
    sendButton: document.getElementById("sendButton"),
    claimHint: document.getElementById("claimHint"),
    rulesToggle: document.getElementById("rulesToggle"),
    rules: document.getElementById("rules"),
    // Modal
    modal: document.getElementById("modal"),
    livesInput: document.getElementById("livesInput"),
    modalError: document.getElementById("modalError"),
    modalConfirm: document.getElementById("modalConfirm"),
    modalCancel: document.getElementById("modalCancel"),
};

// ---- Game state ----
const state = {
    lives: [3, 3],
    current: 0, // index into PLAYERS whose turn it is
    secretRoll: null, // current player's actual roll (their secret)
    claim: null, // the standing announced combo
    phase: "idle", // idle | respond | announce | over
};

const opponent = () => (state.current === 0 ? 1 : 0);

// ============================================================
//  Rendering
// ============================================================

function setStatus(html) {
    el.status.innerHTML = html;
}

function renderLives(animateIndex = -1) {
    el.lives.forEach((node, i) => {
        node.replaceChildren();
        const total = Math.max(state.lives[i], 0);
        for (let h = 0; h < total; h++) {
            const heart = document.createElement("span");
            heart.className = "heart";
            heart.textContent = "♥";
            if (i === animateIndex && h === total) heart.classList.add("heart--popping");
            node.appendChild(heart);
        }
        // Highlight the active player; grey out an eliminated one.
        el.players[i].classList.toggle("is-active", i === state.current && state.phase !== "over");
        el.players[i].classList.toggle("is-out", state.lives[i] <= 0);
    });
}

function flashLifeLost(playerIndex) {
    const node = el.lives[playerIndex];
    const last = node.querySelector(".heart:last-child");
    if (last) {
        last.classList.add("heart--popping");
        last.addEventListener("animationend", () => last.classList.remove("heart--popping"), { once: true });
    }
}

/** Render a combo (e.g. 53) as two dice with pips. Pass null to blank them. */
function renderDice(combo, { rolling = false } = {}) {
    const faces = combo === null
        ? [null, null]
        : [Math.floor(combo / 10), combo % 10];

    el.dieEls.forEach((die, i) => {
        const face = faces[i];
        die.replaceChildren();
        die.dataset.empty = face === null ? "true" : "false";
        if (face !== null) {
            for (const pos of PIP_LAYOUT[face]) {
                const pip = document.createElement("span");
                pip.className = "pip";
                pip.dataset.pos = pos;
                die.appendChild(pip);
            }
        }
        if (rolling) {
            die.classList.remove("is-rolling");
            // Force reflow so the animation restarts on every shake.
            void die.offsetWidth;
            die.classList.add("is-rolling");
        }
    });
}

/** Show only the buttons relevant to the current phase. */
function setControls({ start = false, shake = false, open = false, announce = false }) {
    el.startButton.hidden = !start;
    el.shakeButton.hidden = !shake;
    el.openButton.hidden = !open;
    el.claimForm.hidden = !announce;
}

function showClaim() {
    if (state.claim === null) {
        el.claim.hidden = true;
        return;
    }
    const label = state.claim === KADONK ? "KADONK (2-1)" : state.claim;
    el.claim.hidden = false;
    el.claim.textContent = `Standing claim: ${label}`;
}

// ============================================================
//  Game flow
// ============================================================

function rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const [hi, lo] = d1 >= d2 ? [d1, d2] : [d2, d1];
    return hi * 10 + lo;
}

function startGame(livesCount) {
    state.lives = [livesCount, livesCount];
    state.current = 0;
    state.claim = null;
    state.secretRoll = null;
    state.phase = "respond";
    renderLives();
    renderDice(null);
    showClaim();
    beginTurn();
}

/** Start a player's turn: they may answer a standing claim, or open the round.
 *  Note: state.secretRoll is NOT cleared here — when answering a claim it must
 *  still hold the announcer's real roll so a call can be judged. It is reset in
 *  startGame() and after each round in callBluff(). */
function beginTurn() {
    renderLives();
    showClaim();

    if (state.claim === null) {
        // Fresh round — this player must shake and open the bidding.
        setStatus(`<strong>${PLAYERS[state.current]}</strong>, you start the round. Shake the dice!`);
        setControls({ shake: true });
    } else {
        // There's a claim to answer.
        const claimLabel = state.claim === KADONK ? "Kadonk" : state.claim;
        if (state.claim === KADONK) {
            // Nothing beats Kadonk — you can only call it.
            setStatus(`<strong>${PLAYERS[state.current]}</strong>, ${PLAYERS[opponent()]} claims <strong>Kadonk</strong>. You can only call the bluff.`);
            setControls({ open: true });
        } else {
            setStatus(`<strong>${PLAYERS[state.current]}</strong>, ${PLAYERS[opponent()]} claims <strong>${claimLabel}</strong>. Shake to raise, or call the bluff.`);
            setControls({ shake: true, open: true });
        }
    }
    renderDice(state.claim, { rolling: false });
}

function shake() {
    state.secretRoll = rollDice();
    state.phase = "announce";
    renderDice(state.secretRoll, { rolling: true });
    setStatus(`You rolled <strong>${state.secretRoll === KADONK ? "Kadonk!" : state.secretRoll}</strong> — only you can see this. Now announce.`);
    populateClaimOptions();
    setControls({ announce: true });
}

/** Fill the announce dropdown with every combo that beats the standing claim. */
function populateClaimOptions() {
    const minRank = state.claim === null ? 0 : rankOf(state.claim) + 1;
    const options = RANKING.slice(minRank);
    el.claimSelect.replaceChildren();

    for (const combo of options) {
        const opt = document.createElement("option");
        opt.value = String(combo);
        opt.textContent = combo === KADONK ? "Kadonk (2-1)" : String(combo);
        el.claimSelect.appendChild(opt);
    }

    // Default to announcing the truth when it's still a legal raise.
    const truthful = options.includes(state.secretRoll);
    el.claimSelect.value = String(truthful ? state.secretRoll : options[0]);

    const isBluff = Number(el.claimSelect.value) !== state.secretRoll;
    updateClaimHint(isBluff);
    el.claimSelect.onchange = () =>
        updateClaimHint(Number(el.claimSelect.value) !== state.secretRoll);
}

function updateClaimHint(isBluff) {
    el.claimHint.textContent = isBluff
        ? "That's higher than your roll — you'd be bluffing."
        : "That's the truth.";
}

function announce() {
    const claimed = Number(el.claimSelect.value);
    state.claim = claimed;
    showClaim();
    // Pass to the opponent. The secret roll travels with the claim so a
    // call can compare the claim against what was really rolled.
    const announcer = state.current;
    state.current = opponent();
    state.phase = "respond";
    setControls({});
    el.claim.hidden = false;
    setStatus(`<strong>${PLAYERS[announcer]}</strong> announces <strong>${claimed === KADONK ? "Kadonk" : claimed}</strong>…`);
    // Brief beat before handing over, then continue.
    window.setTimeout(beginTurn, 650);
}

function callBluff() {
    // state.secretRoll still holds the announcer's real roll.
    const truthful = rankOf(state.secretRoll) >= rankOf(state.claim);
    const caller = state.current;
    const announcer = opponent();
    const loser = truthful ? caller : announcer;

    renderDice(state.secretRoll); // reveal the truth
    state.lives[loser] -= 1;
    renderLives();
    flashLifeLost(loser);

    const realLabel = state.secretRoll === KADONK ? "Kadonk" : state.secretRoll;
    if (truthful) {
        setStatus(`Ha! It really was <strong>${realLabel}</strong>. <strong>${PLAYERS[caller]}</strong> loses a life.`);
    } else {
        setStatus(`Bluff! It was only <strong>${realLabel}</strong>. <strong>${PLAYERS[announcer]}</strong> loses a life.`);
    }

    el.claim.hidden = true;
    setControls({});

    if (state.lives[0] <= 0 || state.lives[1] <= 0) {
        endGame();
        return;
    }

    // The player who lost the life starts the next round.
    state.claim = null;
    state.secretRoll = null;
    state.current = loser;
    window.setTimeout(beginTurn, 1400);
}

function endGame() {
    state.phase = "over";
    const winner = state.lives[0] > 0 ? 0 : 1;
    renderLives();
    setStatus(`🏆 <strong>${PLAYERS[winner]}</strong> wins the game!`);
    el.startButton.textContent = "Play again";
    setControls({ start: true });
}

// ============================================================
//  Modal (replaces prompt/alert)
// ============================================================

function openModal() {
    el.modalError.hidden = true;
    el.modal.hidden = false;
    el.livesInput.focus();
    el.livesInput.select();
}

function closeModal() {
    el.modal.hidden = true;
}

function confirmModal() {
    const value = parseInt(el.livesInput.value, 10);
    if (Number.isNaN(value) || value < 1 || value > 20) {
        el.modalError.textContent = "Enter a number of lives between 1 and 20.";
        el.modalError.hidden = false;
        return;
    }
    closeModal();
    startGame(value);
}

// ============================================================
//  Wiring
// ============================================================

el.startButton.addEventListener("click", openModal);
el.shakeButton.addEventListener("click", shake);
el.openButton.addEventListener("click", callBluff);
el.sendButton.addEventListener("click", announce);

el.modalConfirm.addEventListener("click", confirmModal);
el.modalCancel.addEventListener("click", closeModal);
el.modal.addEventListener("click", (e) => {
    if (e.target.dataset.modalDismiss !== undefined) closeModal();
});
el.livesInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmModal();
});

el.rulesToggle.addEventListener("click", () => {
    const open = el.rules.hidden;
    el.rules.hidden = !open;
    el.rulesToggle.setAttribute("aria-expanded", String(open));
});

// Initial paint.
renderLives();
renderDice(null);
