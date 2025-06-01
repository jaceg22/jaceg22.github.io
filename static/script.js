const API = ""; // Blank means same domain as backend, works on Render

function startGame() {
  const input = document.getElementById("players").value;
  const players = input.split(",").map(p => p.trim());
  fetch(`${API}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players })
  }).then(() => {
    document.getElementById("game-controls").style.display = "block";
  });
}

function assignRoles() {
  fetch(`${API}/assign-roles`)
    .then(res => res.json())
    .then(data => {
      const out = Object.entries(data.roles)
        .map(([name, role]) => `${name}: ${role}`)
        .join("<br>");
      document.getElementById("roles-display").innerHTML = out;
    });
}

function shuffleLocations() {
  fetch(`${API}/shuffle-locations`)
    .then(res => res.json())
    .then(data => alert("Shuffled locations:\n" + data.locations.join(", ")));
}

function loadQuestions() {
  fetch(`${API}/load-questions`)
    .then(res => res.json())
    .then(() => alert("Questions loaded."));
}

function getQuestion() {
  fetch(`${API}/next-question`)
    .then(res => res.json())
    .then(data => {
      document.getElementById("question-display").innerText = data.question;
    });
}

function updateScore(name) {
  fetch(`${API}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  }).then(getScores);
}

function getScores() {
  fetch(`${API}/scores`)
    .then(res => res.json())
    .then(data => {
      const out = Object.entries(data)
        .map(([name, score]) => `${name}: ${score}`)
        .join("<br>");
      document.getElementById("scores-display").innerHTML = out;
    });
}
