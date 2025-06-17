const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

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
            questionAskedThisTurn: false, // NEW: Track if question was asked this turn
            waitingForAnswer: false // NEW: Track if we're waiting for an answer
        };
        this.playerOrder = [];
        this.scoreboard = new Map(); // socketId -> player stats
        this.gameHistory = []; // Track all games in this room
        this.customLocations = []; // Store custom locations set by host
        
        // NEW: Learning data collection
        this.currentGameLearning = {
            location: null,
            imposter: null,
            playerQaPairs: [], // All player Q&A pairs
            playerVotes: [], // All player votes with reasoning
            outcome: null,
            roomCode: this.roomCode,
            gameNumber: 1
        };
        
        // NEW: Learning configuration
        this.learningConfig = {
            gameType: 'multiplayer', // 'multiplayer' or 'ai'
            learnFromAll: true, // For multiplayer: learn from everyone
            // For AI game: learn only from human when they know location, 
            // or from everyone when human is imposter
            humanPlayerId: null // Set this for AI games
        };
    }

    // NEW: Configure learning settings
    configureLearning(gameType, humanPlayerId = null) {
        this.learningConfig = {
            gameType,
            learnFromAll: gameType === 'multiplayer',
            humanPlayerId
        };
        console.log(`Learning configured for room ${this.roomCode}: ${gameType} mode`);
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
        
        // NEW: Initialize learning data for this game
        this.currentGameLearning = {
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            playerQaPairs: [],
            playerVotes: [],
            outcome: null,
            roomCode: this.roomCode,
            gameNumber: this.gameHistory.length + 1,
            timestamp: new Date().toISOString()
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
        this.gameState.questionAskedThisTurn = false; // NEW: Reset question flags
        this.gameState.waitingForAnswer = false; // NEW: Reset waiting flag
        
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

    // NEW: Enhanced ask question handling
    handleAskQuestion(askerId, targetId) {
        // Check if it's the player's turn
        if (this.getCurrentPlayer() !== askerId) {
            return { error: 'Not your turn' };
        }

        // NEW: Check if question already asked this turn
        if (this.gameState.questionAskedThisTurn) {
            return { error: 'Question already asked this turn' };
        }

        // NEW: Check if we're waiting for an answer
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

        // NEW: Mark question as asked and waiting for answer
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

    // NEW: Determine if we should learn from this answer
    shouldLearnFromAnswer(playerId) {
        if (this.learningConfig.gameType === 'multiplayer') {
            return true; // Learn from everyone in multiplayer
        }
        
        // AI game logic
        const isHuman = playerId === this.learningConfig.humanPlayerId;
        const humanIsImposter = this.learningConfig.humanPlayerId === this.gameState.imposter;
        
        if (humanIsImposter) {
            return true; // Learn from everyone when human is imposter
        } else {
            return isHuman; // Only learn from human when they know the location
        }
    }

    // NEW: Enhanced learning data collection
    collectLearningData(askerId, targetId, question, answer) {
        const targetPlayer = this.players.get(targetId);
        const shouldLearn = this.shouldLearnFromAnswer(targetId);
        
        if (shouldLearn) {
            this.currentGameLearning.playerQaPairs.push({
                playerName: targetPlayer.name,
                question: question,
                answer: answer,
                role: targetPlayer.role,
                location: this.gameState.location,
                round: this.gameState.currentRound,
                wasImposter: targetId === this.gameState.imposter,
                gameType: this.learningConfig.gameType,
                isHuman: this.learningConfig.gameType === 'ai' ? targetId === this.learningConfig.humanPlayerId : true
            });
        }
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

        // NEW: Use enhanced learning data collection
        this.collectLearningData(askerId, targetId, question, answer);

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

        // NEW: Reset question flags when moving to next turn
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

    // NEW: Determine if we should learn from this vote
    shouldLearnFromVote(voterId) {
        // Same logic as answers for consistency
        return this.shouldLearnFromAnswer(voterId);
    }

    // NEW: Enhanced vote collection
    collectVoteData(voterId, targetId, reasoning = null) {
        const shouldLearn = this.shouldLearnFromVote(voterId);
        
        if (shouldLearn) {
            const voterPlayer = this.players.get(voterId);
            const targetPlayer = this.players.get(targetId);
            const wasCorrect = targetId === this.gameState.imposter;
            
            this.currentGameLearning.playerVotes.push({
                voterName: voterPlayer.name,
                votedFor: targetPlayer?.name || 'Unknown',
                wasCorrect: wasCorrect,
                reasoning: reasoning || null,
                voterWasImposter: voterId === this.gameState.imposter,
                round: this.gameState.currentRound,
                gameType: this.learningConfig.gameType,
                isHuman: this.learningConfig.gameType === 'ai' ? voterId === this.learningConfig.humanPlayerId : true
            });
        }
    }

    submitVote(voterId, targetId, reasoning = null) {
        // Prevent players from voting for themselves
        if (voterId === targetId) {
            console.log(`Player ${this.players.get(voterId).name} tried to vote for themselves - ignored`);
            return;
        }
        
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        // NEW: Use enhanced vote collection
        this.collectVoteData(voterId, targetId, reasoning);
        
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
        console.log(`Game ended in room ${this.roomCode}: ${winner} - ${message}`);
        this.gameState.status = 'ended';
        this.gameState.gameResult = {
            winner,
            message,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name
        };

        // NEW: Set outcome for learning data
        this.currentGameLearning.outcome = winner;

        // Award points based on team-based scoring (only once per game)
        this.updateScoreboardAfterGame(winner);

        this.saveGameToHistory();
        
        // NEW: Save learning data
        this.saveLearningData();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }

    // NEW: Scoreboard update logic
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

    // NEW: Save learning data method
    saveLearningData() {
        if (this.currentGameLearning.playerQaPairs.length === 0 && this.currentGameLearning.playerVotes.length === 0) {
            console.log('No learning data to save');
            return;
        }

        try {
            // Determine filename based on game type
            const filename = this.learningConfig.gameType === 'multiplayer' 
                ? 'gamelogs_multiplayer.txt' 
                : 'gamelogs_ai.txt';
            
            let learningContent = `GAME ${this.currentGameLearning.gameNumber}\n`;
            learningContent += `GameType: ${this.learningConfig.gameType}\n`;
            learningContent += `Location: ${this.currentGameLearning.location}\n`;
            learningContent += `Imposter: ${this.currentGameLearning.imposter}\n`;
            
            // Write all Q&A pairs that we're learning from
            this.currentGameLearning.playerQaPairs.forEach(qa => {
                const roleStr = qa.wasImposter ? "Imposter" : qa.location;
                const humanFlag = qa.gameType === 'ai' ? ` | Human: ${qa.isHuman}` : '';
                learningContent += `Q: ${qa.question} | ${qa.playerName}: ${qa.answer} | Role: ${roleStr}${humanFlag}\n`;
            });
            
            // Write all votes that we're learning from
            this.currentGameLearning.playerVotes.forEach(vote => {
                const reasoningText = vote.reasoning ? ` | Reasoning: ${vote.reasoning}` : "";
                const humanFlag = vote.gameType === 'ai' ? ` | Human: ${vote.isHuman}` : '';
                learningContent += `Vote: ${vote.voterName}->${vote.votedFor} | Correct: ${vote.wasCorrect}${reasoningText}${humanFlag}\n`;
            });
            
            learningContent += `Outcome: ${this.currentGameLearning.outcome}\n`;
            learningContent += `Timestamp: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n`;
            learningContent += '\n';
            
            // Append to appropriate file
            fs.appendFileSync(filename, learningContent, 'utf8');
            
            console.log(`Learning data saved to ${filename} for room ${this.roomCode}, game ${this.currentGameLearning.gameNumber}`);
            console.log(`Saved ${this.currentGameLearning.playerQaPairs.length} Q&A pairs and ${this.currentGameLearning.playerVotes.length} votes`);
            
        } catch (error) {
            console.error('Error saving learning data:', error);
        }
    }

    // NEW: Get learning stats
    getLearningStats() {
        try {
            const filename = this.learningConfig.gameType === 'multiplayer' 
                ? 'gamelogs_multiplayer.txt' 
                : 'gamelogs_ai.txt';
                
            if (!fs.existsSync(filename)) {
                return { totalGames: 0, totalQAs: 0, totalVotes: 0 };
            }
            
            const content = fs.readFileSync(filename, 'utf8');
            const gameCount = (content.match(/GAME \d+/g) || []).length;
            const qaCount = (content.match(/Q: .+ \| .+ \| Role: /g) || []).length;
            const voteCount = (content.match(/Vote: .+->.+ \| Correct: /g) || []).length;
            
            return {
                totalGames: gameCount,
                totalQAs: qaCount,
                totalVotes: voteCount
            };
        } catch (error) {
            console.error('Error reading learning stats:', error);
            return { totalGames: 0, totalQAs: 0, totalVotes: 0 };
        }
    }

    // NEW: Get combined learning stats
    getCombinedLearningStats() {
        try {
            const multiplayerStats = this.getFileStats('gamelogs_multiplayer.txt');
            const aiStats = this.getFileStats('gamelogs_ai.txt');
            
            return {
                multiplayer: multiplayerStats,
                ai: aiStats,
                combined: {
                    totalGames: multiplayerStats.totalGames + aiStats.totalGames,
                    totalQAs: multiplayerStats.totalQAs + aiStats.totalQAs,
                    totalVotes: multiplayerStats.totalVotes + aiStats.totalVotes
                }
            };
        } catch (error) {
            console.error('Error getting combined stats:', error);
            return {
                multiplayer: { totalGames: 0, totalQAs: 0, totalVotes: 0 },
                ai: { totalGames: 0, totalQAs: 0, totalVotes: 0 },
                combined: { totalGames: 0, totalQAs: 0, totalVotes: 0 }
            };
        }
    }

    // NEW: Get stats for a specific file
    getFileStats(filename) {
        try {
            if (!fs.existsSync(filename)) {
                return { totalGames: 0, totalQAs: 0, totalVotes: 0 };
            }
            
            const content = fs.readFileSync(filename, 'utf8');
            const gameCount = (content.match(/GAME \d+/g) || []).length;
            const qaCount = (content.match(/Q: .+ \| .+ \| Role: /g) || []).length;
            const voteCount = (content.match(/Vote: .+->.+ \| Correct: /g) || []).length;
            
            return {
                totalGames: gameCount,
                totalQAs: qaCount,
                totalVotes: voteCount
            };
        } catch (error) {
            console.error(`Error reading stats from ${filename}:`, error);
            return { totalGames: 0, totalQAs: 0, totalVotes: 0 };
        }
    }

    // NEW: Combine learning files
    static combineLearningFiles() {
        try {
            const multiplayerFile = 'gamelogs_multiplayer.txt';
            const aiFile = 'gamelogs_ai.txt';
            const combinedFile = 'gamelogs_combined.txt';
            
            let combinedContent = '// Combined learning data from multiplayer and AI games\n';
            combinedContent += `// Generated: ${new Date().toISOString()}\n\n`;
            
            // Add multiplayer data
            if (fs.existsSync(multiplayerFile)) {
                combinedContent += '// === MULTIPLAYER GAMES ===\n';
                combinedContent += fs.readFileSync(multiplayerFile, 'utf8');
                combinedContent += '\n';
            }
            
            // Add AI data
            if (fs.existsSync(aiFile)) {
                combinedContent += '// === AI GAMES ===\n';
                combinedContent += fs.readFileSync(aiFile, 'utf8');
            }
            
            fs.writeFileSync(combinedFile, combinedContent, 'utf8');
            console.log('Learning files combined successfully');
            
            return {
                success: true,
                combinedFile,
                message: 'Learning data combined successfully'
            };
        } catch (error) {
            console.error('Error combining learning files:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // NEW: Export learning data as JSON
    exportLearningAsJSON() {
        const stats = this.getCombinedLearningStats();
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                roomCode: this.roomCode,
                stats: stats
            },
            games: []
        };
        
        // Read and parse both learning files
        ['gamelogs_multiplayer.txt', 'gamelogs_ai.txt'].forEach(filename => {
            if (fs.existsSync(filename)) {
                const content = fs.readFileSync(filename, 'utf8');
                const games = this.parseLearningFile(content);
                exportData.games.push(...games);
            }
        });
        
        return JSON.stringify(exportData, null, 2);
    }

    // NEW: Export learning data as CSV
    exportLearningAsCSV() {
        let csv = 'GameNumber,GameType,Location,Imposter,Round,QuestionAsker,QuestionTarget,Question,Answer,PlayerRole,WasImposter,Outcome\n';
        
        ['gamelogs_multiplayer.txt', 'gamelogs_ai.txt'].forEach(filename => {
            if (fs.existsSync(filename)) {
                const content = fs.readFileSync(filename, 'utf8');
                const games = this.parseLearningFile(content);
                
                games.forEach(game => {
                    game.qaPairs.forEach(qa => {
                        csv += `${game.gameNumber},"${game.gameType}","${game.location}","${game.imposter}",${qa.round},"","${qa.playerName}","${qa.question}","${qa.answer}","${qa.role}",${qa.wasImposter},"${game.outcome}"\n`;
                    });
                });
            }
        });
        
        return csv;
    }

    // NEW: Parse learning file into structured data
    parseLearningFile(content) {
        const games = [];
        const gameBlocks = content.split(/GAME \d+/).slice(1);
        
        gameBlocks.forEach((block, index) => {
            const lines = block.trim().split('\n');
            const game = {
                gameNumber: index + 1,
                gameType: 'multiplayer',
                location: '',
                imposter: '',
                outcome: '',
                qaPairs: [],
                votes: []
            };
            
            lines.forEach(line => {
                if (line.startsWith('GameType:')) {
                    game.gameType = line.replace('GameType:', '').trim();
                } else if (line.startsWith('Location:')) {
                    game.location = line.replace('Location:', '').trim();
                } else if (line.startsWith('Imposter:')) {
                    game.imposter = line.replace('Imposter:', '').trim();
                } else if (line.startsWith('Outcome:')) {
                    game.outcome = line.replace('Outcome:', '').trim();
                } else if (line.startsWith('Q:')) {
                    // Parse Q&A line
                    const match = line.match(/Q: (.+) \| (.+): (.+) \| Role: (.+)/);
                    if (match) {
                        game.qaPairs.push({
                            question: match[1],
                            playerName: match[2],
                            answer: match[3],
                            role: match[4],
                            wasImposter: match[4] === 'Imposter'
                        });
                    }
                } else if (line.startsWith('Vote:')) {
                    // Parse vote line
                    const match = line.match(/Vote: (.+)->(.+) \| Correct: (.+)/);
                    if (match) {
                        game.votes.push({
                            voter: match[1],
                            target: match[2],
                            wasCorrect: match[3] === 'true'
                        });
                    }
                }
            });
            
            games.push(game);
        });
        
        return games;
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
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers), // Convert Set to Array for JSON
            learningStats: this.getLearningStats() // NEW: Include learning stats
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
            scoreboard: room.getScoreboardData(),
            learningStats: room.getLearningStats() // NEW: Send learning stats
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
            scoreboard: room.getScoreboardData(),
            learningStats: room.getLearningStats() // NEW: Send learning stats
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
            learningStats: room.getLearningStats() // NEW: Send learning stats
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

    // NEW: Enhanced ask question handler
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

    // NEW: Enhanced vote submission with reasoning
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
            gameHistory: room.gameHistory,
            learningStats: room.getLearningStats() // NEW: Include learning stats
        });
    });

    // NEW: Configure learning type for room
    socket.on('configure_learning', ({ gameType, humanPlayerId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        // Only host can configure learning
        if (!room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only host can configure learning settings');
            return;
        }
        
        room.configureLearning(gameType, humanPlayerId);
        
        socket.emit('learning_configured', {
            gameType,
            humanPlayerId,
            message: `Learning configured for ${gameType} mode`
        });
        
        console.log(`Learning configured for room ${room.roomCode}: ${gameType} mode`);
    });

    // NEW: Combine learning files
    socket.on('combine_learning_files', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        // Only host can combine files
        if (!room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only host can combine learning files');
            return;
        }
        
        const result = GameRoom.combineLearningFiles();
        socket.emit('learning_files_combined', result);
    });

    // NEW: Get detailed learning stats
    socket.on('get_detailed_learning_stats', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        const stats = room.getCombinedLearningStats();
        socket.emit('detailed_learning_stats', stats);
    });

    // NEW: Export learning data
    socket.on('export_learning_data', ({ format }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        // Only host can export
        if (!room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only host can export learning data');
            return;
        }
        
        try {
            let exportData;
            
            if (format === 'json') {
                exportData = room.exportLearningAsJSON();
            } else if (format === 'csv') {
                exportData = room.exportLearningAsCSV();
            } else {
                exportData = room.exportLearningAsText();
            }
            
            socket.emit('learning_data_exported', {
                format,
                data: exportData,
                filename: `learning_export_${Date.now()}.${format}`
            });
            
        } catch (error) {
            socket.emit('error', 'Failed to export learning data');
        }
    });

    // NEW: Manual save learning data endpoint
    socket.on('save_learning_data', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        // Only host can manually save
        if (!room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only host can manually save learning data');
            return;
        }
        
        try {
            room.saveLearningData();
            socket.emit('learning_data_saved', {
                message: 'Learning data saved successfully',
                stats: room.getLearningStats()
            });
        } catch (error) {
            socket.emit('error', 'Failed to save learning data');
        }
    });

    // NEW: Get learning stats endpoint
    socket.on('get_learning_stats', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        socket.emit('learning_stats_updated', room.getLearningStats());
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
                    learningStats: room.getLearningStats() // NEW: Include learning stats
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
    console.log('Learning system enabled - all player data will be saved to gamelogs_multiplayer.txt or gamelogs_ai.txt');
});