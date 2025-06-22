const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const allGameData = [];

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/download-all-games', (req, res) => {
    if (allGameData.length === 0) {
        res.status(404).send('No game data available yet');
        return;
    }

    let output = '';
    allGameData.forEach(gameData => {
        output += '============================================================\n';
        output += `GAME ${gameData.gameNumber}\n`;
        output += `Timestamp: ${gameData.timestamp}\n`;
        output += `Room: ${gameData.roomCode}\n`;
        output += `Location: ${gameData.location}\n`;
        output += `Imposter: ${gameData.imposter}\n`;
        output += `Outcome: ${gameData.outcome}\n`;
        output += '\n';
        
        output += 'QUESTIONS AND ANSWERS:\n';
        gameData.playerQAs.forEach(qa => {
            output += `${qa.asker} asks ${qa.target}: "${qa.question}"\n`;
            output += `${qa.target} (${qa.targetRole}): "${qa.answer}"\n`;
            output += '\n';
        });
        
        output += 'VOTES:\n';
        gameData.playerVotes.forEach(vote => {
            const correctText = vote.wasCorrect ? 'CORRECT' : 'WRONG';
            output += `${vote.voter} votes for ${vote.votedFor} (${correctText})\n`;
            if (vote.reasoning) {
                output += `Reasoning: ${vote.reasoning}\n`;
            }
        });
        
        output += '============================================================\n\n';
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `mole-all-games-${timestamp}.txt`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(output);
});

