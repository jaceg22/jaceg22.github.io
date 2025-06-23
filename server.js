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

// Bot AI logic
class BotAI {
    constructor(botId, difficulty = 'medium') {
        this.botId = botId;
        this.difficulty = difficulty;
        this.suspicion = new Map(); // Track suspicion levels
        this.observedAnswers = [];
        this.locationHints = [];
    }

    // Generate bot response based on role and location knowledge
    generateResponse(question, location, isImposter, observedAnswers = []) {
        const questionLower = question.toLowerCase();
        
        if (isImposter) {
            return this.generateImposterResponse(question, observedAnswers);
        } else {
            return this.generateLocationResponse(question, location);
        }
    }

    generateImposterResponse(question, observedAnswers) {
        const questionLower = question.toLowerCase();
        
        // Try to blend in based on other answers
        if (observedAnswers.length > 0) {
            // Look for patterns in previous answers
            const answers = observedAnswers.map(a => a.answer.toLowerCase());
            
            if (questionLower.includes('safe') || questionLower.includes('scared')) {
                const safetyAnswers = answers.filter(a => a.includes('yes') || a.includes('no') || a.includes('maybe'));
                if (safetyAnswers.length > 0) {
                    return this.randomChoice(['maybe', 'not really', 'somewhat']);
                }
            }
            
            if (questionLower.includes('weather')) {
                return this.randomChoice(['nice', 'okay', 'decent', 'alright']);
            }
        }
        
        // Fallback generic responses
        if (questionLower.includes('safe') || questionLower.includes('scared')) {
            return this.randomChoice(['maybe', 'not really', 'somewhat', 'a little']);
        }
        if (questionLower.includes('weather')) {
            return this.randomChoice(['nice', 'okay', 'decent']);
        }
        if (questionLower.includes('see around')) {
            return this.randomChoice(['people', 'workers', 'visitors']);
        }
        if (questionLower.includes('meet')) {
            return this.randomChoice(['friends', 'family', 'people']);
        }
        if (questionLower.includes('celebrity')) {
            return this.randomChoice(['Tom Hanks', 'Jennifer Lawrence', 'Ryan Reynolds']);
        }
        if (questionLower.includes('transportation')) {
            return this.randomChoice(['car', 'bus', 'plane']);
        }
        if (questionLower.includes('clothing') || questionLower.includes('wear')) {
            return this.randomChoice(['casual clothes', 'comfortable clothes', 'normal clothes']);
        }
        if (questionLower.includes('food')) {
            return this.randomChoice(['decent', 'okay', 'alright']);
        }
        if (questionLower.includes('ticket')) {
            return this.randomChoice(['maybe', 'not sure', 'depends']);
        }
        
        return this.randomChoice(['not sure', 'maybe', 'depends', 'hard to say']);
    }

    generateLocationResponse(question, location) {
        const questionLower = question.toLowerCase();
        const locationLower = location.toLowerCase();
        
        // Location-specific responses
        if (locationLower.includes('space station')) {
            if (questionLower.includes('weather')) return 'controlled';
            if (questionLower.includes('transportation')) return 'rocket';
            if (questionLower.includes('see around')) return 'equipment';
            if (questionLower.includes('safe')) return 'yes';
        }
        
        if (locationLower.includes('beach')) {
            if (questionLower.includes('weather')) return 'sunny';
            if (questionLower.includes('clothing')) return 'light clothes';
            if (questionLower.includes('see around')) return 'people';
            if (questionLower.includes('safe')) return 'yes';
        }
        
        if (locationLower.includes('prison')) {
            if (questionLower.includes('safe')) return 'no';
            if (questionLower.includes('see around')) return 'people';
            if (questionLower.includes('vibe')) return 'tense';
        }
        
        if (locationLower.includes('high school')) {
            if (questionLower.includes('meet')) return 'friends';
            if (questionLower.includes('see around')) return 'people';
            if (questionLower.includes('food')) return 'decent';
            if (questionLower.includes('safe')) return 'yes';
        }
        
        // Generic location-aware responses
        if (questionLower.includes('safe') || questionLower.includes('scared')) {
            return this.randomChoice(['yes', 'mostly', 'usually']);
        }
        if (questionLower.includes('see around')) {
            return this.randomChoice(['people', 'workers', 'visitors']);
        }
        if (questionLower.includes('meet')) {
            return this.randomChoice(['friends', 'family', 'people']);
        }
        if (questionLower.includes('celebrity')) {
            return this.randomChoice(['Tom Hanks', 'Jennifer Lawrence', 'Ryan Reynolds']);
        }
        if (questionLower.includes('transportation')) {
            return this.randomChoice(['car', 'bus']);
        }
        if (questionLower.includes('weather')) {
            return this.randomChoice(['nice', 'good', 'pleasant']);
        }
        if (questionLower.includes('food')) {
            return this.randomChoice(['good', 'decent', 'alright']);
        }
        
        return this.randomChoice(['good', 'nice', 'okay', 'decent']);
    }

