from flask import Flask, request, jsonify
import random
import string

app = Flask(__name__)

locations = [
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine"
]

lobbies = {}

def generate_lobby_code(length=5):
    return ''.join(random.choices(string.ascii_uppercase, k=length))

@app.route('/create-lobby', methods=['POST'])
def create_lobby():
    data = request.json
    player = data.get('player')
    if not player:
        return jsonify({"error": "Player name required"}), 400

    lobby_code = generate_lobby_code()
    while lobby_code in lobbies:
        lobby_code = generate_lobby_code()

    lobbies[lobby_code] = {
        "players": [player],
        "creator": player,
        "roles": {},
        "scores": {player: 0},
        "questions": [],
        "current_turn_index": 0,
        "game_started": False,
        "lobby_closed": False,
        "guesses": {},
        "guess_phase": False,
        "ready_states": {},
        "imposter": None,
        "location": None,
        "answers": {}
    }
    return jsonify({"lobby_code": lobby_code})

@app.route('/join-lobby', methods=['POST'])
def join_lobby():
    data = request.json
    lobby_code = data.get('lobby_code')
    player = data.get('player')
    if not lobby_code or not player:
        return jsonify({"error": "Lobby code and player name required"}), 400
    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404
    if lobby["lobby_closed"]:
        return jsonify({"error": "Lobby is closed"}), 403
    if player in lobby["players"]:
        return jsonify({"error": "Player name already taken in lobby"}), 400
    lobby["players"].append(player)
    lobby["scores"][player] = 0
    return jsonify({"message": f"{player} joined lobby {lobby_code}"})


@app.route('/start-game', methods=['POST'])
def start_game():
    data = request.json
    lobby_code = data.get('lobby_code')
    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404
    if lobby["game_started"]:
        return jsonify({"error": "Game already started"}), 400

    # assign imposter
    imposter = random.choice(lobby["players"])
    lobby["imposter"] = imposter
    # assign location to others
    location = random.choice(locations)
    lobby["location"] = location
    roles = {}
    for p in lobby["players"]:
        roles[p] = "Imposter" if p == imposter else location
    lobby["roles"] = roles

    # load questions from file
    try:
        with open("questions.txt", "r") as f:
            questions = [line.strip() for line in f if line.strip()]
    except Exception:
        questions = ["Sample question 1", "Sample question 2"]
    random.shuffle(questions)
    lobby["questions"] = questions
    lobby["current_turn_index"] = 0
    lobby["game_started"] = True
    lobby["lobby_closed"] = True
    lobby["guesses"] = {}
    lobby["guess_phase"] = False
    lobby["ready_states"] = {p: False for p in lobby["players"]}
    lobby["answers"] = {}

    return jsonify({
        "message": "Game started",
        "roles": lobby["roles"],
        "location": location
    })

@app.route('/get-role', methods=['GET'])
def get_role():
    lobby_code = request.args.get('lobby')
    player = request.args.get('player')
    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404
    role = lobby["roles"].get(player)
    if not role:
        return jsonify({"error": "Player not found in lobby"}), 404
    return jsonify({"role": role})

@app.route('/next-question', methods=['GET'])
def next_question():
    lobby_code = request.args.get('lobby')
    lobby = lobbies.get(lobby_code)
    if not lobby or not lobby["game_started"]:
        return jsonify({"error": "Game not started or lobby not found"}), 400

    idx = lobby["current_turn_index"]
    if idx >= len(lobby["players"]):
        return jsonify({"error": "No more players"}), 400

    player = lobby["players"][idx]
    question = lobby["questions"][idx % len(lobby["questions"])]
    return jsonify({"player": player, "question": question})

@app.route('/submit-answer', methods=['POST'])
def submit_answer():
    data = request.json
    lobby_code = data.get('lobby_code')
    player = data.get('player')
    answer = data.get('answer')
    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404

    if player != lobby["players"][lobby["current_turn_index"]]:
        return jsonify({"error": "Not your turn"}), 403

    lobby["answers"][player] = answer
    lobby["current_turn_index"] += 1

    # Check if all players answered, move to guess phase
    if lobby["current_turn_index"] >= len(lobby["players"]):
        lobby["guess_phase"] = True
        return jsonify({"message": "All answered, move to guess phase", "guess_phase": True})
    
    return jsonify({"message": "Answer recorded", "guess_phase": False})

@app.route('/ready', methods=['POST'])
def player_ready():
    data = request.json
    lobby_code = data.get('lobby_code')
    player = data.get('player')
    ready = data.get('ready')  # true or false

    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404

    if not lobby["guess_phase"]:
        return jsonify({"error": "Not in guess phase"}), 400

    lobby["ready_states"][player] = ready

    all_ready = all(lobby["ready_states"].values())

    return jsonify({"all_ready": all_ready})

@app.route('/submit-guess', methods=['POST'])
def submit_guess():
    data = request.json
    lobby_code = data.get('lobby_code')
    player = data.get('player')
    guessed_player = data.get('guess')

    lobby = lobbies.get(lobby_code)
    if not lobby:
        return jsonify({"error": "Lobby not found"}), 404

    if not lobby["guess_phase"]:
        return jsonify({"error": "Not in guess phase"}), 400

    lobby["guesses"][player] = guessed_player

    all_guessed = len(lobby["guesses"]) == len(lobby["players"])

    if all_guessed:
        # Check votes
        votes = list(lobby["guesses"].values())
        if len(set(votes)) == 1:  # unanimous vote
            voted_player = votes[0]
            imposter = lobby["imposter"]
            if voted_player == imposter:
                result = "Players win! Imposter caught."
            else:
                result = "Imposter wins! Wrong guess."
        else:
            result = "Imposter wins! No unanimous vote."

        # Reset or end game here
        lobby["guess_phase"] = False
        return jsonify({"all_guessed": True, "result": result})

    return jsonify({"all_guessed": False})

if __name__ == "__main__":
    app.run(debug=True)