// Game configuration
const defaultLocations = [
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine",
    "Daycare", "Amazon Rainforest", "Concert Hall", "Space Station",
    "High School", "Haunted Mansion", "Beach"
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
        this.isLocked = false; // NEW: Track if room is locked
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
            readyToVotePlayers: new Set(), // Track which players clicked ready
            questionAskedThisTurn: false, // Track if question was asked this turn
            waitingForAnswer: false // Track if we're waiting for an answer
        };
        this.playerOrder = [];
        this.scoreboard = new Map(); // socketId -> player stats
        this.gameHistory = []; // Track all games in this room
        this.customLocations = []; // Store custom locations set by host
        
        // SIMPLIFIED: Just collect all game data
        this.currentGameData = {
            gameNumber: 1,
            location: null,
            imposter: null,
            playerQAs: [], // All Q&A pairs
            playerVotes: [], // All votes
            outcome: null,
            timestamp: null,
            roomCode: this.roomCode
        };
    }

    // NEW: Generate unique name if duplicate exists
    generateUniqueName(requestedName) {
        const existingNames = Array.from(this.players.values()).map(p => p.name);
        
        if (!existingNames.includes(requestedName)) {
            return requestedName;
        }
        
        let counter = 2;
        let uniqueName = `${requestedName} ${counter}`;
        
        while (existingNames.includes(uniqueName)) {
            counter++;
            uniqueName = `${requestedName} ${counter}`;
        }
        
        return uniqueName;
    }

    // NEW: Lock/unlock room
    setLocked(locked) {
        this.isLocked = locked;
    }

    addPlayer(socketId, requestedName, isHost = false) {
        // Generate unique name if duplicate
        const uniqueName = this.generateUniqueName(requestedName);
        
        this.players.set(socketId, {
            name: uniqueName,
            isHost,
            isReady: false,
            role: null // Will be 'imposter' or the location name
        });
        
        // Initialize scoreboard for new player
        this.scoreboard.set(socketId, {
            name: uniqueName,
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

        return uniqueName; // Return the actual name used
    }

    // NEW: Kick player (host only)
    kickPlayer(hostSocketId, targetSocketId) {
        // Verify the kicker is the host
        if (hostSocketId !== this.hostId) {
            return { error: 'Only the host can kick players' };
        }

        // Can't kick yourself
        if (hostSocketId === targetSocketId) {
            return { error: 'You cannot kick yourself' };
        }

        const targetPlayer = this.players.get(targetSocketId);
        if (!targetPlayer) {
            return { error: 'Player not found' };
        }

        // Remove the player
        this.removePlayer(targetSocketId);
        
        return { 
            success: true, 
            kickedPlayerName: targetPlayer.name 
        };
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

    setCustomLocations(locations) {
        this.customLocations = locations;
    }

    getLocations() {
        return this.customLocations.length > 0 ? this.customLocations : defaultLocations;
    }

    startGame() {
        if (this.players.size < 3) return false;
        
        // Shuffle players and assign roles
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder);
        
        // Choose location and imposter
        const locations = this.getLocations();
        this.gameState.location = locations[Math.floor(Math.random() * locations.length)];
        const imposterIndex = Math.floor(Math.random() * this.playerOrder.length);
        this.gameState.imposter = this.playerOrder[imposterIndex];
        
        console.log(`Game started in room ${this.roomCode}:`);
        console.log(`Location: ${this.gameState.location}`);
        console.log(`Imposter: ${this.players.get(this.gameState.imposter).name}`);
        
        // SIMPLIFIED: Initialize simple data collection
        this.currentGameData = {
            gameNumber: this.gameHistory.length + 1,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            playerQAs: [],
            playerVotes: [],
            outcome: null,
            timestamp: new Date().toISOString(),
            roomCode: this.roomCode
        };
        
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
        
        // Initialize game state - RESET ALL VOTING STATES
        this.gameState.status = 'playing';
        this.gameState.currentTurn = 0;
        this.gameState.questionsThisRound = 0;
        this.gameState.questionsPerRound = this.players.size; // One question per player per round
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        this.gameState.currentQuestion = null;
        
        // RESET VOTING READY STATES
        this.gameState.readyToVoteCount = 0;
        this.gameState.readyToVotePlayers.clear();
        
        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        
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

    // Enhanced ask question handling
    handleAskQuestion(askerId, targetId) {
        // Check if it's the player's turn
        if (this.getCurrentPlayer() !== askerId) {
            return { error: 'Not your turn' };
        }

        // Check if question already asked this turn
        if (this.gameState.questionAskedThisTurn) {
            return { error: 'Question already asked this turn' };
        }

        // Check if we're waiting for an answer
        if (this.gameState.waitingForAnswer) {
            return { error: 'Waiting for answer to previous question' };
        }

        const question = this.getNextQuestion();
        const askerName = this.players.get(askerId).name;
        const targetName = this.players.get(targetId).name;

        // Store current question for tracking
        this.gameState.currentQuestion = {
            askerId,
            targetId,
            question
        };

        // Mark question as asked and waiting for answer
        this.gameState.questionAskedThisTurn = true;
        this.gameState.waitingForAnswer = true;

        console.log(`Question asked in room ${this.roomCode}: ${askerName} asks ${targetName} "${question}"`);

        return {
            success: true,
            asker: askerName,
            target: targetName,
            question,
            askerId,
            targetId
        };
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

        // SIMPLIFIED: Just log everything - you decide what to learn from later
        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerQAs.push({
            asker: this.players.get(askerId).name,
            target: targetPlayer.name,
            question: question,
            answer: answer,
            targetRole: targetPlayer.role, // 'imposter' or location name
            wasTargetImposter: targetId === this.gameState.imposter,
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

        // Reset question flags when moving to next turn
        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        this.gameState.currentQuestion = null;

        // Move to next turn
        this.gameState.questionsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        console.log(`Questions this round: ${this.gameState.questionsThisRound}/${this.gameState.questionsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);
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

    submitVote(voterId, targetId, reasoning = null) {
        // Prevent players from voting for themselves
        if (voterId === targetId) {
            console.log(`Player ${this.players.get(voterId).name} tried to vote for themselves - ignored`);
            return;
        }
        
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        // SIMPLIFIED: Just log the vote data
        const voterPlayer = this.players.get(voterId);
        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerVotes.push({
            voter: voterPlayer.name,
            votedFor: targetPlayer?.name || 'Unknown',
            wasCorrect: targetId === this.gameState.imposter,
            voterWasImposter: voterId === this.gameState.imposter,
            reasoning: reasoning || null
        });
        
        // Update voting stats
        const voterStats = this.scoreboard.get(voterId);
        voterStats.totalVotes++;
        if (targetId === this.gameState.imposter) {
            voterStats.correctVotes++;
        }
        
        // Check if all players have voted
        if (this.gameState.votes.size === this.players.size) {
            console.log('All votes received, processing results');
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

        console.log('Vote counts:', Array.from(voteCounts.entries()).map(([id, count]) => 
            `${this.players.get(id)?.name || 'Unknown'}: ${count}`
        ));

        // Find player with most votes
        let maxVotes = 0;
        let mostVoted = null;
        voteCounts.forEach((count, playerId) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = playerId;
            }
        });

        // Need at least (players - 1) votes for someone to be eliminated
        const requiredVotes = this.players.size - 1;
        console.log(`Required votes: ${requiredVotes}, Max votes: ${maxVotes}`);
        
        if (maxVotes >= requiredVotes && mostVoted) {
            // Someone got enough votes to be eliminated
            const wasImposter = mostVoted === this.gameState.imposter;
            console.log(`${this.players.get(mostVoted).name} got enough votes. Was imposter: ${wasImposter}`);
            
            if (wasImposter) {
                // Location team correctly identified imposter - only location team wins
                this.endGame('location_wins', `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                // Location team voted wrong person - only imposter wins
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
            // Votes were too spread out - location team failed to coordinate, only imposter wins
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
        if (this.gameState.status === 'ended') {
            console.warn('endGame called more than once – ignored.');
            return;
        }
    
        console.log(`Game ended in room ${this.roomCode}: ${winner} - ${message}`);
        this.gameState.status = 'ended';
        this.gameState.gameResult = {
            winner,
            message,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name
        };

        // Set outcome and save
        this.currentGameData.outcome = winner;
        this.updateScoreboardAfterGame(winner);
        this.saveGameToHistory();
        this.saveGameData();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }
    

    // SIMPLIFIED: Save all game data to one simple file
    saveGameData() {
        if (this.currentGameData.playerQAs.length === 0) {
            console.log('No game data to save');
            return;
        }
    
        // Store in global array for download
        allGameData.push(JSON.parse(JSON.stringify(this.currentGameData)));
    
        // Console logging (same as before)
        let gameLog = `\n${'='.repeat(60)}\n`;
        gameLog += `GAME ${this.currentGameData.gameNumber}\n`;
        gameLog += `Timestamp: ${this.currentGameData.timestamp}\n`;
        gameLog += `Room: ${this.currentGameData.roomCode}\n`;
        gameLog += `Location: ${this.currentGameData.location}\n`;
        gameLog += `Imposter: ${this.currentGameData.imposter}\n`;
        gameLog += `Outcome: ${this.currentGameData.outcome}\n`;
        gameLog += '\n';
        
        gameLog += 'QUESTIONS AND ANSWERS:\n';
        this.currentGameData.playerQAs.forEach(qa => {
            gameLog += `${qa.asker} asks ${qa.target}: "${qa.question}"\n`;
            gameLog += `${qa.target} (${qa.targetRole}): "${qa.answer}"\n`;
            gameLog += '\n';
        });
        
        gameLog += 'VOTES:\n';
        this.currentGameData.playerVotes.forEach(vote => {
            const correctText = vote.wasCorrect ? 'CORRECT' : 'WRONG';
            gameLog += `${vote.voter} votes for ${vote.votedFor} (${correctText})\n`;
            if (vote.reasoning) {
                gameLog += `Reasoning: ${vote.reasoning}\n`;
            }
        });
        
        gameLog += `${'='.repeat(60)}\n`;
        
        console.log('GAME DATA SAVED:');
        console.log(gameLog);
        console.log(`📊 Total games stored: ${allGameData.length} (available for download)`);
        
        // Also try to save to file (for local development)
        try {
            fs.appendFileSync('gamelogs.txt', gameLog, 'utf8');
            console.log('✅ Also saved to local file');
        } catch (error) {
            console.log('ℹ️ File save failed (expected on Render):', error.message);
        }
    }

    // Scoreboard update logic
    updateScoreboardAfterGame(winner) {
        console.log(`Updating scoreboard for winner: ${winner}`);
        
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            const isImposter = socketId === this.gameState.imposter;
            
            let didWin = false;
            
            if (winner === 'imposter_wins') {
                // Only the imposter gets a win point
                if (isImposter) {
                    didWin = true;
                    stats.timesImposterWon++;
                    console.log(`${player.name} (imposter) gets win point`);
                }
            } else if (winner === 'location_wins') {
                // All non-imposters (location team) get a win point
                if (!isImposter) {
                    didWin = true;
                    console.log(`${player.name} (location team) gets win point`);
                }
            }
            
            if (didWin) {
                stats.gamesWon++;
            }
            
            // Final score is based on games won
            stats.score = stats.gamesWon;
            
            console.log(`${player.name} final stats: ${stats.gamesWon}/${stats.gamesPlayed} wins, score: ${stats.score}`);
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

    // SIMPLIFIED: Just get basic stats
    getGameStats() {
        try {
            if (!fs.existsSync('gamelogs.txt')) {
                return { totalGames: 0, totalQuestions: 0, totalVotes: 0 };
            }
            
            const content = fs.readFileSync('gamelogs.txt', 'utf8');
            const gameCount = (content.match(/GAME \d+/g) || []).length;
            const questionCount = (content.match(/asks .+: "/g) || []).length;
            const voteCount = (content.match(/votes for .+ \(/g) || []).length;
            
            return {
                totalGames: gameCount,
                totalQuestions: questionCount,
                totalVotes: voteCount
            };
        } catch (error) {
            console.error('Error reading game stats:', error);
            return { totalGames: 0, totalQuestions: 0, totalVotes: 0 };
        }
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
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers),
            gameStats: this.getGameStats(), // SIMPLIFIED: Basic stats only
            isLocked: this.isLocked // NEW: Include lock status
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
        const actualName = room.addPlayer(socket.id, playerName, true);
        gameRooms.set(roomCode, room);
        
        socket.join(roomCode);
        socket.emit('room_created', { roomCode, isHost: true, actualName });
        socket.emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked
        });
    });

    socket.on('join_room', ({ roomCode, playerName }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // NEW: Check if room is locked
        if (room.isLocked) {
            socket.emit('error', 'Room is locked');
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

        // NEW: Generate unique name and inform if changed
        const actualName = room.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        socket.emit('room_joined', { 
            roomCode, 
            isHost: false, 
            actualName,
            nameChanged: actualName !== playerName
        });
        
        // Notify all players in room
        io.to(roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked
        });
        
        // If name was changed, notify the player
        if (actualName !== playerName) {
            socket.emit('name_changed', { 
                originalName: playerName, 
                newName: actualName 
            });
        }
    });

    // NEW: Lock/unlock room
    socket.on('toggle_lock', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can lock/unlock the room');
            return;
        }

        room.setLocked(!room.isLocked);
        
        // Notify all players
        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked
        });
        
        io.to(room.roomCode).emit('room_lock_changed', { 
            isLocked: room.isLocked,
            message: room.isLocked ? 'Room locked - no new players can join' : 'Room unlocked - new players can join'
        });
    });

    // NEW: Kick player
    socket.on('kick_player', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        const result = room.kickPlayer(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        // Notify the kicked player
        io.to(targetId).emit('kicked', { 
            message: 'You have been kicked from the room by the host',
            roomCode: room.roomCode
        });

        // Disconnect the kicked player from the room
        const kickedSocket = io.sockets.sockets.get(targetId);
        if (kickedSocket) {
            kickedSocket.leave(room.roomCode);
        }

        // Notify remaining players
        io.to(room.roomCode).emit('player_kicked', {
            kickedPlayerName: result.kickedPlayerName,
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked
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
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked
        });
    });

    socket.on('start_game', (data) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) return;

        // Set custom locations if provided
        if (data && data.customLocations && Array.isArray(data.customLocations)) {
            room.setCustomLocations(data.customLocations);
        }

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

    // Enhanced ask question handler
    socket.on('ask_question', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleAskQuestion(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        // Send question to all players
        io.to(room.roomCode).emit('question_asked', result);
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

    // Enhanced vote submission with reasoning
    socket.on('submit_vote', ({ targetId, reasoning }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'voting') return;

        room.submitVote(socket.id, targetId, reasoning);

        // Send updated vote count to all players
        const voterName = room.players.get(socket.id).name;
        const targetName = room.players.get(targetId)?.name || 'Unknown';
        
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

    // SIMPLIFIED: Just get basic game stats
    socket.on('get_game_stats', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        socket.emit('game_stats_updated', room.getGameStats());
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
                    scoreboard: room.getScoreboardData(),
                    isLocked: room.isLocked
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
    console.log('Game logging enabled - all game data will be saved to gamelogs.txt');
});