    // Choose target for asking questions
    chooseQuestionTarget(players, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
        // Target most suspicious player or random if no strong suspicion
        let target = availableTargets[0];
        let maxSuspicion = 0;
        
        for (const player of availableTargets) {
            const suspicion = suspicionLevels.get(player.id) || 0;
            if (suspicion > maxSuspicion || (suspicion === maxSuspicion && Math.random() > 0.5)) {
                maxSuspicion = suspicion;
                target = player;
            }
        }
        
        return target.id;
    }

    // Vote for most suspicious player
    chooseVoteTarget(players, isImposter, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
        if (isImposter) {
            // As imposter, vote for someone who seems to know the location well
            return this.randomChoice(availableTargets).id;
        } else {
            // As location team, vote for most suspicious
            let mostSuspicious = availableTargets[0];
            let maxSuspicion = suspicionLevels.get(mostSuspicious.id) || 0;
            
            for (const player of availableTargets) {
                const suspicion = suspicionLevels.get(player.id) || 0;
                if (suspicion > maxSuspicion) {
                    maxSuspicion = suspicion;
                    mostSuspicious = player;
                }
            }
            
            return mostSuspicious.id;
        }
    }

    updateSuspicion(playerId, answer, question, location, isImposter) {
        if (!this.suspicion.has(playerId)) {
            this.suspicion.set(playerId, 0);
        }
        
        let suspicionChange = 0;
        const answerLower = answer.toLowerCase();
        
        if (!isImposter) {
            // As location team, increase suspicion for vague/wrong answers
            if (answerLower.includes('maybe') || answerLower.includes('not sure')) {
                suspicionChange += 5;
            }
            
            if (answer.split(' ').length <= 2) {
                suspicionChange += 3;
            }
        }
        
        const currentSuspicion = this.suspicion.get(playerId);
        this.suspicion.set(playerId, Math.max(0, Math.min(100, currentSuspicion + suspicionChange)));
    }

    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

class GameRoom {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.players = new Map(); // socketId -> {name, isHost, isReady, isBot}
        this.bots = new Map(); // botId -> BotAI instance
        this.isLocked = false;
        this.gameState = {
            status: 'waiting',
            location: null,
            imposter: null,
            currentRound: 1,
            currentTurn: 0,
            questionsThisRound: 0,
            questionsPerRound: null,
            questionQueue: [...questions],
            gameHistory: [],
            votes: new Map(),
            playerAnswers: new Map(),
            currentQuestion: null,
            readyToVoteCount: 0,
            readyToVotePlayers: new Set(),
            questionAskedThisTurn: false,
            waitingForAnswer: false
        };
        this.playerOrder = [];
        this.scoreboard = new Map();
        this.gameHistory = [];
        this.customLocations = [];
        this.botSuspicion = new Map(); // Track bot suspicion levels
        
