const API = ""; // assuming same domain

let currentLobby = null;
let playerName = null;
let pollingInterval = null;

// Poll lobby info every few seconds to update player count and start button visibility
function pollLobbyInfo() {
  fetch(`${API}/lobby-info?lobby=${currentLobby}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }

      // Show player count
      document.getElementById("player-count-display").innerText = `Players: ${data.player_count}`;

      // Show start button only if you are the host and game not started
      const startGameBtn = document.getElementById("start-game-btn");
      if (playerName === data.creator && !data.game_started) {
        startGameBtn.style.display = "inline-block";
      } else {
        startGameBtn.style.display = "none";
      }

      // Hide lobby setup when joined
      document.getElementById("lobby-setup-section").style.display = "none";
      document.getElementById("lobby-section").style.display = "block";

      // Keep polling every 3 seconds if game not started
      if (!data.game_started) {
        setTimeout(pollLobbyInfo, 3000);
      } else {
        // Game started, start polling game-specific data or roles
        startPollingRole();
      }
    });
}

function showLobbyUI() {
  document.getElementById("lobby-section").style.display = "block";
  document.getElementById("lobby-setup-section").style.display = "none";
  document.getElementById("player-count-display").innerText = "Players: 1";
  pollLobbyInfo();
}

function createLobby() {
  playerName = document.getElementById("create-player-name").value.trim();
  if (!playerName) {
    alert("Enter your name");
    return;
  }

  fetch(`${API}/create-lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: playerName })
  })
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
      // Removed startPollingRole here to avoid conflict, polling starts inside pollLobbyInfo()
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
      // Removed startPollingRole here to avoid conflict, polling starts inside pollLobbyInfo()
    });
}

// Modified startGame() to send player name (host) in request body
function startGame() {
  fetch(`${API}/start-game`, {
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
  fetch(`${API}/get-role?lobby=${currentLobby}&player=${playerName}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        clearInterval(pollingInterval);
        return;
      }

      document.getElementById("role-display").innerText = "Your role: " + data.role;
      document.getElementById("game-state-display").innerText = "Game state: " + data.game_state;

      const startGameBtn = document.getElementById("start-game-btn");
      if (data.role === "Host" && data.game_state === "waiting") {
        startGameBtn.style.display = "inline-block";
      } else {
        startGameBtn.style.display = "none";
      }

      if (data.role === "Imposter" && data.game_state === "in_progress" && !data.guessing) {
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
  const guessedLocation = document.getElementById("guess-location-select").value;
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
      getRoleAndUpdateUI();
    });
}
