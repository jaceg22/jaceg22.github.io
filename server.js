const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game configuration
const locations = [
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine",
    "Daycare", "Amazon Rainforest", "Concert Hall", "Space Station",
    "Underwater Research Lab", "Haunted Mansion", "Art Museum"
];

const questions = [
    "Would you expect to see me here?",
    "What is the last thing you said?",
    "Would you be scared if someone was near you?",
    "What do you see around you?",
    "What do you think of the food?",
    "What's that smell?",
    "What's that noise?",
    "What is the price of admission?",
    "What time of day is it here?",
    "Who else might you meet here?",
    "Would you want to take a picture here?",
    "What kind of clothing would you wear here?",
    "How long would you stay here?",
    "What is the weather like?",
    "What did you bring with you?",
    "How would you describe the vibe?",
    "Would you need a ticket to enter?",
    "Do you feel safe here?",
    "What language do people speak here?",
    "What type of transportation would you use to get here?",
    "What celebrity would you expect to meet here?",
    "What is everyone wearing?",
    "What is this place's motto?",
    "Would you take a date here?",
    "What is the floor made out of?",
    "If you were an actor, who would you be?",
    "Where's a good place to smoke around here?",
    "What do you think would happen if I touched this button?",
    "How stressed are people around here?",
    "If Taylor Swift were here, what would she be doing?",
    "Is your family here?",
    "Do you find the people here attractive?",
    "What animal is that?",
    "What's in that corner?",
    "Why are they whispering?",
    "How's your phone reception?",
    "What's the seating situation like around here?",
    "Are any crimes being committed here?"
];

// Store game rooms
const gameRooms = new Map();