        this.currentGameData = {
            gameNumber: 1,
            location: null,
            imposter: null,
            playerQAs: [],
            playerVotes: [],
            outcome: null,
            timestamp: null,
            roomCode: this.roomCode
        };
    }

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

    setLocked(locked) {
        this.isLocked = locked;
    }

    addPlayer(socketId, requestedName, isHost = false) {
        const uniqueName = this.generateUniqueName(requestedName);
        
        this.players.set(socketId, {
            name: uniqueName,
            isHost,
            isReady: false,
            isBot: false,
            role: null
        });
        
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

        return uniqueName;
    }

    // NEW: Add bot functionality
    addBot(difficulty = 'medium') {
        // Check if we can add more bots (8 player total limit)
        const totalPlayers = this.players.size;
        if (totalPlayers >= 8) {
            return { error: 'Room is full (8/8 players)' };
        }
        
        // Check if using custom locations
        if (this.customLocations.length > 0) {
            return { error: 'Cannot add bots when using custom locations' };
        }
        
        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const botNames = [
            'Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Echo', 
            'Bot Foxtrot', 'Bot Golf', 'Bot Hotel'
        ];
        
        const usedBotNames = Array.from(this.players.values())
            .filter(p => p.isBot)
            .map(p => p.name);
        
        const availableBotNames = botNames.filter(name => !usedBotNames.includes(name));
        const botName = availableBotNames.length > 0 ? availableBotNames[0] : `Bot ${this.players.size + 1}`;
        
        // Add bot as player
        this.players.set(botId, {
            name: botName,
            isHost: false,
            isReady: true, // Bots are always ready
            isBot: true,
            role: null
        });
        
        // Initialize bot AI
        this.bots.set(botId, new BotAI(botId, difficulty));
        
        // Initialize bot scoreboard
        this.scoreboard.set(botId, {
            name: botName,
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
        
        return { success: true, botId, botName };
    }

    // NEW: Remove bot
    removeBot(botId) {
        const bot = this.players.get(botId);
        if (!bot || !bot.isBot) {
            return { error: 'Bot not found' };
        }
        
        this.players.delete(botId);
        this.bots.delete(botId);
        // Keep scoreboard data
        
        return { success: true, botName: bot.name };
    }

    // NEW: Remove all bots (when custom locations are set)
    removeAllBots() {
        const removedBots = [];
        
        for (const [playerId, player] of this.players.entries()) {
            if (player.isBot) {
                removedBots.push(player.name);
                this.players.delete(playerId);
                this.bots.delete(playerId);
            }
        }
        
        return removedBots;
    }

    kickPlayer(hostSocketId, targetSocketId) {
        if (hostSocketId !== this.hostId) {
            return { error: 'Only the host can kick players' };
        }

        if (hostSocketId === targetSocketId) {
            return { error: 'You cannot kick yourself' };
        }

        const targetPlayer = this.players.get(targetSocketId);
        if (!targetPlayer) {
            return { error: 'Player not found' };
        }

        // Remove the player (works for both humans and bots)
        this.removePlayer(targetSocketId);
        
        return { 
            success: true, 
            kickedPlayerName: targetPlayer.name,
            wasBot: targetPlayer.isBot
        };
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        this.players.delete(socketId);
        
        // Remove bot AI if it's a bot
        if (player && player.isBot) {
            this.bots.delete(socketId);
        }
        
        if (socketId === this.hostId && this.players.size > 0) {
            // Find a human to be the new host (prefer humans over bots)
            let newHost = null;
            for (const [id, p] of this.players.entries()) {
                if (!p.isBot) {
                    newHost = id;
                    break;
                }
            }
            
            // If no humans, pick any player
            if (!newHost) {
                newHost = this.players.keys().next().value;
            }
            
            if (newHost) {
                this.players.get(newHost).isHost = true;
                this.hostId = newHost;
            }
        }
        
        return player;
    }

    setCustomLocations(locations) {
        // Remove all bots when custom locations are set
        const removedBots = this.removeAllBots();
        this.customLocations = locations;
        return removedBots;
    }

    getLocations() {
        return this.customLocations.length > 0 ? this.customLocations : defaultLocations;
    }

    startGame() {
        if (this.players.size < 3) return false;
        
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder);
        
        const locations = this.getLocations();
        this.gameState.location = locations[Math.floor(Math.random() * locations.length)];
        const imposterIndex = Math.floor(Math.random() * this.playerOrder.length);
        this.gameState.imposter = this.playerOrder[imposterIndex];
        
        console.log(`Game started in room ${this.roomCode}:`);
        console.log(`Location: ${this.gameState.location}`);
        console.log(`Imposter: ${this.players.get(this.gameState.imposter).name}`);
        
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
        
        this.gameState.status = 'playing';
        this.gameState.currentTurn = 0;
        this.gameState.questionsThisRound = 0;
        this.gameState.questionsPerRound = this.players.size;
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        this.gameState.currentQuestion = null;
        this.gameState.readyToVoteCount = 0;
        this.gameState.readyToVotePlayers.clear();
        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        
        // Initialize bot suspicion tracking
        this.botSuspicion.clear();
        for (const [botId, bot] of this.bots.entries()) {
            bot.suspicion.clear();
            for (const playerId of this.playerOrder) {
                if (playerId !== botId) {
                    bot.suspicion.set(playerId, 0);
                }
            }
        }
        
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

    handleAskQuestion(askerId, targetId) {
        if (this.getCurrentPlayer() !== askerId) {
            return { error: 'Not your turn' };
        }

        if (this.gameState.questionAskedThisTurn) {
            return { error: 'Question already asked this turn' };
        }

        if (this.gameState.waitingForAnswer) {
            return { error: 'Waiting for answer to previous question' };
        }

        const question = this.getNextQuestion();
        const askerName = this.players.get(askerId).name;
        const targetName = this.players.get(targetId).name;

        this.gameState.currentQuestion = {
            askerId,
            targetId,
            question
        };

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

    // NEW: Handle bot asking question
    handleBotAskQuestion(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return null;
        
        const availablePlayers = this.playerOrder.filter(id => id !== botId);
        if (availablePlayers.length === 0) return null;
        
        const targetId = bot.chooseQuestionTarget(
            availablePlayers.map(id => ({ id, isBot: this.players.get(id).isBot })), 
            bot.suspicion
        );
        
        if (!targetId) return null;
        
        return this.handleAskQuestion(botId, targetId);
    }

    // NEW: Generate bot answer
    generateBotAnswer(botId, question) {
        const bot = this.bots.get(botId);
        const player = this.players.get(botId);
        
        if (!bot || !player) return 'not sure';
        
        const isImposter = botId === this.gameState.imposter;
        const location = this.gameState.location;
        
        return bot.generateResponse(question, location, isImposter, this.gameState.gameHistory);
    }

    processAnswer(askerId, targetId, question, answer) {
        console.log(`Processing answer in room ${this.roomCode}:`);
        console.log(`Asker: ${this.players.get(askerId).name}, Target: ${this.players.get(targetId).name}`);
        console.log(`Question: ${question}, Answer: ${answer}`);
        
        this.gameState.gameHistory.push({
            asker: this.players.get(askerId).name,
            target: this.players.get(targetId).name,
            question,
            answer,
            round: this.gameState.currentRound
        });

        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerQAs.push({
            asker: this.players.get(askerId).name,
            target: targetPlayer.name,
            question: question,
            answer: answer,
            targetRole: targetPlayer.role,
            wasTargetImposter: targetId === this.gameState.imposter,
            round: this.gameState.currentRound
        });

        const askerStats = this.scoreboard.get(askerId);
        const targetStats = this.scoreboard.get(targetId);
        askerStats.questionsAsked++;
        targetStats.questionsAnswered++;

        const targetName = this.players.get(targetId).name;
        if (!this.gameState.playerAnswers.has(targetName)) {
            this.gameState.playerAnswers.set(targetName, []);
        }
        this.gameState.playerAnswers.get(targetName).push(answer);

        // Update bot suspicion levels
        for (const [botId, bot] of this.bots.entries()) {
            if (botId !== targetId) {
                bot.updateSuspicion(
                    targetId, 
                    answer, 
                    question, 
                    this.gameState.location, 
                    botId === this.gameState.imposter
                );
            }
        }

        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        this.gameState.currentQuestion = null;

        this.gameState.questionsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        console.log(`Questions this round: ${this.gameState.questionsThisRound}/${this.gameState.questionsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);
    }

    readyToVote(playerId) {
        if (this.gameState.readyToVotePlayers.has(playerId)) {
            console.log(`Player ${this.players.get(playerId).name} already marked ready to vote`);
            return;
        }

        this.gameState.readyToVotePlayers.add(playerId);
        this.gameState.readyToVoteCount++;
        
        console.log(`${this.players.get(playerId).name} is ready to vote. Count: ${this.gameState.readyToVoteCount}/${this.players.size - 1}`);

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
        if (voterId === targetId) {
            console.log(`Player ${this.players.get(voterId).name} tried to vote for themselves - ignored`);
            return;
        }
        
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        const voterPlayer = this.players.get(voterId);
        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerVotes.push({
            voter: voterPlayer.name,
            votedFor: targetPlayer?.name || 'Unknown',
            wasCorrect: targetId === this.gameState.imposter,
            voterWasImposter: voterId === this.gameState.imposter,
            reasoning: reasoning || null
        });
        
        const voterStats = this.scoreboard.get(voterId);
        voterStats.totalVotes++;
        if (targetId === this.gameState.imposter) {
            voterStats.correctVotes++;
        }
        
        if (this.gameState.votes.size === this.players.size) {
            console.log('All votes received, processing results');
            this.processVotingResults();
        }
    }

    // NEW: Handle bot voting
    handleBotVote(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return;
        
        const isImposter = botId === this.gameState.imposter;
        const availablePlayers = this.playerOrder.filter(id => id !== botId);
        
        const targetId = bot.chooseVoteTarget(
            availablePlayers.map(id => ({ id, isBot: this.players.get(id).isBot })),
            isImposter,
            bot.suspicion
        );
        
        if (targetId) {
            this.submitVote(botId, targetId, 'Bot reasoning');
        }
    }

    processVotingResults() {
        const voteCounts = new Map();
        
        this.gameState.votes.forEach((targetId) => {
            const count = voteCounts.get(targetId) || 0;
            voteCounts.set(targetId, count + 1);
        });

        console.log('Vote counts:', Array.from(voteCounts.entries()).map(([id, count]) => 
            `${this.players.get(id)?.name || 'Unknown'}: ${count}`
        ));

        let maxVotes = 0;
        let mostVoted = null;
        voteCounts.forEach((count, playerId) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = playerId;
            }
        });

        const requiredVotes = this.players.size - 1;
        console.log(`Required votes: ${requiredVotes}, Max votes: ${maxVotes}`);
        
        if (maxVotes >= requiredVotes && mostVoted) {
            const wasImposter = mostVoted === this.gameState.imposter;
            console.log(`${this.players.get(mostVoted).name} got enough votes. Was imposter: ${wasImposter}`);
            
            if (wasImposter) {
                this.endGame('location_wins', `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
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

        this.currentGameData.outcome = winner;
        this.updateScoreboardAfterGame(winner);
        this.saveGameToHistory();
        this.saveGameData();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }

    saveGameData() {
        if (this.currentGameData.playerQAs.length === 0) {
            console.log('No game data to save');
            return;
        }
    
        allGameData.push(JSON.parse(JSON.stringify(this.currentGameData)));
    
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
        
        try {
            fs.appendFileSync('gamelogs.txt', gameLog, 'utf8');
            console.log('✅ Also saved to local file');
        } catch (error) {
            console.log('ℹ️ File save failed (expected on Render):', error.message);
        }
    }

    updateScoreboardAfterGame(winner) {
        console.log(`Updating scoreboard for winner: ${winner}`);
        
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            const isImposter = socketId === this.gameState.imposter;
            
            let didWin = false;
            
            if (winner === 'imposter_wins') {
                if (isImposter) {
                    didWin = true;
                    stats.timesImposterWon++;
                    console.log(`${player.name} (imposter) gets win point`);
                }
            } else if (winner === 'location_wins') {
                if (!isImposter) {
                    didWin = true;
                    console.log(`${player.name} (location team) gets win point`);
                }
            }
            
            if (didWin) {
                stats.gamesWon++;
            }
            
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
                wasImposter: id === this.gameState.imposter,
                isBot: player.isBot
            })),
            finalScores: Array.from(this.scoreboard.entries()).map(([id, stats]) => ({
                name: stats.name,
                score: stats.score
            }))
        };
        
        this.gameHistory.push(gameRecord);
        console.log(`Game saved to history: Game #${gameRecord.gameNumber}`);
    }

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
                isOnline: this.players.has(socketId),
                isBot: this.players.get(socketId)?.isBot || false
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
                isYou: id === socketId,
                isBot: this.players.get(id).isBot
            })),
            imposter: this.gameState.status === 'ended' ? this.gameState.imposter : null,
            scoreboard: this.getScoreboardData(),
            readyToVoteCount: this.gameState.readyToVoteCount,
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers),
            gameStats: this.getGameStats(),
            isLocked: this.isLocked,
            botCount: this.bots.size,
            usingCustomLocations: this.customLocations.length > 0
        };
    }
}

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
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
    });

    socket.on('join_room', ({ roomCode, playerName }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
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

        const actualName = room.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        socket.emit('room_joined', { 
            roomCode, 
            isHost: false, 
            actualName,
            nameChanged: actualName !== playerName
        });
        
        io.to(roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
        
        if (actualName !== playerName) {
            socket.emit('name_changed', { 
                originalName: playerName, 
                newName: actualName 
            });
        }
    });

    // NEW: Add bot
    socket.on('add_bot', ({ difficulty = 'medium' }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can add bots');
            return;
        }

        const result = room.addBot(difficulty);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('bot_added', {
            botName: result.botName,
            botCount: room.bots.size
        });

        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
    });

    // NEW: Remove bot
    socket.on('remove_bot', ({ botId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can remove bots');
            return;
        }

        const result = room.removeBot(botId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('bot_removed', {
            botName: result.botName,
            botCount: room.bots.size
        });

        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
    });

    socket.on('toggle_lock', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can lock/unlock the room');
            return;
        }

        room.setLocked(!room.isLocked);
        
        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
        
        io.to(room.roomCode).emit('room_lock_changed', { 
            isLocked: room.isLocked,
            message: room.isLocked ? 'Room locked - no new players can join' : 'Room unlocked - new players can join'
        });
    });

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

        // If it was a human player, notify them
        if (!result.wasBot) {
            io.to(targetId).emit('kicked', { 
                message: 'You have been kicked from the room by the host',
                roomCode: room.roomCode
            });

            const kickedSocket = io.sockets.sockets.get(targetId);
            if (kickedSocket) {
                kickedSocket.leave(room.roomCode);
            }
        }

        io.to(room.roomCode).emit('player_kicked', {
            kickedPlayerName: result.kickedPlayerName,
            wasBot: result.wasBot,
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            isLocked: room.isLocked,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0
        });
    });

    socket.on('toggle_ready', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player && !player.isBot) { // Only human players can toggle ready
            player.isReady = !player.isReady;

            io.to(room.roomCode).emit('room_updated', { 
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id, 
                    name: player.name, 
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                isLocked: room.isLocked,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0
            });
        }
    });

    socket.on('start_game', (data) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) return;

        // Handle custom locations - this will remove bots if custom locations are set
        if (data && data.customLocations && Array.isArray(data.customLocations)) {
            const removedBots = room.setCustomLocations(data.customLocations);
            if (removedBots.length > 0) {
                io.to(room.roomCode).emit('bots_removed_custom_locations', {
                    removedBots,
                    message: 'Bots removed due to custom locations'
                });
            }
        }

        // Check if all human players are ready
        const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot);
        const allHumansReady = humanPlayers.every(player => 
            player.isHost || player.isReady
        );

        if (!allHumansReady) {
            socket.emit('error', 'Not all human players are ready');
            return;
        }

        if (room.startGame()) {
            room.players.forEach((player, socketId) => {
                if (!player.isBot) {
                    io.to(socketId).emit('game_started', room.getGameStateForPlayer(socketId));
                }
            });

            // Start the first turn
            setTimeout(() => {
                handleBotTurn(room);
            }, 1000);
        } else {
            socket.emit('error', 'Need at least 3 players to start');
        }
    });

    socket.on('ask_question', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleAskQuestion(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('question_asked', result);

        // If target is bot, generate automatic response
        const targetPlayer = room.players.get(targetId);
        if (targetPlayer && targetPlayer.isBot) {
            setTimeout(() => {
                const answer = room.generateBotAnswer(targetId, result.question);
                
                room.processAnswer(socket.id, targetId, result.question, answer);

                io.to(room.roomCode).emit('answer_submitted', {
                    asker: result.asker,
                    target: result.target,
                    question: result.question,
                    answer
                });

                room.players.forEach((player, socketId) => {
                    if (!player.isBot) {
                        io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                    }
                });

                // Continue to next turn
                setTimeout(() => {
                    handleBotTurn(room);
                }, 1000);
            }, 1500); // Bot response delay
        }
    });

    socket.on('submit_answer', ({ asker, target, question, answer }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        let askerId = null;
        if (room.gameState.currentQuestion && room.gameState.currentQuestion.targetId === socket.id) {
            askerId = room.gameState.currentQuestion.askerId;
        } else {
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

        room.processAnswer(askerId, socket.id, question, answer);

        io.to(room.roomCode).emit('answer_submitted', {
            asker: room.players.get(askerId).name,
            target: room.players.get(socket.id).name,
            question,
            answer
        });

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });

        // Continue to next turn
        setTimeout(() => {
            handleBotTurn(room);
        }, 1000);
    });

    socket.on('ready_to_vote', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        room.readyToVote(socket.id);

        io.to(room.roomCode).emit('ready_count_updated', {
            readyCount: room.gameState.readyToVoteCount,
            requiredCount: room.players.size - 1
        });

        if (room.gameState.status === 'voting') {
            room.players.forEach((player, socketId) => {
                if (!player.isBot) {
                    io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                }
            });

            // Handle bot voting
            setTimeout(() => {
                for (const [botId, bot] of room.bots.entries()) {
                    if (!room.gameState.votes.has(botId)) {
                        room.handleBotVote(botId);
                    }
                }
            }, 2000);
        }
    });

    socket.on('submit_vote', ({ targetId, reasoning }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'voting') return;

        room.submitVote(socket.id, targetId, reasoning);

        const voterName = room.players.get(socket.id).name;
        const targetName = room.players.get(targetId)?.name || 'Unknown';
        
        io.to(room.roomCode).emit('vote_submitted', {
            voter: voterName,
            target: targetName,
            votesReceived: room.gameState.votes.size,
            totalPlayers: room.players.size
        });

        if (room.gameState.votes.size === room.players.size) {
            io.to(room.roomCode).emit('all_votes_received');
            
            setTimeout(() => {
                console.log(`Processing voting results for room ${room.roomCode}`);
                
                room.processVotingResults();
                
                console.log(`After processing votes: status=${room.gameState.status}`);
                
                room.players.forEach((player, socketId) => {
                    if (!player.isBot) {
                        const gameStateForPlayer = room.getGameStateForPlayer(socketId);
                        console.log(`Sending game update to ${player.name}: status=${gameStateForPlayer.status}, round=${gameStateForPlayer.currentRound}`);
                        io.to(socketId).emit('game_updated', gameStateForPlayer);
                    }
                });
                
                if (room.gameState.status === 'ended') {
                    console.log('Game ended, sending game_over event');
                    io.to(room.roomCode).emit('game_over', room.gameState.gameResult);
                }
            }, 2000);
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

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
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
                        isReady: player.isReady,
                        isBot: player.isBot
                    })),
                    scoreboard: room.getScoreboardData(),
                    isLocked: room.isLocked,
                    botCount: room.bots.size,
                    usingCustomLocations: room.customLocations.length > 0
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

