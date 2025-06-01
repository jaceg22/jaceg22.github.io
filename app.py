from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import random
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

locations = [
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine"
]

questions = []
players = []
scores = {}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/start", methods=["POST"])
def start_game():
    global players, scores
    data = request.json
    players = data["players"]
    scores = {name: 0 for name in players}
    return jsonify({"message": "Game started", "players": players})

@app.route("/shuffle-locations")
def shuffle_locations():
    shuffled = locations[:]
    random.shuffle(shuffled)
    return jsonify({"locations": shuffled})

@app.route("/load-questions")
def load_questions():
    global questions
    with open("questions.txt", "r") as f:
        questions = [line.strip() for line in f.readlines() if line.strip()]
    random.shuffle(questions)
    return jsonify({"questions": questions})

@app.route("/next-question")
def next_question():
    if not questions:
        return jsonify({"question": "No questions loaded"}), 400
    question = questions.pop(0)
    questions.append(question)
    return jsonify({"question": question})

@app.route("/assign-roles")
def assign_roles():
    if not players:
        return jsonify({"error": "No players added"}), 400
    imposter = random.choice(players)
    location = random.choice(locations)
    roles = {player: "Imposter" if player == imposter else location for player in players}
    return jsonify({"roles": roles})

@app.route("/score", methods=["POST"])
def update_score():
    name = request.json.get("name")
    if name in scores:
        scores[name] += 1
        return jsonify({"score": scores[name]})
    return jsonify({"error": "Player not found"}), 400

@app.route("/scores")
def get_scores():
    return jsonify(scores)

if __name__ == "__main__":
    app.run(debug=True)
