const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced lobby endpoint to get public lobbies
app.get('/api/public-lobbies', (req, res) => {
    const gameType = req.query.gameType; // Get game type from query parameter
    const publicLobbies = [];
    
    for (const [roomCode, room] of gameRooms.entries()) {
        if (room.roomType === 'public' && room.gameState.status === 'waiting') {
            // Filter by game type if specified
            if (gameType && room.gameType !== gameType) {
                continue;
            }
            
            publicLobbies.push({
                roomCode: room.roomCode,
                gameType: room.gameType,
                playerCount: room.players.size,
                maxPlayers: 8,
                hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                usingCustomLocations: room.customLocations.length > 0,
                botCount: room.bots.size,
                createdAt: room.createdAt
            });
        }
    }
    
    // Sort by creation time (newest first) and limit to 10
    publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(publicLobbies.slice(0, 10));
});

app.get('/download-all-games', (req, res) => {
    if (allGameData.length === 0) {
        res.status(404).send('No game data available yet');
        return;
    }

    let output = '';
    allGameData.forEach(gameData => {
        output += '============================================================\n';
        output += `GAME ${gameData.gameNumber}\n`;
        output += `Game Type: ${gameData.gameType}\n`;
        output += `Timestamp: ${gameData.timestamp}\n`;
        output += `Room: ${gameData.roomCode}\n`;
        output += `${gameData.gameType === 'mole' ? 'Location' : gameData.gameType === 'nba' ? 'NBA Player' : 'Rapper'}: ${gameData.location}\n`;
        output += `Imposter: ${gameData.imposter}\n`;
        output += `Outcome: ${gameData.outcome}\n`;
        output += '\n';
        
        if (gameData.gameType === 'mole') {
            output += 'QUESTIONS AND ANSWERS:\n';
            gameData.playerQAs.forEach(qa => {
                output += `${qa.asker} asks ${qa.target}: "${qa.question}"\n`;
                output += `${qa.target} (${qa.targetRole}): "${qa.answer}"\n`;
                output += '\n';
            });
        } else {
            output += 'HINTS:\n';
            gameData.playerHints.forEach(hint => {
                output += `${hint.player} (${hint.playerRole}): "${hint.hint}"\n`;
                output += '\n';
            });
        }
        
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
    const filename = `game-collection-all-games-${timestamp}.txt`;
    
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

// NEW: Player lists for new game types
const nbaPlayers = ["Lebron James", "Kawhi Leonard", "Steph Curry", "Klay Thompson", "Damian Lillard", "Giannis Antetokounmpo", 
    "Chris Paul", "Zion Williamson", "Ja Morant", "Scottie Barnes", "Chet Holmgren", "Paolo Banchero", 
    "Franz Wagner", "Gradey Dick", "Kyle Lowry", "DeMar DeRozan", "CJ McCollum", "Anthony Davis", 
    "Fred VanVleet", "Miles Bridges", "James Harden", "Russell Westbrook", "Joel Embiid", "Tyrese Maxey", 
    "Mikal Bridges", "Jalen Brunson", "Julius Randle", "OG Anunoby", "Mitchell Robinson", "Kelly Oubre Jr.", 
    "Donte DiVincenzo", "Josh Hart", "Immanuel Quickley", "RJ Barrett", "Jakob Poeltl", "Cam Thomas", 
    "Ben Simmons", "Nic Claxton", "Spencer Dinwiddie", "Jayson Tatum", "Jaylen Brown", "Derrick White", 
    "Jrue Holiday", "Kristaps Porzingis", "Al Horford", "Gary Trent Jr.", "Brook Lopez", "Khris Middleton", 
    "Bobby Portis", "Tyrese Haliburton", "Pascal Siakam", "Myles Turner", "Bennedict Mathurin", "Obi Toppin", 
    "Darius Garland", "Donovan Mitchell", "Evan Mobley", "Jarrett Allen", "DeMar DeRozan", "Zach LaVine", 
    "Nikola Vucevic", "Josh Giddey", "Cade Cunningham", "Jaden Ivey", "Ausar Thompson", "Jalen Duren", 
    "Tobias Harris", "Jimmy Butler", "Bam Adebayo", "Terry Rozier", "Tyler Herro", "Duncan Robinson", 
    "Trae Young", "Clint Capela", "Zaccharie Risacher", "LaMelo Ball", "Miles Bridges", "Brandon Miller", 
    "Grant Williams", "Seth Curry", "Kyle Kuzma", "Jordan Poole", "Alex Sarr", "Shai Gilgeous-Alexander", 
    "Jalen Williams", "Lu Dort", "Alex Caruso", "Nikola Jokic", "Jamal Murray", "Michael Porter Jr.", 
    "Aaron Gordon", "Bruce Brown", "Anthony Edwards", "Mike Conley", "Rudy Gobert", "Karl-Anthony Towns", 
    "Jaden McDaniels", "Naz Reid", "Norman Powell", "Luka Doncic", "Kyrie Irving", "Daniel Gafford", 
    "Kevin Durant", "Devin Booker", "Bradley Beal", "Jusuf Nurkic", "Brandon Ingram", "Dejounte Murray", 
    "Herbert Jones", "D'Angelo Russell", "Austin Reaves", "De'Aaron Fox", "Domantas Sabonis", 
    "Malik Monk", "Buddy Hield", "Andrew Wiggins", "Draymond Green", "Jonathan Kuminga", 
    "Alperen Sengun", "Jalen Green", "Amen Thompson", "Dillon Brooks", "Collin Sexton", "Isaiah Stewart", 
    "Lauri Markkanen", "Walker Kessler", "Jordan Clarkson", "Jaren Jackson Jr.", "Desmond Bane", 
    "Marcus Smart", "Zach Edey", "Victor Wembanyama", "Keldon Johnson", "Devin Vassell", "Jeremy Sochan", 
    "Anfernee Simons", "Scoot Henderson", "Deandre Ayton", "Jerami Grant", "Shaedon Sharpe", 
    "Deni Avdija", "Cooper Flagg"];

const rappers = ["Drake", "Future", "21 Savage", "Travis Scott", "Kanye", "XXXTentacion", "Nav", "Roddy Ricch", "A Boogie wit da Hoodie", 
    "Post Malone", "Lil Baby", "Lil Wayne", "Baby Keem", "Kendrick Lamar", "Lil Tecca", "Don Toliver", "Chris Brown", 
    "Coi Leray", "Nicki Minaj", "Cardi B", "DaBaby", "J. Cole", "Eminem", "Gunna", "Quavo", "Jay-Z", "Juice WRLD", "Big Black Banana Man", 
    "The Weeknd", "Kid Cudi", "Kodak Black", "Lil Durk", "Lil Skies", "Lil Tjay", "Lil Uzi Vert", "Meek Mill", "Nas", "PARTYNEXTDOOR",
    "Offset", "PARTYNEXTDOOR", "Playboi Carti", "Polo G", "Pop Smoke", "Swae Lee", "Tory Lanez", "Young Thug", "Ty Dolla $ign", "Nicki Minaj"];

// The Mole question system (unchanged)
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

const questionPrompts = [
    ["Would you expect to see me here?", "yes, no, maybe, probably, probably not"],
    ["What is the last thing you said?", "pretend youre at this location, what is the last thing you wouldve said? be very vague"],
    ["Would you be scared if someone was near you?", "yes, no, a little, not really, very, not at all"],
    ["What do you see around you?", "name something broad, like animals, a lot of people, something that would make sense for multiple locations in the location list"],
    ["What do you think of the food?", "good, bad, decent, a word like that"],
    ["What's that smell?", "answer without using a word that would only be used to describe the location"],
    ["What's that noise?", ""],
    ["What is the price of admission?", "just give an approximate value in CAD (dont mention CAD)"],
    ["What time of day is it here?", "either an approximate time like 12:00PM, or something like daytime, afternoon, morning, midnight, evening"],
    ["Who else might you meet here?", "friends, family, something like that"],
    ["Would you want to take a picture here?", "yes, no, definitely, definitely not, maybe"],
    ["What kind of clothing would you wear here?", "t shirt and shorts? sweater and pants? jacket? something like that"],
    ["How long would you stay here?", "just say n hours or n days, or even half a day, something like that"],
    ["What is the weather like?", "vague weather examples, like sunny, hot..."],
    ["What did you bring with you?", "water, food, camera, something basic that you can bring to multiple other locations"],
    ["How would you describe the vibe?", "something basic, like fun, scared..."],
    ["Would you need a ticket to enter?", "yes or no"],
    ["Do you feel safe here?", "yes, no, a little, not really, very, not at all"],
    ["What language do people speak here?", "usually say english, or a bunch of different languages"],
    ["What type of transportation would you use to get here?", "car, bus, walk, plane, boat, anything like that, but usually car"],
    ["What celebrity would you expect to meet here?", "Name a celebrity that you would expect to be here."],
    ["What is everyone wearing?", "base it off the expected weather at the location. t shirt and shorts? sweater and pants? jacket? something like that. if youre at the beach, instead of saying swimming suit, say something like 'something light'"],
    ["What is this place's motto?", "make up a motto without using words that give away the location"],
    ["Would you take a date here?", "yes, no, maybe, i can, probably not"],
    ["What is the floor made out of?", "name a basic floor material, like wood, concrete, ground..."],
    ["If you were an actor, who would you be?", "name an actor who you would expect to be here. if its dingy drug deal motel, name someone who has used drugs. if haunted mansion, name someone who has explored haunted houses in a movie... just give the name of the actor, nothing else"],
    ["Where's a good place to smoke around here?", "nowhere, anywhere, everywhere, outside"],
    ["What do you think would happen if I touched this button?", "name something very basic"],
    ["How stressed are people around here?", "very, a little, not at all, kinda. small answers like that"],
    ["If Taylor Swift were here, what would she be doing?", "performing, exploring, having fun, travelling"],
    ["Is your family here?", "yes, no, maybe, probably, probably not"],
    ["Do you find the people here attractive?", "yes, no, a little, not really, very, not at all"],
    ["What animal is that?", "usually dog, maybe fish, wolf, leopard. something that can be said for multiple locations in the location list"],
    ["What's in that corner?", "something that can be in a lot of corners"],
    ["Why are they whispering?", "something very basic that makes sense for this location, just say why they're whispering, dont justify"],
    ["How's your phone reception?", "great, good, decent, not good, no reception"],
    ["What's the seating situation like around here?", "organized, very organized, all over the place, no seating"],
    ["Are any crimes being committed here?", "yes, no, maybe, probably, probably not"]
]; 

const questionPromptsMap = new Map(questionPrompts);

// Store game rooms
const gameRooms = new Map();

// Store all completed game data for download
const allGameData = [];

// Enhanced Bot AI logic with strategic imposter behavior
class BotAI {
    constructor(botId, difficulty = 'medium') {
        this.botId = botId;
        this.difficulty = difficulty;
        this.suspicion = new Map(); 
        this.observedAnswers = [];
        this.locationHints = [];
        this.possibleLocations = new Set(defaultLocations); // Track possible locations as imposter
        this.playerAnswerHistory = new Map(); // Track each player's answers for consistency checking
    }

    generateResponse(question, location, isImposter, observedAnswers = [], prompt = "") {
        console.log(`🤖 Bot ${this.botId} generating response. Imposter: ${isImposter}, Question: ${question}`);
        
        if (isImposter) {
            return this.generateStrategicImposterResponse(question, observedAnswers, prompt);
        } else {
            return this.generateLocationBasedResponse(question, location, prompt);
        }
    }

    generateStrategicImposterResponse(question, observedAnswers, prompt) {
        console.log(`🕵️ Imposter bot analyzing ${observedAnswers.length} observed answers`);
        
        // Analyze other players' answers to narrow down possible locations
        this.analyzeObservedAnswers(observedAnswers, question);
        
        // Get our best guess of the location based on analysis
        const bestGuessLocation = this.getBestLocationGuess();
        console.log(`🎯 Imposter's best guess: ${bestGuessLocation}`);
        
        if (bestGuessLocation && prompt) {
            // Generate answer as if we're at the guessed location, but make it slightly vague
            return this.generateLocationBasedResponse(question, bestGuessLocation, prompt, true);
        }
        
        // Fallback to prompt-based response
        return this.generatePromptBasedResponse(question, null, true, prompt, observedAnswers);
    }

    analyzeObservedAnswers(observedAnswers, currentQuestion) {
        const newPossibleLocations = new Set();
        
        for (const location of this.possibleLocations) {
            let locationScore = 0;
            let totalQuestions = 0;
            
            // Check if this location could produce the observed answers
            for (const answerData of observedAnswers) {
                totalQuestions++;
                const compatibilityScore = this.getLocationCompatibilityScore(answerData.answer, answerData.question, location);
                locationScore += compatibilityScore;
                
                // Track player answer patterns for consistency checking
                if (!this.playerAnswerHistory.has(answerData.target)) {
                    this.playerAnswerHistory.set(answerData.target, []);
                }
                this.playerAnswerHistory.get(answerData.target).push({
                    question: answerData.question,
                    answer: answerData.answer,
                    compatibilityScore
                });
            }
            
            // Use more sophisticated scoring - require 70% compatibility for strong locations
            const averageScore = totalQuestions > 0 ? locationScore / totalQuestions : 1;
            if (observedAnswers.length === 0 || averageScore >= 0.7) {
                newPossibleLocations.add(location);
            }
        }
        
        if (newPossibleLocations.size > 0) {
            this.possibleLocations = newPossibleLocations;
        }
        
        console.log(`🔍 Narrowed down to ${this.possibleLocations.size} possible locations:`, Array.from(this.possibleLocations).slice(0, 3));
    }

    getLocationCompatibilityScore(answer, question, location) {
        const answerLower = answer.toLowerCase();
        const questionLower = question.toLowerCase();
        const locationLower = location.toLowerCase();
        
        // Return score between 0 (incompatible) and 1 (highly compatible)
        
        // Weather compatibility
        if (questionLower.includes('weather')) {
            if (locationLower.includes('beach') || locationLower.includes('amusement')) {
                if (answerLower.includes('sunny') || answerLower.includes('hot') || answerLower.includes('nice')) return 1.0;
                if (answerLower.includes('cold') || answerLower.includes('freezing')) return 0.1;
            }
            if (locationLower.includes('submarine') || locationLower.includes('space')) {
                if (answerLower.includes('controlled') || answerLower.includes('artificial')) return 1.0;
                if (answerLower.includes('sunny') || answerLower.includes('windy')) return 0.2;
            }
            if (locationLower.includes('burning') || locationLower.includes('volcano')) {
                if (answerLower.includes('hot') || answerLower.includes('terrible')) return 1.0;
                if (answerLower.includes('cold') || answerLower.includes('nice')) return 0.1;
            }
        }
        
        // Transportation compatibility
        if (questionLower.includes('transportation')) {
            if (locationLower.includes('space') && answerLower.includes('rocket')) return 1.0;
            if (locationLower.includes('submarine') && answerLower.includes('boat')) return 1.0;
            if (locationLower.includes('airport') && answerLower.includes('plane')) return 1.0;
            if (locationLower.includes('amusement') && answerLower.includes('car')) return 0.9;
            if (locationLower.includes('space') && answerLower.includes('car')) return 0.1;
        }
        
        // Safety compatibility
        if (questionLower.includes('safe')) {
            if ((locationLower.includes('prison') || locationLower.includes('burning') || locationLower.includes('haunted')) && answerLower.includes('no')) return 1.0;
            if ((locationLower.includes('amusement') || locationLower.includes('restaurant')) && answerLower.includes('yes')) return 1.0;
            if (locationLower.includes('prison') && answerLower.includes('yes')) return 0.1;
        }
        
        // Floor material compatibility
        if (questionLower.includes('floor')) {
            if (locationLower.includes('beach') && answerLower.includes('sand')) return 1.0;
            if (locationLower.includes('forest') && answerLower.includes('ground')) return 1.0;
            if (locationLower.includes('prison') && answerLower.includes('concrete')) return 1.0;
            if (locationLower.includes('mansion') && answerLower.includes('wood')) return 1.0;
            if (locationLower.includes('beach') && answerLower.includes('concrete')) return 0.2;
        }
        
        // Food compatibility
        if (questionLower.includes('food')) {
            if ((locationLower.includes('space') || locationLower.includes('submarine')) && answerLower.includes('no food')) return 1.0;
            if (locationLower.includes('restaurant') && answerLower.includes('good')) return 1.0;
            if ((locationLower.includes('burning') || locationLower.includes('prison')) && answerLower.includes('terrible')) return 1.0;
        }
        
        // Phone reception compatibility
        if (questionLower.includes('phone') || questionLower.includes('reception')) {
            if ((locationLower.includes('space') || locationLower.includes('submarine')) && answerLower.includes('no reception')) return 1.0;
            if (locationLower.includes('amusement') && answerLower.includes('good')) return 0.9;
            if (locationLower.includes('space') && answerLower.includes('great')) return 0.1;
        }
        
        // Default: neutral compatibility for general answers
        return 0.5;
    }

    isAnswerCompatibleWithLocation(answer, question, location) {
        return this.getLocationCompatibilityScore(answer, question, location) >= 0.5;
    }

    getBestLocationGuess() {
        if (this.possibleLocations.size === 0) return null;
        
        // If only one location left, use it
        if (this.possibleLocations.size === 1) {
            return Array.from(this.possibleLocations)[0];
        }
        
        // Score locations based on how well they match observed answers
        const locationScores = new Map();
        
        for (const location of this.possibleLocations) {
            let totalScore = 0;
            let answerCount = 0;
            
            // Check all player answer histories
            for (const [player, answers] of this.playerAnswerHistory.entries()) {
                for (const answerData of answers) {
                    const score = this.getLocationCompatibilityScore(
                        answerData.answer, 
                        answerData.question, 
                        location
                    );
                    totalScore += score;
                    answerCount++;
                }
            }
            
            const averageScore = answerCount > 0 ? totalScore / answerCount : 0.5;
            locationScores.set(location, averageScore);
        }
        
        // Return the highest scoring location
        let bestLocation = null;
        let bestScore = 0;
        
        for (const [location, score] of locationScores.entries()) {
            if (score > bestScore) {
                bestScore = score;
                bestLocation = location;
            }
        }
        
        return bestLocation || Array.from(this.possibleLocations)[0];
    }

    generateLocationBasedResponse(question, location, prompt, isImposterGuessing = false) {
        const questionLower = question.toLowerCase();
        const locationLower = location.toLowerCase();
        
        if (!prompt) {
            return this.randomChoice(['good', 'nice', 'okay', 'decent']);
        }
        
        // Use the prompt to generate appropriate responses
        const response = this.generatePromptBasedResponse(question, location, isImposterGuessing, prompt);
        
        // If imposter, make response slightly more vague/general
        if (isImposterGuessing) {
            return this.makeResponseVague(response, prompt);
        }
        
        return response;
    }

    makeResponseVague(response, prompt) {
        const promptLower = prompt.toLowerCase();
        
        // For yes/no questions, occasionally make slightly less definitive (but not "maybe")
        if (promptLower.includes('yes, no') && Math.random() < 0.2) {
            if (response === 'yes') {
                return this.randomChoice(['probably', 'yes']);
            }
            if (response === 'no') {
                return this.randomChoice(['probably not', 'no']);
            }
        }
        
        // For degree questions, make slightly less extreme
        if (promptLower.includes('very, a little') && Math.random() < 0.25) {
            if (response === 'very') {
                return 'quite a bit';
            }
            if (response === 'not at all') {
                return 'not really';
            }
        }
        
        return response;
    }

    generatePromptBasedResponse(question, location, isImposter, prompt, observedAnswers = []) {
        const questionLower = question.toLowerCase();
        const promptLower = prompt.toLowerCase();
        const locationLower = location ? location.toLowerCase() : '';
        
        // If imposter, analyze observed answers to pick strategic responses
        if (isImposter && observedAnswers.length > 0) {
            const commonAnswers = this.findCommonAnswerPatterns(observedAnswers, prompt);
            if (commonAnswers.length > 0) {
                // Pick an answer that fits the pattern but isn't too specific
                return this.randomChoice(commonAnswers);
            }
        }
        
        // Follow the specific prompts more accurately
        if (promptLower.includes('yes, no, a little, not really, very, not at all')) {
            if (!isImposter && location) {
                // "Do you feel safe here?" question
                if (questionLower.includes('safe')) {
                    if (locationLower.includes('prison') || locationLower.includes('burning') || locationLower.includes('haunted') || locationLower.includes('crashing')) return 'not at all';
                    if (locationLower.includes('amusement') || locationLower.includes('restaurant') || locationLower.includes('daycare')) return 'very';
                    if (locationLower.includes('circus')) return 'a little';
                }
                // "Do you find the people here attractive?" question
                if (questionLower.includes('attractive')) {
                    if (locationLower.includes('daycare') || locationLower.includes('orphanage')) return 'not at all'; // Inappropriate to call children attractive
                    if (locationLower.includes('prison') || locationLower.includes('morgue')) return 'no';
                    if (locationLower.includes('amusement') || locationLower.includes('beach')) return 'a little';
                    if (locationLower.includes('restaurant')) return 'maybe some';
                    if (locationLower.includes('crashing')) return 'no'; // Not thinking about attractiveness in a crash
                }
                // "How stressed are people around here?" question
                if (questionLower.includes('stressed')) {
                    if (locationLower.includes('prison') || locationLower.includes('burning') || locationLower.includes('crashing')) return 'very';
                    if (locationLower.includes('amusement') || locationLower.includes('beach')) return 'not at all';
                    if (locationLower.includes('daycare')) return 'a little';
                }
            }
            return this.randomChoice(['yes', 'no', 'a little', 'not really', 'very', 'not at all']);
        }
        
        if (promptLower.includes('yes, no, maybe, probably')) {
            if (!isImposter && location) {
                // Give specific answers based on location for non-imposters
                if (questionLower.includes('date')) {
                    if (locationLower.includes('restaurant') || locationLower.includes('amusement')) return 'yes';
                    if (locationLower.includes('prison') || locationLower.includes('morgue') || locationLower.includes('daycare') || locationLower.includes('orphanage')) return 'definitely not';
                    if (locationLower.includes('burning') || locationLower.includes('haunted')) return 'no';
                    if (locationLower.includes('beach')) return 'maybe';
                }
                if (questionLower.includes('family')) {
                    if (locationLower.includes('amusement') || locationLower.includes('restaurant') || locationLower.includes('daycare')) return 'maybe';
                    if (locationLower.includes('prison') || locationLower.includes('space') || locationLower.includes('burning')) return 'probably not';
                }
                if (questionLower.includes('ticket')) {
                    if (locationLower.includes('amusement') || locationLower.includes('circus')) return 'yes';
                    if (locationLower.includes('daycare') || locationLower.includes('beach') || locationLower.includes('forest')) return 'no';
                }
            }
            // For imposters, be strategic but not too vague
            if (isImposter) {
                return this.randomChoice(['yes', 'no', 'probably', 'probably not']); // Avoid "maybe" which is too vague
            }
            return this.randomChoice(['yes', 'no', 'maybe', 'probably', 'probably not']);
        }
        
        if (promptLower.includes('good, bad, decent')) {
            if (!isImposter && location) {
                if (questionLower.includes('food')) {
                    if (locationLower.includes('burning') || locationLower.includes('prison') || locationLower.includes('haunted')) return 'terrible';
                    if (locationLower.includes('space') || locationLower.includes('submarine')) return 'there is no food here';
                    if (locationLower.includes('restaurant')) return 'good';
                    if (locationLower.includes('amusement') || locationLower.includes('circus')) return 'decent';
                    if (locationLower.includes('daycare')) return 'simple food'; // Children's food
                    if (locationLower.includes('beach')) return 'snacks';
                }
                // Default for other "good/bad" questions
                if (locationLower.includes('burning') || locationLower.includes('prison') || locationLower.includes('haunted')) return 'terrible';
                if (locationLower.includes('amusement') || locationLower.includes('restaurant')) return 'good';
            }
            if (isImposter) {
                // Imposters should avoid extreme answers
                return this.randomChoice(['good', 'decent', 'okay']);
            }
            return this.randomChoice(['good', 'bad', 'decent', 'terrible']);
        }
        
        if (promptLower.includes('very, a little, not at all')) {
            if (isImposter) {
                // Avoid extreme answers as imposter
                return this.randomChoice(['a little', 'kinda', 'somewhat']);
            }
            return this.randomChoice(['very', 'a little', 'not at all', 'kinda']);
        }
        
        if (promptLower.includes('great, good, decent, not good')) {
            if (!isImposter && location) {
                if (locationLower.includes('space') || locationLower.includes('submarine')) return 'no reception';
                if (locationLower.includes('amusement') || locationLower.includes('mall')) return 'good';
                if (locationLower.includes('crashing')) return 'no reception';
            }
            return this.randomChoice(['great', 'good', 'decent', 'not good', 'no reception']);
        }
        
        if (promptLower.includes('car, bus, walk')) {
            if (!isImposter && location) {
                if (locationLower.includes('space')) return 'rocket';
                if (locationLower.includes('submarine')) return 'boat';
                if (locationLower.includes('airport')) return 'plane';
            }
            return this.randomChoice(['car', 'bus', 'walk', 'plane', 'boat']);
        }
        
        if (promptLower.includes('english') || promptLower.includes('different languages')) {
            return this.randomChoice(['english', 'a bunch of different languages', 'mostly english']);
        }
        
        if (promptLower.includes('performing, exploring, having fun')) {
            return this.randomChoice(['performing', 'exploring', 'having fun', 'travelling']);
        }
        
        if (promptLower.includes('organized') || promptLower.includes('no seating')) {
            return this.randomChoice(['organized', 'very organized', 'all over the place', 'no seating']);
        }
        
        if (promptLower.includes('nowhere, anywhere, everywhere')) {
            return this.randomChoice(['nowhere', 'anywhere', 'everywhere', 'outside']);
        }
        
        // Clothing questions - base on weather/location
        if (promptLower.includes('t shirt and shorts') || questionLower.includes('wearing') || questionLower.includes('clothing')) {
            if (!isImposter && location) {
                if (locationLower.includes('beach') || locationLower.includes('amusement')) return 'something light';
                if (locationLower.includes('space') || locationLower.includes('submarine')) return 'special suits';
                if (locationLower.includes('burning') || locationLower.includes('volcano')) return 'protective gear';
                if (locationLower.includes('prison')) return 'uniforms';
                if (locationLower.includes('haunted') || locationLower.includes('mansion')) return 'sweater and pants';
                if (locationLower.includes('crashing')) return 'normal clothes';
            }
            return this.randomChoice(['t shirt and shorts', 'sweater and pants', 'jacket', 'something light', 'warm clothes']);
        }

        // Motto questions - make up a motto
        if (promptLower.includes('make up a motto') || questionLower.includes('motto')) {
            const mottos = [
                'Welcome to fun times',
                'Where memories are made',
                'Your adventure awaits',
                'Experience something new',
                'Come as you are',
                'Making dreams come true',
                'Where stories begin',
                'Step into excitement',
                'Create your moment',
                'Discover something special'
            ];
            return this.randomChoice(mottos);
        }

        // Celebrity questions and actor questions
        if (promptLower.includes('name a celebrity')) {
            if (!isImposter && location) {
                if (locationLower.includes('haunted')) return 'Johnny Depp';
                if (locationLower.includes('prison')) return 'Robert Downey Jr';
                if (locationLower.includes('space')) return 'Sandra Bullock';
                if (locationLower.includes('amusement')) return 'Tom Hanks';
                if (locationLower.includes('daycare') || locationLower.includes('orphanage')) return 'no celebrities here';
                if (locationLower.includes('restaurant')) return 'Gordon Ramsay';
                if (locationLower.includes('circus')) return 'no one famous';
                if (locationLower.includes('beach')) return 'no one in particular';
                if (locationLower.includes('burning')) return 'firefighters maybe';
            }
            return this.randomChoice(['Tom Hanks', 'Jennifer Lawrence', 'Ryan Reynolds', 'no one famous', 'no celebrities here']);
        }

        // "If you were an actor, who would you be?" questions
        if (promptLower.includes('name an actor') || questionLower.includes('if you were an actor')) {
            if (!isImposter && location) {
                if (locationLower.includes('haunted')) return 'Johnny Depp'; // Horror movies
                if (locationLower.includes('prison')) return 'Robert Downey Jr'; // Has addiction history
                if (locationLower.includes('space')) return 'Sandra Bullock'; // Gravity
                if (locationLower.includes('amusement')) return 'Robin Williams'; // Fun characters
                if (locationLower.includes('daycare')) return 'Eddie Murphy'; // Daddy Day Care
                if (locationLower.includes('restaurant')) return 'Adam Sandler'; // Food movies
                if (locationLower.includes('circus')) return 'Hugh Jackman'; // Greatest Showman
                if (locationLower.includes('beach')) return 'Leonardo DiCaprio'; // Beach
                if (locationLower.includes('burning')) return 'Dwayne Johnson'; // Action movies
            }
            return this.randomChoice(['Tom Hanks', 'Jennifer Lawrence', 'Ryan Reynolds', 'Johnny Depp', 'Sandra Bullock']);
        }

        // "Who else might you meet here?" questions
        if (questionLower.includes('who else might you meet') || promptLower.includes('friends, family')) {
            if (!isImposter && location) {
                if (locationLower.includes('daycare') || locationLower.includes('orphanage')) return 'children';
                if (locationLower.includes('prison')) return 'inmates';
                if (locationLower.includes('amusement')) return 'families';
                if (locationLower.includes('restaurant')) return 'diners';
                if (locationLower.includes('space')) return 'astronauts';
                if (locationLower.includes('circus')) return 'performers';
            }
            return this.randomChoice(['friends', 'family', 'other people', 'strangers', 'lots of people']);
        }

        // "What do you see around you?" questions
        if (questionLower.includes('what do you see') || questionLower.includes('see around')) {
            if (!isImposter && location) {
                if (locationLower.includes('daycare')) return 'children and toys';
                if (locationLower.includes('prison')) return 'bars and cells';
                if (locationLower.includes('amusement')) return 'rides and games';
                if (locationLower.includes('restaurant')) return 'tables and food';
                if (locationLower.includes('space')) return 'stars and controls';
                if (locationLower.includes('circus')) return 'animals and performers';
                if (locationLower.includes('beach')) return 'sand and water';
                if (locationLower.includes('burning')) return 'fire and smoke';
                if (locationLower.includes('haunted')) return 'old furniture';
            }
            return this.randomChoice(['people', 'furniture', 'lots of things', 'stuff']);
        }

        // "What did you bring with you?" questions
        if (questionLower.includes('what did you bring') || questionLower.includes('bring with you')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'money and phone';
                if (locationLower.includes('beach')) return 'towel and sunscreen';
                if (locationLower.includes('restaurant')) return 'appetite';
                if (locationLower.includes('space')) return 'oxygen tank';
                if (locationLower.includes('prison')) return 'nothing';
                if (locationLower.includes('daycare')) return 'lunch box';
            }
            return this.randomChoice(['phone', 'money', 'keys', 'nothing', 'everything']);
        }

        // "Why are they whispering?" questions
        if (questionLower.includes('whispering') || questionLower.includes('whisper')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'planning something fun';
                if (locationLower.includes('prison')) return 'being secretive';
                if (locationLower.includes('haunted')) return 'afraid of ghosts';
                if (locationLower.includes('daycare')) return 'telling secrets';
            }
            return this.randomChoice(['being secretive', 'planning something', 'afraid', 'telling secrets']);
        }

        // "What is the weather like?" questions
        if (questionLower.includes('weather') || questionLower.includes('weather like')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'sunny and warm';
                if (locationLower.includes('beach')) return 'hot and sunny';
                if (locationLower.includes('space')) return 'no weather here';
                if (locationLower.includes('burning')) return 'very hot';
                if (locationLower.includes('haunted')) return 'dark and cold';
            }
            return this.randomChoice(['sunny', 'warm', 'nice', 'good', 'pleasant']);
        }

        // "What's that smell?" questions
        if (questionLower.includes('smell') || questionLower.includes('that smell')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'cotton candy and popcorn';
                if (locationLower.includes('restaurant')) return 'delicious food';
                if (locationLower.includes('beach')) return 'ocean breeze';
                if (locationLower.includes('burning')) return 'smoke';
                if (locationLower.includes('space')) return 'nothing';
                if (locationLower.includes('prison')) return 'not good';
                if (locationLower.includes('crashing')) return 'fuel';
            }
            return this.randomChoice(['food', 'fresh air', 'nothing', 'something nice']);
        }

        // "Would you expect to see me here?" questions
        if (questionLower.includes('expect to see me') || questionLower.includes('see me here')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'maybe';
                if (locationLower.includes('prison')) return 'no';
                if (locationLower.includes('space')) return 'probably not';
                if (locationLower.includes('restaurant')) return 'yes';
                if (locationLower.includes('daycare')) return 'if you work here';
            }
            return this.randomChoice(['yes', 'maybe', 'probably', 'no', 'probably not']);
        }

        // "What do you think would happen if I touched this button?" questions
        if (questionLower.includes('touched this button') || questionLower.includes('this button')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'a ride would start';
                if (locationLower.includes('space')) return 'something would activate';
                if (locationLower.includes('prison')) return 'an alarm would go off';
                if (locationLower.includes('restaurant')) return 'food would come out';
                if (locationLower.includes('burning')) return 'something would explode';
                if (locationLower.includes('crashing')) return 'an alarm would go off';
            }
            return this.randomChoice(['something would happen', 'it would activate', 'a machine would start', 'an alarm would sound']);
        }

        // "What's in that corner?" questions
        if (questionLower.includes('corner') || questionLower.includes('that corner')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'a trash can';
                if (locationLower.includes('restaurant')) return 'a table';
                if (locationLower.includes('prison')) return 'a guard';
                if (locationLower.includes('daycare')) return 'toys';
                if (locationLower.includes('beach')) return 'a towel';
            }
            return this.randomChoice(['a chair', 'a table', 'nothing', 'something']);
        }

        // "What animal is that?" questions
        if (questionLower.includes('animal') || questionLower.includes('that animal')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'a dog';
                if (locationLower.includes('circus')) return 'an elephant';
                if (locationLower.includes('beach')) return 'a seagull';
                if (locationLower.includes('space')) return 'no animals here';
                if (locationLower.includes('prison')) return 'a rat';
            }
            return this.randomChoice(['a dog', 'a cat', 'a bird', 'no animals']);
        }

        // "If Taylor Swift were here, what would she be doing?" questions
        if (questionLower.includes('taylor swift') || questionLower.includes('celebrity')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'performing a concert';
                if (locationLower.includes('restaurant')) return 'having dinner';
                if (locationLower.includes('beach')) return 'relaxing';
                if (locationLower.includes('space')) return 'singing in space';
                if (locationLower.includes('prison')) return 'visiting inmates';
            }
            return this.randomChoice(['performing', 'having fun', 'relaxing', 'working']);
        }

        // "What's the seating situation like around here?" questions
        if (questionLower.includes('seating') || questionLower.includes('seating situation')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'benches everywhere';
                if (locationLower.includes('restaurant')) return 'tables and chairs';
                if (locationLower.includes('beach')) return 'beach chairs';
                if (locationLower.includes('space')) return 'no seating';
                if (locationLower.includes('prison')) return 'hard benches';
                if (locationLower.includes('crashing')) return 'airplane seats';
            }
            return this.randomChoice(['lots of seating', 'some chairs', 'benches', 'no seating']);
        }

        // "What is the last thing you said?" questions
        if (questionLower.includes('last thing you said') || questionLower.includes('last thing')) {
            if (!isImposter && location) {
                if (locationLower.includes('crashing')) return 'oh no';
                if (locationLower.includes('burning')) return 'help';
                if (locationLower.includes('prison')) return 'i want out';
                if (locationLower.includes('amusement')) return 'this is fun';
                if (locationLower.includes('restaurant')) return 'this is delicious';
                if (locationLower.includes('space')) return 'wow';
            }
            return this.randomChoice(['hello', 'hi', 'okay', 'yes', 'no', 'wow']);
        }

        // "How would you describe the vibe?" questions
        if (questionLower.includes('vibe') || questionLower.includes('describe the vibe')) {
            if (!isImposter && location) {
                if (locationLower.includes('crashing')) return 'terrifying';
                if (locationLower.includes('burning')) return 'scary';
                if (locationLower.includes('prison')) return 'tense';
                if (locationLower.includes('amusement')) return 'fun and exciting';
                if (locationLower.includes('restaurant')) return 'relaxed';
                if (locationLower.includes('beach')) return 'peaceful';
                if (locationLower.includes('space')) return 'amazing';
            }
            return this.randomChoice(['good', 'nice', 'okay', 'fine', 'great']);
        }

        // "What time of day is it here?" questions
        if (questionLower.includes('time of day') || questionLower.includes('what time')) {
            if (!isImposter && location) {
                if (locationLower.includes('crashing')) return 'any time'; // Crashes can happen anytime
                if (locationLower.includes('space')) return 'no day or night';
                if (locationLower.includes('prison')) return 'any time';
                if (locationLower.includes('amusement')) return 'afternoon';
                if (locationLower.includes('restaurant')) return '7:00PM';
                if (locationLower.includes('haunted')) return 'midnight';
            }
            return this.randomChoice(['12:00PM', '2:00PM', 'afternoon', 'daytime', 'morning', 'evening']);
        }

        // "Would you want to take a picture here?" questions
        if (questionLower.includes('take a picture') || questionLower.includes('picture here')) {
            if (!isImposter && location) {
                if (locationLower.includes('crashing')) return 'no';
                if (locationLower.includes('burning')) return 'no';
                if (locationLower.includes('prison')) return 'no';
                if (locationLower.includes('amusement')) return 'yes';
                if (locationLower.includes('beach')) return 'yes';
                if (locationLower.includes('restaurant')) return 'maybe';
            }
            return this.randomChoice(['yes', 'no', 'maybe', 'probably']);
        }

        // "Where's a good place to smoke around here?" questions
        if (questionLower.includes('smoke') || questionLower.includes('smoking')) {
            if (!isImposter && location) {
                if (locationLower.includes('crashing')) return 'nowhere';
                if (locationLower.includes('burning')) return 'nowhere';
                if (locationLower.includes('space')) return 'nowhere';
                if (locationLower.includes('prison')) return 'nowhere';
                if (locationLower.includes('amusement')) return 'outside';
                if (locationLower.includes('restaurant')) return 'outside';
                if (locationLower.includes('beach')) return 'outside';
            }
            return this.randomChoice(['outside', 'nowhere', 'anywhere', 'designated area']);
        }

        // "How long would you stay here?" questions
        if (questionLower.includes('how long') && (questionLower.includes('stay') || questionLower.includes('hours') || questionLower.includes('days'))) {
            if (!isImposter && location) {
                if (locationLower.includes('daycare')) return '8 hours'; // Work day
                if (locationLower.includes('prison')) return 'years'; // Long sentence
                if (locationLower.includes('amusement')) return '6-8 hours';
                if (locationLower.includes('restaurant')) return '2 hours';
                if (locationLower.includes('space')) return 'months';
                if (locationLower.includes('burning')) return 'get out immediately';
                if (locationLower.includes('haunted')) return 'not long';
            }
            return this.randomChoice(['2 hours', '4 hours', 'half a day', '1 day', '3 hours']);
        }

        // Noise questions
        if (questionLower.includes('noise') || questionLower.includes('sound')) {
            if (!isImposter && location) {
                if (locationLower.includes('amusement')) return 'screaming';
                if (locationLower.includes('space')) return 'nothing';
                if (locationLower.includes('prison')) return 'yelling';
                if (locationLower.includes('circus')) return 'cheering';
                if (locationLower.includes('burning')) return 'crackling';
            }
            return this.randomChoice(['music', 'talking', 'screaming', 'nothing', 'machinery']);
        }
        
        // Floor material
        if (promptLower.includes('wood, concrete, ground')) {
            if (!isImposter && location) {
                if (locationLower.includes('beach')) return 'sand';
                if (locationLower.includes('forest')) return 'ground';
                if (locationLower.includes('prison')) return 'concrete';
                if (locationLower.includes('mansion')) return 'wood';
                if (locationLower.includes('amusement')) return 'concrete';
            }
            return this.randomChoice(['wood', 'concrete', 'ground', 'sand', 'tile']);
        }
        
        // Time-based responses
        if (promptLower.includes('12:00pm') || promptLower.includes('daytime') || questionLower.includes('time of day')) {
            if (!isImposter && location) {
                if (locationLower.includes('daycare')) return 'daytime'; // Operating hours
                if (locationLower.includes('amusement')) return 'afternoon';
                if (locationLower.includes('restaurant')) return '7:00PM'; // Dinner time
                if (locationLower.includes('haunted')) return 'midnight';
                if (locationLower.includes('prison')) return 'any time';
                if (locationLower.includes('space')) return 'no day or night';
            }
            return this.randomChoice(['12:00PM', '2:00PM', 'afternoon', 'daytime', 'morning', 'evening']);
        }
        
        // Duration responses
        if (promptLower.includes('hours') || promptLower.includes('days')) {
            return this.randomChoice(['2 hours', '4 hours', 'half a day', '1 day', '3 hours']);
        }
        
        // Fallback - avoid "not sure" answers, always give something specific
        if (questionLower.includes('motto')) {
            return 'Where dreams come true';
        }
        if (questionLower.includes('wearing') || questionLower.includes('clothing')) {
            return 't shirt and shorts';
        }
        if (questionLower.includes('who else might you meet')) {
            return 'friends';
        }
        if (questionLower.includes('noise') || questionLower.includes('sound')) {
            return 'talking';
        }
        if (questionLower.includes('corner')) {
            return 'a chair';
        }
        if (questionLower.includes('whispering')) {
            return 'being secretive';
        }
        if (questionLower.includes('animal')) {
            return 'dog';
        }
        
        return this.randomChoice(['okay', 'decent', 'fine', 'good']);
    }
    
    findCommonAnswerPatterns(observedAnswers, prompt) {
        const promptLower = prompt.toLowerCase();
        const answerCounts = new Map();
        
        // Count frequency of answers that match the prompt format
        for (const answerData of observedAnswers) {
            const answer = answerData.answer.toLowerCase();
            
            // Check if answer fits the expected prompt format
            if (this.answerMatchesPromptFormat(answer, promptLower)) {
                answerCounts.set(answer, (answerCounts.get(answer) || 0) + 1);
            }
        }
        
        // Return answers that appear multiple times (common patterns)
        const commonAnswers = [];
        for (const [answer, count] of answerCounts.entries()) {
            if (count > 1 || observedAnswers.length < 3) { // If few answers, use any that fit
                commonAnswers.push(answer);
            }
        }
        
        return commonAnswers;
    }
    
    answerMatchesPromptFormat(answer, promptLower) {
        // Check if an answer fits the expected format from the prompt
        if (promptLower.includes('yes, no, a little, not really, very, not at all')) {
            return ['yes', 'no', 'a little', 'not really', 'very', 'not at all'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('yes, no')) {
            return ['yes', 'no', 'maybe', 'probably', 'probably not'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('good, bad')) {
            return ['good', 'bad', 'decent', 'terrible', 'okay'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('very, a little')) {
            return ['very', 'a little', 'not at all', 'kinda', 'somewhat'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('car, bus')) {
            return ['car', 'bus', 'walk', 'plane', 'boat', 'rocket'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('t shirt and shorts')) {
            return ['shirt', 'shorts', 'sweater', 'pants', 'jacket', 'light', 'suits', 'gear', 'uniforms'].some(word => answer.includes(word));
        }
        
        if (promptLower.includes('friends, family')) {
            return ['friends', 'family', 'people', 'strangers'].some(word => answer.includes(word));
        }
        
        return true; // Default to true for other prompt types
    }

    chooseQuestionTarget(players, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
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

    chooseVoteTarget(players, isImposter, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
        if (isImposter) {
            return this.randomChoice(availableTargets).id;
        } else {
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
        const questionLower = question.toLowerCase();
        
        if (!isImposter) {
            // Check if answer seems evasive or generic
            if (answerLower.includes('maybe') || answerLower.includes('not sure') || answerLower.includes('probably')) {
                suspicionChange += 8;
            }
            
            // Very short answers are suspicious
            if (answer.split(' ').length <= 2 && !this.isExpectedShortAnswer(question)) {
                suspicionChange += 6;
            }
            
            // Check location compatibility - incompatible answers are very suspicious
            if (location) {
                const compatibilityScore = this.getLocationCompatibilityScore(answer, question, location);
                if (compatibilityScore < 0.3) {
                    suspicionChange += 15; // Very suspicious
                } else if (compatibilityScore < 0.5) {
                    suspicionChange += 8; // Moderately suspicious
                } else if (compatibilityScore > 0.8) {
                    suspicionChange -= 2; // Slightly less suspicious for good answers
                }
            }
            
            // Check for consistency with previous answers from this player
            const playerAnswers = this.playerAnswerHistory.get(playerId) || [];
            if (playerAnswers.length > 1) {
                const recentAnswers = playerAnswers.slice(-3); // Check last 3 answers
                let inconsistencyCount = 0;
                
                for (let i = 0; i < recentAnswers.length - 1; i++) {
                    if (this.answersAreInconsistent(recentAnswers[i], recentAnswers[recentAnswers.length - 1], location)) {
                        inconsistencyCount++;
                    }
                }
                
                if (inconsistencyCount > 0) {
                    suspicionChange += inconsistencyCount * 7;
                }
            }
            
            // Answers that are too perfect for the location are also suspicious
            if (location && this.getLocationCompatibilityScore(answer, question, location) === 1.0) {
                suspicionChange += 3; // Slightly suspicious for being too perfect
            }
        }
        
        const currentSuspicion = this.suspicion.get(playerId);
        const newSuspicion = Math.max(0, Math.min(100, currentSuspicion + suspicionChange));
        this.suspicion.set(playerId, newSuspicion);
        
        console.log(`🕵️ Suspicion update for player ${playerId}: ${currentSuspicion} -> ${newSuspicion} (change: ${suspicionChange})`);
    }
    
    isExpectedShortAnswer(question) {
        const questionLower = question.toLowerCase();
        return questionLower.includes('yes') || questionLower.includes('no') || 
               questionLower.includes('what time') || questionLower.includes('how long');
    }
    
    answersAreInconsistent(answerData1, answerData2, location) {
        // Check if two answers from the same player contradict each other for the same location
        const answer1 = answerData1.answer.toLowerCase();
        const answer2 = answerData2.answer.toLowerCase();
        
        // Basic contradiction checking
        if ((answer1.includes('yes') && answer2.includes('no')) ||
            (answer1.includes('no') && answer2.includes('yes'))) {
            return true;
        }
        
        if ((answer1.includes('safe') && answer2.includes('dangerous')) ||
            (answer1.includes('dangerous') && answer2.includes('safe'))) {
            return true;
        }
        
        if ((answer1.includes('hot') && answer2.includes('cold')) ||
            (answer1.includes('cold') && answer2.includes('hot'))) {
            return true;
        }
        
        return false;
    }

    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

class GameRoom {
    constructor(roomCode, gameType = 'mole', roomType = 'public') {
        this.roomCode = roomCode;
        this.gameType = gameType; // Track game type
        this.roomType = roomType; // NEW: Track room type (public, private, locked)
        this.createdAt = new Date(); // NEW: Track creation time for sorting
        this.players = new Map();
        this.bots = new Map();
        this.disconnectedPlayers = new Map(); // NEW: Track disconnected players
        this.gameState = {
            status: 'waiting',
            location: null,
            imposter: null,
            currentRound: 1,
            currentTurn: 0,
            questionsThisRound: 0,
            hintsThisRound: 0,
            questionsPerRound: null,
            hintsPerRound: null,
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
        this.botSuspicion = new Map();
        
        this.currentGameData = {
            gameNumber: 1,
            gameType: gameType,
            location: null,
            imposter: null,
            playerQAs: [],
            playerHints: [],
            playerVotes: [],
            outcome: null,
            timestamp: null,
            roomCode: this.roomCode
        };
    }

    generateUniqueName(requestedName) {
        const existingNames = Array.from(this.players.values()).map(p => p.name);
        
        const nameLower = requestedName.toLowerCase();
        if (nameLower.startsWith('bot') || nameLower.startsWith('b0t')) {
            requestedName = 'Player';
        }
        
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

    // NEW: Set room type instead of just locked
    setRoomType(roomType) {
        if (['public', 'private', 'locked'].includes(roomType)) {
            this.roomType = roomType;
            return true;
        }
        return false;
    }

    // NEW: Check if room is joinable
    isJoinable() {
        return this.roomType !== 'locked' && this.gameState.status === 'waiting' && this.players.size < 8;
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
            hintsGiven: 0,
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

    // Bot functions only work for The Mole
    addBot(difficulty = 'medium') {
        if (this.gameType !== 'mole') {
            return { error: 'Bots are only available for The Mole game' };
        }
        
        const totalPlayers = this.players.size;
        if (totalPlayers >= 8) {
            return { error: 'Room is full (8/8 players)' };
        }
        
        if (this.customLocations.length > 0) {
            return { error: 'Cannot add bots when using custom locations' };
        }
        
        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const botNames = [
            'Bot-1', 'Bot-2', 'Bot-3', 'Bot-4', 'Bot-5', 
            'Bot-6', 'Bot-7', 'Bot-8'
        ];
        
        const usedBotNames = Array.from(this.players.values())
            .filter(p => p.isBot)
            .map(p => p.name);
        
        const availableBotNames = botNames.filter(name => !usedBotNames.includes(name));
        const botName = availableBotNames.length > 0 ? availableBotNames[0] : `Bot-${this.players.size + 1}`;
        
        this.players.set(botId, {
            name: botName,
            isHost: false,
            isReady: true,
            isBot: true,
            role: null
        });
        
        this.bots.set(botId, new BotAI(botId, difficulty));
        
        this.scoreboard.set(botId, {
            name: botName,
            gamesPlayed: 0,
            gamesWon: 0,
            timesImposter: 0,
            timesImposterWon: 0,
            questionsAnswered: 0,
            questionsAsked: 0,
            hintsGiven: 0,
            correctVotes: 0,
            totalVotes: 0,
            roundsSurvived: 0,
            score: 0
        });
        
        return { success: true, botId, botName };
    }

    removeBot(botId) {
        const bot = this.players.get(botId);
        if (!bot || !bot.isBot) {
            return { error: 'Bot not found' };
        }
        
        this.players.delete(botId);
        this.bots.delete(botId);
        
        return { success: true, botName: bot.name };
    }

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
        
        if (player && player.isBot) {
            this.bots.delete(socketId);
        }
        
        if (socketId === this.hostId && this.players.size > 0) {
            let newHost = null;
            for (const [id, p] of this.players.entries()) {
                if (!p.isBot) {
                    newHost = id;
                    break;
                }
            }
            
            if (!newHost) {
                newHost = this.players.keys().next().value;
            }
            
            if (newHost) {
                const newHostPlayer = this.players.get(newHost);
                newHostPlayer.isHost = true;
                newHostPlayer.isReady = false; // Remove ready status when becoming host
                this.hostId = newHost;
            }
        }
        
        return player;
    }

    // NEW: Handle player disconnection during game
    handlePlayerDisconnect(socketId) {
        const player = this.players.get(socketId);
        if (!player) return null;
        
        // If game is not in progress, just remove the player
        if (this.gameState.status !== 'playing') {
            return this.removePlayer(socketId);
        }
        
        // Check if disconnecting player is the imposter
        if (socketId === this.gameState.imposter) {
            this.endGame('imposter_left', 'Imposter left the game! No one wins.');
            return player;
        }
        
        // Store disconnected player info for potential reconnection
        this.disconnectedPlayers.set(player.name, {
            socketId: socketId,
            player: player,
            disconnectTime: Date.now(),
            wasCurrentTurn: this.getCurrentPlayer() === socketId,
            turnWhenDisconnected: this.gameState.currentTurn
        });
        
        // Remove from active players but keep in scoreboard
        this.players.delete(socketId);
        
        // Store the index of the disconnected player before removing them
        const disconnectedIndex = this.playerOrder.indexOf(socketId);
        
        // Update player order to remove disconnected player
        this.playerOrder = this.playerOrder.filter(id => id !== socketId);
        
        // Adjust current turn if needed
        if (this.playerOrder.length > 0) {
            // If the disconnected player was before or at the current turn, we need to adjust
            if (disconnectedIndex <= this.gameState.currentTurn) {
                this.gameState.currentTurn = this.gameState.currentTurn % this.playerOrder.length;
            }
        }
        
        console.log(`Player ${player.name} disconnected from room ${this.roomCode}. Can reconnect within 60 seconds.`);
        
        return player;
    }

    // NEW: Handle player reconnection
    handlePlayerReconnect(socketId, playerName) {
        const disconnectedInfo = this.disconnectedPlayers.get(playerName);
        if (!disconnectedInfo) return null;
        
        const timeSinceDisconnect = Date.now() - disconnectedInfo.disconnectTime;
        if (timeSinceDisconnect > 60000) { // 60 seconds
            console.log(`Player ${playerName} reconnection attempt too late (${timeSinceDisconnect}ms)`);
            this.disconnectedPlayers.delete(playerName);
            return null;
        }
        
        // Restore player
        const player = disconnectedInfo.player;
        this.players.set(socketId, player);
        this.disconnectedPlayers.delete(playerName);
        
        // Find the position where this player should be in the turn order
        // We need to find where the old socket ID was and replace it with the new one
        const oldSocketId = disconnectedInfo.socketId;
        const oldPosition = this.playerOrder.indexOf(oldSocketId);
        
        if (oldPosition !== -1) {
            // Replace the old socket ID with the new one in the same position
            this.playerOrder[oldPosition] = socketId;
        } else {
            // If the old socket ID is not in playerOrder, add the new one at the end
            this.playerOrder.push(socketId);
        }
        
        // Update the imposter reference if this player was the imposter
        if (oldSocketId === this.gameState.imposter) {
            this.gameState.imposter = socketId;
        }
        
        // If the reconnected player was the current turn, make sure the turn is still valid
        if (disconnectedInfo.wasCurrentTurn && this.gameState.status === 'playing') {
            // Find the new position of the reconnected player
            const newPosition = this.playerOrder.indexOf(socketId);
            if (newPosition !== -1) {
                this.gameState.currentTurn = newPosition;
                console.log(`Restored turn to reconnected player ${playerName} at position ${newPosition}`);
            }
        }
        
        console.log(`Player ${playerName} reconnected to room ${this.roomCode} at position ${oldPosition !== -1 ? oldPosition : this.playerOrder.length - 1}`);
        console.log(`Current turn after reconnection: ${this.gameState.currentTurn}, playerOrder: ${this.playerOrder.join(',')}`);
        
        return player;
    }

    // NEW: Check for expired disconnections
    cleanupExpiredDisconnections() {
        const now = Date.now();
        const expiredPlayers = [];
        
        for (const [playerName, info] of this.disconnectedPlayers.entries()) {
            if (now - info.disconnectTime > 60000) {
                expiredPlayers.push(playerName);
            }
        }
        
        expiredPlayers.forEach(playerName => {
            this.disconnectedPlayers.delete(playerName);
            console.log(`Player ${playerName} reconnection window expired`);
        });
        
        return expiredPlayers;
    }

    setCustomLocations(locations) {
        const removedBots = this.removeAllBots();
        this.customLocations = locations;
        return removedBots;
    }

    getLocations() {
        if (this.gameType === 'nba') {
            return nbaPlayers;
        } else if (this.gameType === 'rapper') {
            return rappers;
        } else {
            return this.customLocations.length > 0 ? this.customLocations : defaultLocations;
        }
    }

    startGame() {
        if (this.players.size < 3) return false;
        
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder);
        
        const locations = this.getLocations();
        this.gameState.location = locations[Math.floor(Math.random() * locations.length)];
        const imposterIndex = Math.floor(Math.random() * this.playerOrder.length);
        this.gameState.imposter = this.playerOrder[imposterIndex];
        
        console.log(`${this.gameType.toUpperCase()} game started in room ${this.roomCode}:`);
        console.log(`${this.gameType === 'mole' ? 'Location' : this.gameType === 'nba' ? 'NBA Player' : 'Rapper'}: ${this.gameState.location}`);
        console.log(`Imposter: ${this.players.get(this.gameState.imposter).name}`);
        
        this.currentGameData = {
            gameNumber: this.gameHistory.length + 1,
            gameType: this.gameType,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            playerQAs: [],
            playerHints: [],
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
        this.gameState.hintsThisRound = 0;
        
        if (this.gameType === 'mole') {
            this.gameState.questionsPerRound = this.players.size;
        } else {
            this.gameState.hintsPerRound = this.players.size;
        }
        
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        this.gameState.currentQuestion = null;
        this.gameState.readyToVoteCount = 0;
        this.gameState.readyToVotePlayers.clear();
        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        
        // Initialize bot suspicion tracking (only for The Mole)
        if (this.gameType === 'mole') {
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
        }
        
        return true;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getCurrentPlayer() {
        const currentPlayer = this.playerOrder[this.gameState.currentTurn];
        console.log(`getCurrentPlayer: currentTurn=${this.gameState.currentTurn}, playerOrder=${this.playerOrder.join(',')}, result=${currentPlayer}`);
        return currentPlayer;
    }

    getNextQuestion() {
        if (this.gameState.questionQueue.length === 0) {
            this.gameState.questionQueue = [...questions];
            this.shuffleArray(this.gameState.questionQueue);
        }
        const question = this.gameState.questionQueue.shift();
        const prompt = questionPromptsMap.get(question) || "";
        return { question, prompt };
    }

    // The Mole question handling (unchanged)
    handleAskQuestion(askerId, targetId) {
        if (this.gameType !== 'mole') {
            return { error: 'Questions only available in The Mole game' };
        }
        
        if (this.getCurrentPlayer() !== askerId) {
            return { error: 'Not your turn' };
        }

        if (this.gameState.questionAskedThisTurn) {
            return { error: 'Question already asked this turn' };
        }

        if (this.gameState.waitingForAnswer) {
            return { error: 'Waiting for answer to previous question' };
        }

        const { question, prompt } = this.getNextQuestion();
        const askerName = this.players.get(askerId).name;
        const targetName = this.players.get(targetId).name;

        this.gameState.currentQuestion = {
            askerId,
            targetId,
            question,
            prompt
        };

        this.gameState.questionAskedThisTurn = true;
        this.gameState.waitingForAnswer = true;

        console.log(`Question asked in room ${this.roomCode}: ${askerName} asks ${targetName} "${question}"`);

        return {
            success: true,
            asker: askerName,
            target: targetName,
            question,
            prompt,
            askerId,
            targetId
        };
    }

    // NEW: Hint handling for NBA/Rapper games
    handleGiveHint(playerId, hint) {
        if (this.gameType === 'mole') {
            return { error: 'Hints not available in The Mole game' };
        }
        
        const currentPlayer = this.getCurrentPlayer();
        console.log(`Hint attempt: playerId=${playerId}, currentPlayer=${currentPlayer}, playerOrder=${this.playerOrder.join(',')}`);
        
        if (currentPlayer !== playerId) {
            return { error: 'Not your turn' };
        }

        const playerName = this.players.get(playerId).name;
        const player = this.players.get(playerId);

        console.log(`Hint given in room ${this.roomCode}: ${playerName} says "${hint}"`);

        // Save hint to game data
        this.currentGameData.playerHints.push({
            player: playerName,
            hint: hint,
            playerRole: player.role,
            wasPlayerImposter: playerId === this.gameState.imposter,
            round: this.gameState.currentRound
        });

        // Save to game history
        this.gameState.gameHistory.push({
            player: playerName,
            hint: hint,
            round: this.gameState.currentRound
        });

        const playerStats = this.scoreboard.get(playerId);
        playerStats.hintsGiven++;

        this.gameState.hintsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        console.log(`Hints this round: ${this.gameState.hintsThisRound}/${this.gameState.hintsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);

        return {
            success: true,
            player: playerName,
            hint: hint,
            hintsThisRound: this.gameState.hintsThisRound,
            currentTurn: this.gameState.currentTurn
        };
    }

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

    generateBotAnswer(botId, question, prompt = "") {
        const bot = this.bots.get(botId);
        const player = this.players.get(botId);
        
        if (!bot || !player) return 'not sure';
        
        const isImposter = botId === this.gameState.imposter;
        const location = this.gameState.location;
        
        return bot.generateResponse(question, location, isImposter, this.gameState.gameHistory, prompt);
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
                const winnerType = this.gameType === 'mole' ? 'location_wins' : 'player_wins';
                this.endGame(winnerType, `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
            console.log('Votes too spread out, imposter wins by default');
            const teamType = this.gameType === 'mole' ? 'Location team' : 'Player team';
            this.endGame('imposter_wins', `${teamType} failed to coordinate their votes. The imposter wins!`);
        }
    }

    // NEW: Handle imposter guess for NBA/Rapper games
    imposterGuess(guess) {
        console.log(`Imposter guess: ${this.players.get(this.gameState.imposter).name} guessed ${guess} (correct: ${this.gameState.location})`);
        const wasCorrect = guess === this.gameState.location;
        
        if (wasCorrect) {
            const itemType = this.gameType === 'nba' ? 'NBA player' : 'rapper';
            this.endGame('imposter_wins', `Imposter correctly guessed the ${itemType}: ${this.gameState.location}`);
        } else {
            const winnerType = 'player_wins';
            const itemType = this.gameType === 'nba' ? 'NBA player' : 'rapper';
            this.endGame(winnerType, `Imposter guessed wrong! ${itemType} was ${this.gameState.location}, not ${guess}`);
        }
    }

    // The Mole location reveal (unchanged)
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
            winner: winner,
            message: message,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter)?.name || 'Unknown'
        };
        
        // Update scoreboard
        this.updateScoreboardAfterGame(winner);
        
        // Save to game history
        this.saveGameToHistory();
        
        // Clean up disconnected players
        this.disconnectedPlayers.clear();
    }

    saveGameData() {
        if (this.gameType === 'mole' && this.currentGameData.playerQAs.length === 0) {
            console.log('No Mole game data to save');
            return;
        }
        if (this.gameType !== 'mole' && this.currentGameData.playerHints.length === 0) {
            console.log('No hint game data to save');
            return;
        }
    
        allGameData.push(JSON.parse(JSON.stringify(this.currentGameData)));
        console.log(`📊 Total games stored: ${allGameData.length} (available for download)`);
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
            } else if (winner === 'location_wins' || winner === 'player_wins') {
                if (!isImposter) {
                    didWin = true;
                    console.log(`${player.name} (${this.gameType === 'mole' ? 'location' : 'player'} team) gets win point`);
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
            gameType: this.gameType,
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
        console.log(`Game saved to history: ${this.gameType.toUpperCase()} Game #${gameRecord.gameNumber}`);
    }

    getGameStats() {
        return { totalGames: 0, totalQuestions: 0, totalVotes: 0 };
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
            gameType: this.gameType,
            roomType: this.roomType, // NEW: Include room type
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

    // NEW: Get public lobbies
    socket.on('get_public_lobbies', ({ gameType }) => {
        const publicLobbies = [];
        
        for (const [roomCode, room] of gameRooms.entries()) {
            if (room.roomType === 'public' && room.gameState.status === 'waiting') {
                // Filter by game type if specified
                if (gameType && room.gameType !== gameType) {
                    continue;
                }
                
                publicLobbies.push({
                    roomCode: room.roomCode,
                    gameType: room.gameType,
                    playerCount: room.players.size,
                    maxPlayers: 8,
                    hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                    usingCustomLocations: room.customLocations.length > 0,
                    botCount: room.bots.size,
                    createdAt: room.createdAt
                });
            }
        }
        
        // Sort by creation time (newest first) and limit to 10
        publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit('public_lobbies', publicLobbies.slice(0, 10));
    });

    socket.on('create_room', ({ playerName, gameType = 'mole', roomType = 'public' }) => {
        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode, gameType, roomType);
        const actualName = room.addPlayer(socket.id, playerName, true);
        gameRooms.set(roomCode, room);
        
        socket.join(roomCode);
        socket.emit('room_created', { 
            roomCode, 
            isHost: true, 
            actualName, 
            gameType,
            roomType 
        });
        socket.emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('join_room', ({ roomCode, playerName, gameType }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // Check if trying to join with wrong game type
        if (room.gameType !== gameType) {
            const gameNames = {
                'mole': 'The Mole',
                'nba': 'NBA Imposter', 
                'rapper': 'Rapper Imposter'
            };
            socket.emit('error', `This room is playing ${gameNames[room.gameType]}, not ${gameNames[gameType]}`);
            return;
        }
        
        // Check if player is trying to reconnect (was previously disconnected)
        const wasDisconnected = room.disconnectedPlayers.has(playerName);
        
        // NEW: Check room type and joinability (allow reconnection even if game in progress)
        if (!wasDisconnected && !room.isJoinable()) {
            if (room.roomType === 'locked') {
                socket.emit('error', 'Room is locked');
            } else if (room.players.size >= 8) {
                socket.emit('error', 'Room is full');
            } else if (room.gameState.status !== 'waiting') {
                socket.emit('error', 'Game already in progress');
            } else {
                socket.emit('error', 'Cannot join room');
            }
            return;
        }

        // If player was disconnected, handle reconnection
        if (wasDisconnected) {
            const reconnectedPlayer = room.handlePlayerReconnect(socket.id, playerName);
            if (!reconnectedPlayer) {
                socket.emit('error', 'Reconnection failed. Time window expired or player not found.');
                return;
            }
            
            socket.join(roomCode);
            
            // Update host status if needed
            if (reconnectedPlayer.isHost) {
                room.hostId = socket.id;
            }
            
            socket.emit('reconnected', {
                roomCode: room.roomCode,
                isHost: reconnectedPlayer.isHost,
                actualName: reconnectedPlayer.name,
                gameType: room.gameType,
                roomType: room.roomType
            });
            
            // Send current game state
            if (room.gameState.status === 'playing') {
                socket.emit('game_started', room.getGameStateForPlayer(socket.id));
            } else {
                socket.emit('room_updated', { 
                    players: Array.from(room.players.entries()).map(([id, player]) => ({
                        id, 
                        name: player.name, 
                        isHost: player.isHost,
                        isReady: player.isReady,
                        isBot: player.isBot
                    })),
                    scoreboard: room.getScoreboardData(),
                    roomType: room.roomType,
                    botCount: room.bots.size,
                    usingCustomLocations: room.customLocations.length > 0,
                    gameType: room.gameType
                });
            }
            
            // Notify other players
            io.to(room.roomCode).emit('player_reconnected', {
                playerName: reconnectedPlayer.name,
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id, 
                    name: player.name, 
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                roomType: room.roomType,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0,
                gameType: room.gameType
            });
            
            console.log(`${reconnectedPlayer.name} reconnected to room ${room.roomCode}`);
            return;
        }

        // Normal join flow for new players
        const actualName = room.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        socket.emit('room_joined', { 
            roomCode, 
            isHost: false, 
            actualName,
            gameType: room.gameType,
            roomType: room.roomType,
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
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
        
        if (actualName !== playerName) {
            socket.emit('name_changed', { 
                originalName: playerName, 
                newName: actualName 
            });
        }
    });

    // Bot management (only for The Mole)
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
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    // NEW: Change room type (replaces toggle_lock)
    socket.on('change_room_type', ({ roomType }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can change room type');
            return;
        }

        if (!room.setRoomType(roomType)) {
            socket.emit('error', 'Invalid room type');
            return;
        }
        
        io.to(room.roomCode).emit('room_updated', { 
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id, 
                name: player.name, 
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
        
        const typeMessages = {
            public: 'Room is now public - visible in lobby browser and joinable by code',
            private: 'Room is now private - only joinable by code',
            locked: 'Room is now locked - no new players can join'
        };
        
        io.to(room.roomCode).emit('room_type_changed', { 
            roomType: room.roomType,
            message: typeMessages[room.roomType]
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
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('toggle_ready', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player && !player.isBot) {
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
                roomType: room.roomType,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0,
                gameType: room.gameType
            });
        }
    });

    socket.on('start_game', (data) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) return;

        // Handle custom locations for The Mole only
        if (room.gameType === 'mole' && data && data.customLocations && Array.isArray(data.customLocations)) {
            const removedBots = room.setCustomLocations(data.customLocations);
            if (removedBots.length > 0) {
                io.to(room.roomCode).emit('bots_removed_custom_locations', {
                    removedBots,
                    message: 'Bots removed due to custom locations'
                });
            }
        }

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
                if (room.gameType === 'mole') {
                    handleBotTurn(room);
                } else {
                    handleHintTurn(room);
                }
            }, 1000);
        } else {
            socket.emit('error', 'Need at least 3 players to start');
        }
    });

    // The Mole question handling
    socket.on('ask_question', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleAskQuestion(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('question_asked', result);

        const targetPlayer = room.players.get(targetId);
        if (targetPlayer && targetPlayer.isBot) {
            setTimeout(() => {
                const prompt = result.prompt || "";
                const answer = room.generateBotAnswer(targetId, result.question, prompt);
                
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

                setTimeout(() => {
                    handleBotTurn(room);
                }, 1000);
            }, 1500);
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

        setTimeout(() => {
            handleBotTurn(room);
        }, 1000);
    });

    // NEW: Hint handling for NBA/Rapper games
    socket.on('give_hint', ({ hint }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleGiveHint(socket.id, hint);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('hint_given', result);

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });

        // Continue to next turn
        setTimeout(() => {
            handleHintTurn(room);
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

            // Handle bot voting (only for The Mole)
            if (room.gameType === 'mole') {
                setTimeout(() => {
                    for (const [botId, bot] of room.bots.entries()) {
                        if (!room.gameState.votes.has(botId)) {
                            room.handleBotVote(botId);
                        }
                    }
                }, 2000);
            }
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

    // The Mole imposter reveal
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

    // NEW: NBA/Rapper imposter guess
    socket.on('imposter_guess', ({ guess }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || socket.id !== room.gameState.imposter) {
            console.log(`Imposter guess failed: room=${!!room}, isImposter=${socket.id === room?.gameState.imposter}`);
            socket.emit('error', 'You are not the imposter');
            return;
        }

        console.log(`Imposter guess in room ${room.roomCode}: ${guess}`);
        room.imposterGuess(guess);

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
            const player = room.players.get(socket.id);
            if (!player) return;
            
            console.log(`Player ${player.name} disconnected from room ${room.roomCode}`);
            
            // Remove player from room
            room.players.delete(socket.id);
            
            // If game is not in progress, handle as normal player leave
            if (room.gameState.status !== 'playing') {
                // Handle host transfer if needed
                if (player.isHost && room.players.size > 0) {
                    // Find the player who has been in the room the longest (excluding bots)
                    const humanPlayers = Array.from(room.players.entries())
                        .filter(([id, p]) => !p.isBot)
                        .sort((a, b) => a[1].joinTime - b[1].joinTime);
                    
                    if (humanPlayers.length > 0) {
                        const newHost = humanPlayers[0];
                        newHost[1].isHost = true;
                        room.hostId = newHost[0];
                        console.log(`Host transferred to ${newHost[1].name}`);
                    }
                }
                
                // Delete room if no players left
                if (room.players.size === 0) {
                    gameRooms.delete(room.roomCode);
                    console.log(`Room ${room.roomCode} deleted (no players left)`);
                    return;
                }
                
                // Notify remaining players
                io.to(room.roomCode).emit('player_left', {
                    playerName: player.name,
                    players: Array.from(room.players.entries()).map(([id, p]) => ({
                        id, 
                        name: p.name, 
                        isHost: p.isHost,
                        isReady: p.isReady,
                        isBot: p.isBot
                    })),
                    scoreboard: room.getScoreboardData(),
                    roomType: room.roomType,
                    botCount: room.bots.size,
                    usingCustomLocations: room.customLocations.length > 0,
                    gameType: room.gameType
                });
                return;
            }
            
            // Game is in progress - handle based on player role
            const isImposter = socket.id === room.gameState.imposter;
            const totalPlayers = room.players.size + room.bots.size;
            
            console.log(`Game in progress: ${player.name} disconnected, isImposter=${isImposter}, totalPlayers=${totalPlayers}`);
            
            if (isImposter) {
                // Imposter disconnected - end game
                console.log(`Imposter ${player.name} disconnected - ending game`);
                room.endGame('imposter_left', `${player.name} (the imposter) disconnected! No one wins.`);
                io.to(room.roomCode).emit('game_over', room.gameState.gameResult);
            } else if (totalPlayers < 3) {
                // Not enough players to continue
                console.log(`Not enough players (${totalPlayers}) to continue game`);
                room.endGame('not_enough_players', `Not enough players to continue (${totalPlayers}/3 minimum).`);
                io.to(room.roomCode).emit('game_over', room.gameState.gameResult);
            } else {
                // Continue game - remove player from turn order and adjust
                console.log(`Continuing game without ${player.name}`);
                
                // Remove from player order
                const playerIndex = room.playerOrder.indexOf(socket.id);
                if (playerIndex !== -1) {
                    room.playerOrder.splice(playerIndex, 1);
                    
                    // Adjust current turn if needed
                    if (room.playerOrder.length > 0) {
                        if (playerIndex <= room.gameState.currentTurn) {
                            room.gameState.currentTurn = room.gameState.currentTurn % room.playerOrder.length;
                        }
                    }
                }
                
                // Handle host transfer if needed
                if (player.isHost) {
                    const humanPlayers = Array.from(room.players.entries())
                        .filter(([id, p]) => !p.isBot)
                        .sort((a, b) => a[1].joinTime - b[1].joinTime);
                    
                    if (humanPlayers.length > 0) {
                        const newHost = humanPlayers[0];
                        newHost[1].isHost = true;
                        room.hostId = newHost[0];
                        console.log(`Host transferred to ${newHost[1].name}`);
                    }
                }
                
                // Notify remaining players
                io.to(room.roomCode).emit('player_left', {
                    playerName: player.name,
                    players: Array.from(room.players.entries()).map(([id, p]) => ({
                        id, 
                        name: p.name, 
                        isHost: p.isHost,
                        isReady: p.isReady,
                        isBot: p.isBot
                    })),
                    scoreboard: room.getScoreboardData(),
                    roomType: room.roomType,
                    botCount: room.bots.size,
                    usingCustomLocations: room.customLocations.length > 0,
                    gameType: room.gameType
                });
                
                // Continue game flow
                setTimeout(() => {
                    if (room.gameType === 'mole') {
                        handleBotTurn(room);
                    } else {
                        handleHintTurn(room);
                    }
                }, 1000);
            }
        }
    });

    // NEW: Handle player leaving intentionally
    socket.on('leave_room', () => {
        const room = findPlayerRoom(socket.id);
        if (room) {
            // Remove player without adding to disconnectedPlayers
            const player = room.removePlayer(socket.id);
            
            if (room.players.size === 0 && room.disconnectedPlayers.size === 0) {
                gameRooms.delete(room.roomCode);
                console.log(`Room ${room.roomCode} deleted (no players left)`);
                // Emit updated public lobbies to all clients
                const publicLobbies = [];
                for (const [roomCode, room] of gameRooms.entries()) {
                    if (room.roomType === 'public' && room.gameState.status === 'waiting') {
                        publicLobbies.push({
                            roomCode: room.roomCode,
                            gameType: room.gameType,
                            playerCount: room.players.size,
                            maxPlayers: 8,
                            hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                            usingCustomLocations: room.customLocations.length > 0,
                            botCount: room.bots.size,
                            createdAt: room.createdAt
                        });
                    }
                }
                publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                io.emit('public_lobbies', publicLobbies.slice(0, 10));
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
                    roomType: room.roomType,
                    botCount: room.bots.size,
                    usingCustomLocations: room.customLocations.length > 0,
                    gameType: room.gameType,
                    disconnectedPlayers: Array.from(room.disconnectedPlayers.keys())
                });
                
                // If game is in progress, continue the game
                if (room.gameState.status === 'playing') {
                    room.players.forEach((player, socketId) => {
                        if (!player.isBot) {
                            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                        }
                    });
                    
                    // Continue game flow
                    setTimeout(() => {
                        if (room.gameType === 'mole') {
                            handleBotTurn(room);
                        } else {
                            handleHintTurn(room);
                        }
                    }, 1000);
                }
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

// NEW: Periodic cleanup of expired disconnections
setInterval(() => {
    for (const room of gameRooms.values()) {
        const expiredPlayers = room.cleanupExpiredDisconnections();
        if (expiredPlayers.length > 0) {
            console.log(`Cleaned up ${expiredPlayers.length} expired disconnections in room ${room.roomCode}`);
        }
    }
}, 30000); // Check every 30 seconds

// NEW: Handle hint turns for NBA/Rapper games
function handleHintTurn(room) {
    if (room.gameState.status !== 'playing' || room.gameType === 'mole') return;
    
    const currentPlayer = room.getCurrentPlayer();
    const player = room.players.get(currentPlayer);
    
    if (!player) return;
    
    console.log(`${room.gameType.toUpperCase()} hint turn: ${player.name}`);
    
    // Notify the current player it's their turn
    if (!player.isBot) {
        io.to(currentPlayer).emit('your_hint_turn');
    }
    // Note: No bots in NBA/Rapper games, so we don't handle bot hints
}

// Handle bot turns for The Mole (unchanged)
function handleBotTurn(room) {
    if (room.gameState.status !== 'playing' || room.gameType !== 'mole') return;
    
    const currentPlayer = room.getCurrentPlayer();
    const player = room.players.get(currentPlayer);
    
    if (!player || !player.isBot) return;
    
    console.log(`Bot turn: ${player.name}`);
    
    if (!room.gameState.questionAskedThisTurn && !room.gameState.waitingForAnswer) {
        setTimeout(() => {
            const result = room.handleBotAskQuestion(currentPlayer);
            
            if (result && result.success) {
                room.players.forEach((p, socketId) => {
                    if (!p.isBot) {
                        io.to(socketId).emit('question_asked', result);
                    }
                });
                
                const targetPlayer = room.players.get(result.targetId);
                if (targetPlayer && targetPlayer.isBot) {
                    setTimeout(() => {
                        const prompt = result.prompt || "";
                        const answer = room.generateBotAnswer(result.targetId, result.question, prompt);
                        
                        room.processAnswer(result.askerId, result.targetId, result.question, answer);
                        
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
                        
                        setTimeout(() => {
                            handleBotTurn(room);
                        }, 1000);
                    }, 1500);
                }
            } else {
                console.log('Bot failed to ask question, skipping turn');
                room.gameState.questionsThisRound++;
                room.gameState.currentTurn = (room.gameState.currentTurn + 1) % room.playerOrder.length;
                
                setTimeout(() => {
                    handleBotTurn(room);
                }, 500);
            }
        }, 2000);
    }
    
    if (room.gameState.questionsThisRound >= room.gameState.questionsPerRound) {
        if (!room.gameState.readyToVotePlayers.has(currentPlayer)) {
            const bot = room.bots.get(currentPlayer);
            const shouldBeReady = bot ? shouldBotBeReadyToVote(bot, room) : false;
            
            if (shouldBeReady) {
                setTimeout(() => {
                    room.readyToVote(currentPlayer);
                    
                    room.players.forEach((p, socketId) => {
                        if (!p.isBot) {
                            io.to(socketId).emit('ready_count_updated', {
                                readyCount: room.gameState.readyToVoteCount,
                                requiredCount: room.players.size - 1
                            });
                        }
                    });
                    
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
                }, 3000);
            }
        }
    }
}

function shouldBotBeReadyToVote(bot, room) {
    const isImposter = room.playerOrder[room.gameState.currentTurn] === room.gameState.imposter;
    
    if (isImposter) {
        return Math.random() < 0.3;
    } else {
        let maxSuspicion = 0;
        let suspiciousPlayerCount = 0;
        
        for (const [playerId, suspicion] of bot.suspicion.entries()) {
            if (suspicion > maxSuspicion) {
                maxSuspicion = suspicion;
            }
            if (suspicion > 30) {
                suspiciousPlayerCount++;
            }
        }
        
        const hasStrongSuspicion = maxSuspicion > 50;
        const hasModerateEvidence = maxSuspicion > 25 && suspiciousPlayerCount <= 2;
        const manyRounds = room.gameState.currentRound > 2;
        
        if (hasStrongSuspicion) return true;
        if (hasModerateEvidence && Math.random() < 0.6) return true;
        if (manyRounds && Math.random() < 0.4) return true;
        
        return false;
    }
}

const PORT = process.env.PORT || 8888;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Game Collection: The Mole, NBA Imposter, and Rapper Imposter');
    console.log('Enhanced lobby system: Public, Private, and Locked rooms');
    console.log('Bot support enabled for The Mole only');
});

// === SPOTIFY OAUTH CALLBACK ===
const spotifyClientId = '4e94cdc6f9c544f8a74b67e5bf31a5bb';
const spotifyClientSecret = '036dc9cdfd0a4bb0a586d9ec606930af';
// Use Render URL for production, fallback to localhost:8888 for local dev
const spotifyRedirectUri = process.env.RENDER
    ? 'https://jaceg22-github-io.onrender.com/callback'
    : 'http://127.0.0.1:8888/callback';

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.send('No code provided');
    try {
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('redirect_uri', spotifyRedirectUri);
        params.append('grant_type', 'authorization_code');
        params.append('client_id', spotifyClientId);
        params.append('client_secret', spotifyClientSecret);
        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        // Send access token to opener window
        res.send(`
            <script>
                window.opener && window.opener.postMessage(${JSON.stringify(response.data)}, '*');
                window.close();
            </script>
            <pre>${JSON.stringify(response.data, null, 2)}</pre>
        `);
    } catch (err) {
        res.send('Error exchanging code: ' + err);
    }
});