class GameRoom {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.players = new Map(); // socketId -> {name, isHost, isReady}
        this.gameState = {
            status: 'waiting', // waiting, playing, voting, ended
            location: null,
            imposter: null,
            currentRound: 1,
            currentTurn: 0,
            questionsThisRound: 0,
            questionsPerRound: null, // Will be set to number of players
            questionQueue: [...questions],
            gameHistory: [],
            votes: new Map(),
            playerAnswers: new Map(),
            currentQuestion: null, // Track the current question being asked
            readyToVoteCount: 0, // Track how many players are ready to vote
            readyToVotePlayers: new Set() // Track which players clicked ready
        };
        this.playerOrder = [];
        this.scoreboard = new Map(); // socketId -> player stats
        this.gameHistory = []; // Track all games in this room
    }

    addPlayer(socketId, name, isHost = false) {
        this.players.set(socketId, {
            name,
            isHost,
            isReady: false,
            role: null // Will be 'imposter' or the location name
        });
        
        // Initialize scoreboard for new player
        this.scoreboard.set(socketId, {
            name,
            gamesPlayed: 0,
            gamesWon: 0,
            timesImposter: 0,
            timesImposterWon: 0,
            questionsAnswered: 0,
            questionsAsked: 0,
            correctVotes: 0,
            totalVotes: 0,
            roundsSurvived: 0,
            score: 0
        });
        
        if (isHost) {
            this.hostId = socketId;
        }
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        this.players.delete(socketId);
        // Keep scoreboard data for returning players
        
        // If host left, assign new host
        if (socketId === this.hostId && this.players.size > 0) {
            const newHost = this.players.keys().next().value;
            this.players.get(newHost).isHost = true;
            this.hostId = newHost;
        }
        
        return player;
    }

    startGame() {
        if (this.players.size < 3) return false;
        
        // Shuffle players and assign roles
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder);
        
        // Choose location and imposter
        this.gameState.location = locations[Math.floor(Math.random() * locations.length)];
        const imposterIndex = Math.floor(Math.random() * this.playerOrder.length);
        this.gameState.imposter = this.playerOrder[imposterIndex];
        
        console.log(`Game started in room ${this.roomCode}:`);
        console.log(`Location: ${this.gameState.location}`);
        console.log(`Imposter: ${this.players.get(this.gameState.imposter).name}`);
        
        // Update scoreboard - increment games played and times imposter
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            stats.gamesPlayed++;
            
            if (socketId === this.gameState.imposter) {
                player.role = 'imposter';
                stats.timesImposter++;
            } else {
                player.role = this.gameState.location;
            }
        });
        
        // Initialize game state
        this.gameState.status = 'playing';
        this.gameState.currentTurn = 0;
        this.gameState.questionsThisRound = 0;
        this.gameState.questionsPerRound = this.players.size; // One question per player per round
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        this.gameState.currentQuestion = null;
        this.gameState.readyToVoteCount = 0;
        this.gameState.readyToVotePlayers.clear();
        
        // Shuffle question queue
        this.shuffleArray(this.gameState.questionQueue);
        
        return true;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getCurrentPlayer() {
        return this.playerOrder[this.gameState.currentTurn];
    }

    getNextQuestion() {
        if (this.gameState.questionQueue.length === 0) {
            this.gameState.questionQueue = [...questions];
            this.shuffleArray(this.gameState.questionQueue);
        }
        return this.gameState.questionQueue.shift();
    }

    processAnswer(askerId, targetId, question, answer) {
        console.log(`Processing answer in room ${this.roomCode}:`);
        console.log(`Asker: ${this.players.get(askerId).name}, Target: ${this.players.get(targetId).name}`);
        console.log(`Question: ${question}, Answer: ${answer}`);
        
        // Add to game history
        this.gameState.gameHistory.push({
            asker: this.players.get(askerId).name,
            target: this.players.get(targetId).name,
            question,
            answer,
            round: this.gameState.currentRound
        });

        // Update scoreboard
        const askerStats = this.scoreboard.get(askerId);
        const targetStats = this.scoreboard.get(targetId);
        askerStats.questionsAsked++;
        targetStats.questionsAnswered++;

        // Track player answers
        const targetName = this.players.get(targetId).name;
        if (!this.gameState.playerAnswers.has(targetName)) {
            this.gameState.playerAnswers.set(targetName, []);
        }
        this.gameState.playerAnswers.get(targetName).push(answer);

        // Move to next turn
        this.gameState.questionsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;
        this.gameState.currentQuestion = null; // Clear current question

        console.log(`Questions this round: ${this.gameState.questionsThisRound}/${this.gameState.questionsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);

        // Don't automatically start voting after round completion
        // Voting only starts when players are ready
    }

    readyToVote(playerId) {
        if (this.gameState.readyToVotePlayers.has(playerId)) {
            console.log(`Player ${this.players.get(playerId).name} already marked ready to vote`);
            return; // Player already marked ready
        }

        this.gameState.readyToVotePlayers.add(playerId);
        this.gameState.readyToVoteCount++;
        
        console.log(`${this.players.get(playerId).name} is ready to vote. Count: ${this.gameState.readyToVoteCount}/${this.players.size - 1}`);

        // Check if enough players are ready (all except one)
        if (this.gameState.readyToVoteCount >= this.players.size - 1) {
            console.log('Enough players ready, starting voting phase');
            this.startVoting();
        }
    }

    startVoting() {
        this.gameState.status = 'voting';
        this.gameState.votes.clear();
        console.log(`Voting started in room ${this.roomCode}`);
    }

    submitVote(voterId, targetId) {
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${targetId === 'not_ready' ? 'Not Ready' : this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        // Update voting stats (only for actual player votes, not "not ready")
        if (targetId !== 'not_ready') {
            const voterStats = this.scoreboard.get(voterId);
            voterStats.totalVotes++;
        }
        
        // Check if all players have voted
        if (this.gameState.votes.size === this.players.size) {
            console.log('All votes received, processing results');
            this.processVotingResults();
        }
    }

    processVotingResults() {
        // Count votes (excluding "not ready" votes)
        const voteCounts = new Map();
        let notReadyCount = 0;
        
        this.gameState.votes.forEach((targetId) => {
            if (targetId === 'not_ready') {
                notReadyCount++;
            } else {
                const count = voteCounts.get(targetId) || 0;
                voteCounts.set(targetId, count + 1);
            }
        });

        console.log('Vote counts:', Array.from(voteCounts.entries()).map(([id, count]) => 
            `${this.players.get(id)?.name || 'Unknown'}: ${count}`
        ));
        console.log(`Not Ready votes: ${notReadyCount}`);

        // Find player with most votes
        let maxVotes = 0;
        let mostVoted = null;
        voteCounts.forEach((count, playerId) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = playerId;
            }
        });

        // Need at least (players - 1) votes for someone to win
        const requiredVotes = this.players.size - 1;
        console.log(`Required votes: ${requiredVotes}, Max votes: ${maxVotes}`);
        
        if (maxVotes >= requiredVotes && mostVoted) {
            // Someone got enough votes
            const wasImposter = mostVoted === this.gameState.imposter;
            console.log(`${this.players.get(mostVoted).name} got enough votes. Was imposter: ${wasImposter}`);
            
            // Update correct vote stats
            this.gameState.votes.forEach((targetId, voterId) => {
                if (targetId !== 'not_ready') {
                    const voterStats = this.scoreboard.get(voterId);
                    if ((wasImposter && targetId === this.gameState.imposter) || 
                        (!wasImposter && targetId !== this.gameState.imposter)) {
                        voterStats.correctVotes++;
                    }
                }
            });
            
            if (wasImposter) {
                this.endGame('location_wins', `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
            // Votes were too spread out - location team failed to coordinate
            console.log('Votes too spread out, imposter wins by default');
            this.endGame('imposter_wins', `Location team failed to coordinate their votes. The imposter wins!`);
        }
    }

    imposterReveal(locationGuess) {
        console.log(`Imposter reveal: ${this.players.get(this.gameState.imposter).name} guessed ${locationGuess} (correct: ${this.gameState.location})`);
        const wasCorrect = locationGuess === this.gameState.location;
        
        if (wasCorrect) {
            this.endGame('imposter_wins', `Imposter correctly guessed the location: ${this.gameState.location}`);
        } else {
            this.endGame('location_wins', `Imposter guessed wrong! Location was ${this.gameState.location}, not ${locationGuess}`);
        }
    }

    endGame(winner, message) {
        console.log(`Game ended in room ${this.roomCode}: ${winner} - ${message}`);
        this.gameState.status = 'ended';
        this.gameState.gameResult = {
            winner,
            message,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name
        };

        // Update final game stats
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            const isImposter = socketId === this.gameState.imposter;
            const didWin = (winner === 'imposter_wins' && isImposter) || 
                          (winner === 'location_wins' && !isImposter);
            
            if (didWin) {
                stats.gamesWon++;
                stats.score = stats.gamesWon; // Update score directly here
                if (isImposter) {
                    stats.timesImposterWon++;
                }
            }
        });

        // Save game to history but don't call updateScoreboard (already updated above)
        this.saveGameToHistory();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }

    updateScoreboard() {
        // Simple scoring: winners get +1 point (only calculate once at game end)
        this.scoreboard.forEach((stats, socketId) => {
            // Keep existing score calculation - don't recalculate during the game
            // Score only gets updated when gamesWon increases in endGame()
            stats.score = stats.gamesWon;
        });
    }

    saveGameToHistory() {
        const gameRecord = {
            gameNumber: this.gameHistory.length + 1,
            date: new Date(),
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            winner: this.gameState.gameResult.winner,
            rounds: this.gameState.currentRound,
            players: Array.from(this.players.entries()).map(([id, player]) => ({
                name: player.name,
                role: player.role,
                wasImposter: id === this.gameState.imposter
            })),
            finalScores: Array.from(this.scoreboard.entries()).map(([id, stats]) => ({
                name: stats.name,
                score: stats.score
            }))
        };
        
        this.gameHistory.push(gameRecord);
        console.log(`Game saved to history: Game #${gameRecord.gameNumber}`);
    }

    getScoreboardData() {
        return Array.from(this.scoreboard.entries())
            .map(([socketId, stats]) => ({
                ...stats,
                isOnline: this.players.has(socketId)
            }))
            .sort((a, b) => b.score - a.score);
    }

    getGameStateForPlayer(socketId) {
        const player = this.players.get(socketId);
        const isImposter = socketId === this.gameState.imposter;
        
        return {
            ...this.gameState,
            playerRole: player?.role,
            isImposter,
            playerOrder: this.playerOrder.map(id => ({
                id,
                name: this.players.get(id).name,
                isYou: id === socketId
            })),
            // Hide imposter identity unless game is ended
            imposter: this.gameState.status === 'ended' ? this.gameState.imposter : null,
            scoreboard: this.getScoreboardData(),
            readyToVoteCount: this.gameState.readyToVoteCount,
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers) // Convert Set to Array for JSON
        };
    }
}

