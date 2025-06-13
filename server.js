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
    "What's the first thing you notice when you arrive here?",
    "What would you be most worried about in this place?",
    "What's the most important thing to remember here?",
    "How would you describe the atmosphere?",
    "What would you avoid doing here?",
    "What's the biggest challenge in this location?",
    "What equipment would be essential here?",
    "How would you stay safe in this environment?",
    "What's the strangest thing about this place?",
    "What would a newcomer need to know?",
    "What sounds do you hear constantly here?",
    "What's the most dangerous aspect of this location?",
    "What would you pack if you knew you were coming here?",
    "How do people communicate in this environment?",
    "What's the emergency protocol here?",
    "What would make someone stand out as not belonging?",
    "What's the daily routine like here?",
    "What rules must everyone follow here?",
    "What's the hierarchy or chain of command?",
    "How do you know if you're in trouble here?"
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
            questionsPerRound: 5,
            questionQueue: [...questions],
            gameHistory: [],
            votes: new Map(),
            playerAnswers: new Map()
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
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        
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

    processAnswer(asker, target, question, answer) {
        // Add to game history
        this.gameState.gameHistory.push({
            asker: this.players.get(asker).name,
            target: this.players.get(target).name,
            question,
            answer,
            round: this.gameState.currentRound
        });

        // Update scoreboard
        const askerStats = this.scoreboard.get(asker);
        const targetStats = this.scoreboard.get(target);
        askerStats.questionsAsked++;
        targetStats.questionsAnswered++;

        // Track player answers
        const targetName = this.players.get(target).name;
        if (!this.gameState.playerAnswers.has(targetName)) {
            this.gameState.playerAnswers.set(targetName, []);
        }
        this.gameState.playerAnswers.get(targetName).push(answer);

        // Move to next turn
        this.gameState.questionsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        // Check if round is complete
        if (this.gameState.questionsThisRound >= this.gameState.questionsPerRound) {
            this.startVoting();
        }
    }

    startVoting() {
        this.gameState.status = 'voting';
        this.gameState.votes.clear();
    }

    submitVote(voterId, targetId) {
        this.gameState.votes.set(voterId, targetId);
        
        // Update voting stats
        const voterStats = this.scoreboard.get(voterId);
        voterStats.totalVotes++;
        
        // Check if all players have voted
        if (this.gameState.votes.size === this.players.size) {
            this.processVotingResults();
        }
    }

    processVotingResults() {
        // Count votes
        const voteCounts = new Map();
        this.gameState.votes.forEach((targetId) => {
            const count = voteCounts.get(targetId) || 0;
            voteCounts.set(targetId, count + 1);
        });

        // Find player with most votes
        let maxVotes = 0;
        let mostVoted = null;
        voteCounts.forEach((count, playerId) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = playerId;
            }
        });

        // Check for majority (more than half)
        const majorityThreshold = Math.ceil(this.players.size / 2);
        
        if (maxVotes >= majorityThreshold) {
            // Someone was voted out
            const wasImposter = mostVoted === this.gameState.imposter;
            
            // Update correct vote stats
            this.gameState.votes.forEach((targetId, voterId) => {
                const voterStats = this.scoreboard.get(voterId);
                if ((wasImposter && targetId === this.gameState.imposter) || 
                    (!wasImposter && targetId !== this.gameState.imposter)) {
                    voterStats.correctVotes++;
                }
            });
            
            if (wasImposter) {
                this.endGame('location_wins', `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
            // No majority, continue to next round
            this.continueToNextRound();
        }
    }

    continueToNextRound() {
        // Update rounds survived for all players
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            stats.roundsSurvived++;
        });

        this.gameState.currentRound++;
        this.gameState.currentTurn = 0;
        this.gameState.questionsThisRound = 0;
        this.gameState.status = 'playing';
        this.gameState.votes.clear();
        
        // Update and broadcast scoreboard after round
        this.updateScoreboard();
    }

    imposterReveal(imposterGuess) {
        const wasCorrect = imposterGuess === this.gameState.location;
        
        if (wasCorrect) {
            this.endGame('imposter_wins', `Imposter correctly guessed the location: ${this.gameState.location}`);
        } else {
            this.endGame('location_wins', `Imposter guessed wrong! Location was ${this.gameState.location}, not ${imposterGuess}`);
        }
    }

    endGame(winner, message) {
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
                if (isImposter) {
                    stats.timesImposterWon++;
                }
            }
        });

        // Calculate final scores and save game to history
        this.updateScoreboard();
        this.saveGameToHistory();
    }

    updateScoreboard() {
        // Calculate scores based on various factors
        this.scoreboard.forEach((stats, socketId) => {
            let score = 0;
            
            // Base points for participation
            score += stats.gamesPlayed * 10;
            
            // Win bonus
            score += stats.gamesWon * 50;
            
            // Imposter performance bonus
            if (stats.timesImposter > 0) {
                const imposterWinRate = stats.timesImposterWon / stats.timesImposter;
                score += imposterWinRate * 100;
            }
            
            // Voting accuracy bonus
            if (stats.totalVotes > 0) {
                const voteAccuracy = stats.correctVotes / stats.totalVotes;
                score += voteAccuracy * 75;
            }
            
            // Activity bonus
            score += stats.questionsAnswered * 5;
            score += stats.questionsAsked * 3;
            
            // Survival bonus
            score += stats.roundsSurvived * 15;
            
            stats.score = Math.round(score);
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
            scoreboard: this.getScoreboardData()
        };
    }
}

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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

        room.processAnswer(asker, socket.id, question, answer);

        // Send answer to all players
        io.to(room.roomCode).emit('answer_submitted', {
            asker: room.players.get(asker).name,
            target: room.players.get(socket.id).name,
            question,
            answer
        });

        // Send updated game state
        room.players.forEach((player, socketId) => {
            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
        });
    });

    socket.on('submit_vote', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'voting') return;

        room.submitVote(socket.id, targetId);

        // Send updated vote count to all players
        io.to(room.roomCode).emit('vote_submitted', {
            voter: room.players.get(socket.id).name,
            votesReceived: room.gameState.votes.size,
            totalPlayers: room.players.size
        });

        // If voting is complete, send results
        if (room.gameState.votes.size === room.players.size) {
            room.players.forEach((player, socketId) => {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            });
        }
    });

    socket.on('imposter_reveal', ({ locationGuess }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || socket.id !== room.gameState.imposter) return;

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