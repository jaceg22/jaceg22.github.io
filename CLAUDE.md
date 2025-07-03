# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multiplayer game collection web application featuring "The Mole" deduction game and other party games. The application uses Node.js with Express for the backend, Socket.IO for real-time multiplayer communication, and vanilla HTML/CSS/JavaScript for the frontend.

## Development Commands

- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon (auto-restart)
- `npm install` - Install dependencies

## Architecture

### Backend (server.js)
- **Express.js** server serving static files from `/public`
- **Socket.IO** handles real-time multiplayer game communication
- **Game rooms** system with support for public/private lobbies
- **REST API endpoints** for lobby management (`/api/public-lobbies`, `/download-all-games`)
- **Bot system** for AI players in games
- **Spotify integration** for music features during gameplay

### Frontend Structure
- **Single-page application** in `public/index.html` with embedded CSS and JavaScript
- **Socket.IO client** for real-time communication
- **Game state management** handled client-side with server synchronization
- **Spotify Web Playback SDK** integration for music features
- **Responsive design** with mobile-first approach

### Game System
- **Multiple game types** supported (The Mole, others)
- **Custom locations** system for game variants
- **Player roles and voting mechanics**
- **Real-time chat and game progression**
- **Bot integration** for enhanced gameplay

## Key Files
- `server.js` - Main server file containing all backend logic (~26k lines)
- `public/index.html` - Frontend SPA with game UI and logic (~42k lines)
- `package.json` - Dependencies and scripts
- `1.html`, `2.html`, `3.html` - Additional game variants or pages

## Development Notes
- Server runs on port defined by environment variable or defaults
- Uses Socket.IO for all real-time game communication
- Game state is managed server-side with client updates
- Supports both human players and AI bots
- Integrates with Spotify for music during games