const API = ""; // same domain or backend URL

let currentLobby = null;
let playerName = null;
let pollingInterval = null;

function createLobby() {
  fetch(`${API}/create-lobby`, { method: "POST" })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      currentLobby = data.lobby_code;
      alert("Lobby created! Code: " + currentLobby);
      document.getElementById("lobby-code-display").innerText = currentLobby;
      showLobbyUI();
    });
}

function joinLobby() {
  currentLobby = document.getElementById("join-lobby-code").value.trim();
  playerName = document.getElementById("join-player-name").value.trim();
  if (!currentLobby || !playerName) {
    alert("Enter lobby code and your player name");
    return;
  }
  fetch(`${API}/join-lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lobby_code: currentLobby, player: playerName })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      alert(data.message);
      document.getElementById("lobby-code-display").innerText = currentLobby;
      showLobbyUI();
      startPollingRole();
    });
}

function startGame() {
  fetch(`${API}/start-game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lobby_code: currentLobby })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      alert("Game started!");
      startPollingRole();
    });
}

function startPollingRole() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(getRoleAndUpdateUI, 3000);
  getRoleAndUpdateUI();
}

function getRoleAndUpdateUI() {
  fetch(`${API}/get-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lobby_code: currentLobby, player: playerName })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        clearInterval(pollingInterval);
        return;
      }

      document.getElementById("role-display").innerText = "Your role: " + data.role;
      document.getElementById("game-state-display").innerText = "Game state: " + data.game_state;

      // Enable or disable Start Game button depending on game state and role (host can start only if waiting)
      const startGameBtn = document.getElementById("start-game-btn");
      if (data.role === "Host" && data.game_state === "waiting") {
        startGameBtn.style.display = "inline-block";
      } else {
        startGameBtn.style.display = "none";
      }

      // Show guess location only if Imposter and game in progress and player hasn't guessed yet
      if (
        data.role === "Imposter" &&
        data.game_state === "in_progress" &&
        !data.guessing // guessing: whether player already guessed
      ) {
        document.getElementById("guess-location-section").style.display = "block";
      } else {
        document.getElementById("guess-location-section").style.display = "none";
      }

      if (data.game_state === "game_over") {
        let msg = data.winner === "Imposter" ? "Imposter won!" : "Others won!";
        alert("Game Over! " + msg);
        clearInterval(pollingInterval);
      }
    });
}

function guessLocation() {
  const select = document.getElementById("guess-location-select");
  const guessedLocation = select.value;
  if (!guessedLocation) {
    alert("Select a location to guess");
    return;
  }
  fetch(`${API}/guess-location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lobby_code: currentLobby,
      player: playerName,
      location: guessedLocation
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }
      alert(data.message);
      getRoleAndUpdateUI(); // refresh UI after guess
    });
}

function showLobbyUI() {
  document.getElementById("lobby-section").style.display = "block";
  document.getElementById("lobby-setup-section").style.display = "none";
}