// NEW: Handle bot turns and auto-actions
function handleBotTurn(room) {
    if (room.gameState.status !== 'playing') return;
    
    const currentPlayer = room.getCurrentPlayer();
    const player = room.players.get(currentPlayer);
    
    if (!player || !player.isBot) return; // Not a bot's turn
    
    console.log(`Bot turn: ${player.name}`);
    
    // Check if we're in voting phase
    if (room.gameState.questionsThisRound >= room.gameState.questionsPerRound) {
        // Bot should be ready to vote
        if (!room.gameState.readyToVotePlayers.has(currentPlayer)) {
            setTimeout(() => {
                room.readyToVote(currentPlayer);
                
                // Notify all players
                room.players.forEach((p, socketId) => {
                    if (!p.isBot) {
                        io.to(socketId).emit('ready_count_updated', {
                            readyCount: room.gameState.readyToVoteCount,
                            requiredCount: room.players.size - 1
                        });
                    }
                });
                
                // If voting starts, handle bot voting
                if (room.gameState.status === 'voting') {
                    room.players.forEach((p, socketId) => {
                        if (!p.isBot) {
                            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                        }
                    });
                    
                    setTimeout(() => {
                        for (const [botId, bot] of room.bots.entries()) {
                            if (!room.gameState.votes.has(botId)) {
                                room.handleBotVote(botId);
                            }
                        }
                    }, 2000);
                }
            }, 1500); // Bot thinking time
        }
        return;
    }
    
    // Bot's turn to ask a question
    if (!room.gameState.questionAskedThisTurn && !room.gameState.waitingForAnswer) {
        setTimeout(() => {
            const result = room.handleBotAskQuestion(currentPlayer);
            
            if (result && result.success) {
                // Notify all human players
                room.players.forEach((p, socketId) => {
                    if (!p.isBot) {
                        io.to(socketId).emit('question_asked', result);
                    }
                });
                
                // If target is also a bot, handle bot-to-bot interaction
                const targetPlayer = room.players.get(result.targetId);
                if (targetPlayer && targetPlayer.isBot) {
                    setTimeout(() => {
                        const answer = room.generateBotAnswer(result.targetId, result.question);
                        
                        room.processAnswer(result.askerId, result.targetId, result.question, answer);
                        
                        // Notify all human players
                        room.players.forEach((p, socketId) => {
                            if (!p.isBot) {
                                io.to(socketId).emit('answer_submitted', {
                                    asker: result.asker,
                                    target: result.target,
                                    question: result.question,
                                    answer
                                });
                                
                                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                            }
                        });
                        
                        // Continue to next turn
                        setTimeout(() => {
                            handleBotTurn(room);
                        }, 1000);
                    }, 1500); // Bot response time
                }
                // If target is human, we wait for their response
            } else {
                console.log('Bot failed to ask question, skipping turn');
                // Skip this bot's turn
                room.gameState.questionsThisRound++;
                room.gameState.currentTurn = (room.gameState.currentTurn + 1) % room.playerOrder.length;
                
                setTimeout(() => {
                    handleBotTurn(room);
                }, 500);
            }
        }, 2000); // Bot thinking time
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Game logging enabled - all game data will be saved to gamelogs.txt');
    console.log('Bot support enabled - bots can be added to games with default locations only');
});