// Generate random room code (letters only)
function generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (playerName) => {
        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode);
        room.addPlayer(socket.id, playerName, true);
        gameRooms.set(roomCode, room);
        
        socket.join(roomCode);
        socket.emit('room_created', { roomCode, isHost: true });
        socket.emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData()
        });
    });

    socket.on('join_room', ({ roomCode, playerName }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.players.size >= 8) {
            socket.emit('error', 'Room is full');
            return;
        }

        if (room.gameState.status !== 'waiting') {
            socket.emit('error', 'Game already in progress');
            return;
        }

        room.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        socket.emit('room_joined', { roomCode, isHost: false });
        
        // Notify all players in room
        io.to(roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData()
        });
    });

    socket.on('toggle_ready', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        player.isReady = !player.isReady;

        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData()
        });
    });

    socket.on('start_game', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) return;

        // Check if all players are ready
        const allReady = Array.from(room.players.values()).every(player => 
            player.isHost || player.isReady
        );

        if (!allReady) {
            socket.emit('error', 'Not all players are ready');
            return;
        }

        if (room.startGame()) {
            // Send game state to all players
            room.players.forEach((player, socketId) => {
                io.to(socketId).emit('game_started', room.getGameStateForPlayer(socketId));
            });
        } else {
            socket.emit('error', 'Need at least 3 players to start');
        }
    });

    socket.on('ask_question', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        if (room.getCurrentPlayer() !== socket.id) {
            socket.emit('error', 'Not your turn');
            return;
        }

        const question = room.getNextQuestion();
        const askerName = room.players.get(socket.id).name;
        const targetName = room.players.get(targetId).name;

        // Store current question for tracking
        room.gameState.currentQuestion = {
            askerId: socket.id,
            targetId,
            question
        };

        console.log(`Question asked in room ${room.roomCode}: ${askerName} asks ${targetName} "${question}"`);

        // Send question to all players
        io.to(room.roomCode).emit('question_asked', {
            asker: askerName,
            target: targetName,
            question,
            askerId: socket.id,
            targetId
        });
    });

    socket.on('submit_answer', ({ asker, target, question, answer }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        // Get the asker ID from the current question
        let askerId = null;
        if (room.gameState.currentQuestion && room.gameState.currentQuestion.targetId === socket.id) {
            askerId = room.gameState.currentQuestion.askerId;
        } else {
            // Fallback: find asker by name
            for (const [id, player] of room.players.entries()) {
                if (player.name === asker) {
                    askerId = id;
                    break;
                }
            }
        }

        if (!askerId) {
            console.error('Could not find asker ID for answer submission');
            return;
        }

        console.log(`Answer submitted in room ${room.roomCode}: ${answer}`);

        // Process the answer
        room.processAnswer(askerId, socket.id, question, answer);

        // Send answer to all players
        io.to(room.roomCode).emit('answer_submitted', {
            asker: room.players.get(askerId).name,
            target: room.players.get(socket.id).name,
            question,
            answer
        });

        // Send updated game state to all players
        room.players.forEach((player, socketId) => {
            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
        });
    });

    socket.on('ready_to_vote', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        room.readyToVote(socket.id);

        // Broadcast the updated ready count to all players
        io.to(room.roomCode).emit('ready_count_updated', {
            readyCount: room.gameState.readyToVoteCount,
            requiredCount: room.players.size - 1
        });

        // If voting starts, send game state update
        if (room.gameState.status === 'voting') {
            room.players.forEach((player, socketId) => {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            });
        }
    });

    socket.on('submit_vote', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'voting') return;

        room.submitVote(socket.id, targetId);

        // Send updated vote count to all players
        const voterName = room.players.get(socket.id).name;
        const targetName = targetId === 'not_ready' ? 'Not Ready' : room.players.get(targetId)?.name || 'Unknown';
        
        io.to(room.roomCode).emit('vote_submitted', {
            voter: voterName,
            target: targetName,
            votesReceived: room.gameState.votes.size,
            totalPlayers: room.players.size
        });

        // If voting is complete, send results
        if (room.gameState.votes.size === room.players.size) {
            // Send immediate feedback that all votes are in
            io.to(room.roomCode).emit('all_votes_received');
            
            setTimeout(() => {
                console.log(`Processing voting results for room ${room.roomCode}`);
                
                // Process voting results (this will either end game or continue to next round)
                room.processVotingResults();
                
                console.log(`After processing votes: status=${room.gameState.status}`);
                
                // Send updated game state to all players
                room.players.forEach((player, socketId) => {
                    const gameStateForPlayer = room.getGameStateForPlayer(socketId);
                    console.log(`Sending game update to ${player.name}: status=${gameStateForPlayer.status}, round=${gameStateForPlayer.currentRound}`);
                    io.to(socketId).emit('game_updated', gameStateForPlayer);
                });
                
                // If game ended, also send a specific game over event
                if (room.gameState.status === 'ended') {
                    console.log('Game ended, sending game_over event');
                    io.to(room.roomCode).emit('game_over', room.gameState.gameResult);
                }
            }, 2000); // Longer delay to let players see all votes are in
        }
    });

    socket.on('imposter_reveal', ({ locationGuess }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || socket.id !== room.gameState.imposter) {
            console.log(`Imposter reveal failed: room=${!!room}, isImposter=${socket.id === room?.gameState.imposter}`);
            socket.emit('error', 'You are not the imposter');
            return;
        }

        console.log(`Imposter reveal in room ${room.roomCode}: ${locationGuess}`);
        room.imposterReveal(locationGuess);

        // Send final game state to all players
        room.players.forEach((player, socketId) => {
            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
        });
    });

    socket.on('request_scoreboard', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        socket.emit('scoreboard_updated', {
            scoreboard: room.getScoreboardData(),
            gameHistory: room.gameHistory
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const room = findPlayerRoom(socket.id);
        if (room) {
            const player = room.removePlayer(socket.id);
            
            if (room.players.size === 0) {
                gameRooms.delete(room.roomCode);
                console.log(`Room ${room.roomCode} deleted (no players left)`);
            } else {
                io.to(room.roomCode).emit('player_left', {
                    playerName: player?.name,
                    players: Array.from(room.players.entries()).map(([id, player]) => ({
                        id, 
                        name: player.name, 
                        isHost: player.isHost,
                        isReady: player.isReady
                    })),
                    scoreboard: room.getScoreboardData()
                });
            }
        }
    });

    function findPlayerRoom(socketId) {
        for (const room of gameRooms.values()) {
            if (room.players.has(socketId)) {
                return room;
            }
        }
        return null;
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});