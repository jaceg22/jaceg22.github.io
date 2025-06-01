let players = [];

function addPlayer() {
  const input = document.getElementById("playerNameInput");
  const name = input.value.trim();
  if (name && !players.includes(name)) {
    players.push(name);
    const li = document.createElement("li");
    li.textContent = name;
    document.getElementById("playerList").appendChild(li);
  }
  input.value = "";
}

function startGame() {
  fetch("http://localhost:5000/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players }),
  })
    .then((res) => res.json())
    .then(() => {
      document.getElementById("setup").style.display = "none";
      document.getElementById("getRoleSection").style.display = "block";
      fetch("http://localhost:5000/assign-roles")
        .then((res) => res.json())
        .then((data) => {
          localStorage.setItem("roles", JSON.stringify(data.roles));
        });
    });
}

function getRole() {
  const name = document.getElementById("roleNameInput").value.trim();
  const roles = JSON.parse(localStorage.getItem("roles"));
  const role = roles[name];
  if (role) {
    document.getElementById("yourRole").textContent = `Your role is: ${role}`;
  } else {
    document.getElementById("yourRole").textContent = "Name not found!";
  }
}
