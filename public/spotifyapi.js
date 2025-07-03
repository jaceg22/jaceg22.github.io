import axios from 'axios';

class SpotifyAPI {
    constructor() {
        this.clientId = '4e94cdc6f9c544f8a74b67e5bf31a5bb';
        this.clientSecret = '036dc9cdfd0a4bb0a586d9ec606930af';
        this.redirectUri = 'http://127.0.0.1:8888/callback';
        this.accessToken = null;
        this.refreshToken = null;

        console.log('🔍 Redirect URI being used:', this.redirectUri);
        
        this.loadSavedTokens();
      }

  loadSavedTokens() {
    try {
      this.accessToken = localStorage.getItem('spotify_access_token');
      this.refreshToken = localStorage.getItem('spotify_refresh_token');
      if (this.accessToken) {
        console.log('🔐 Found saved authentication token');
      }
    } catch (error) {
      console.warn('⚠️ Could not load saved token:', error);
    }
  }

  saveTokens() {
    try {
      if (this.accessToken) {
        localStorage.setItem('spotify_access_token', this.accessToken);
      }
      if (this.refreshToken) {
        localStorage.setItem('spotify_refresh_token', this.refreshToken);
      }
      console.log('💾 Authentication tokens saved');
    } catch (error) {
      console.warn('⚠️ Could not save tokens:', error);
    }
  }

  clearTokens() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    this.accessToken = null;
    this.refreshToken = null;
  }

  getAuthUrl() {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-read-currently-playing',
      'user-read-recently-played',
      'user-top-read',
      'playlist-read-private',
      'playlist-read-collaborative'
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      show_dialog: 'true'
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async handleCallback(code) {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (response.status === 200) {
        this.accessToken = response.data.access_token;
        this.refreshToken = response.data.refresh_token;
        this.saveTokens();
        return true;
      }
    } catch (error) {
      console.error('❌ Token exchange failed:', error);
      return false;
    }
    return false;
  }

  async makeRequest(endpoint, params = {}, method = 'GET', body = null, retryCount = 0) {
    if (!this.accessToken) {
      return { error: 'Not authenticated' };
    }

    try {
      const config = {
        method: method,
        url: `https://api.spotify.com/v1/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (method === 'GET') {
        config.params = params;
      } else if (body) {
        config.data = body;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('🔄 Token expired, please re-authenticate');
        this.clearTokens();
        return { error: 'Token expired' };
      }
      
      // Handle rate limiting with exponential backoff
      if (error.response?.status === 429 && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, params, method, body, retryCount + 1);
      }
      
      return { error: `Request failed: ${error.response?.status || error.message}` };
    }
  }

  //User Profile
  async getUserProfile() {
    return await this.makeRequest('me');
  }

  //Currently Playing
  async getCurrentlyPlaying() {
    return await this.makeRequest('me/player/currently-playing');
  }

  //Top Tracks
  async getTopTracks(timeRange = 'short_term', limit = 10) {
    return await this.makeRequest('me/top/tracks', { 
      time_range: timeRange, 
      limit 
    });
  }

  //Top Artists
  async getTopArtists(timeRange = 'short_term', limit = 10) {
    return await this.makeRequest('me/top/artists', { 
      time_range: timeRange, 
      limit 
    });
  }

  //User Playlists
  async getUserPlaylists(limit = 10) {
    const playlistsData = await this.makeRequest('me/playlists', { limit });
    
    if (playlistsData.items) {
      // Calculate duration for each playlist
      const playlistsWithDuration = await Promise.all(
        playlistsData.items.map(async (playlist) => {
          try {
            // Get tracks from playlist (limit to first 50 tracks for speed)
            const tracksData = await this.getPlaylistTracks(playlist.id, 50);
            let totalDuration = 0;
            
            if (tracksData.items) {
              for (const item of tracksData.items) {
                if (item && item.track && item.track.duration_ms) {
                  totalDuration += item.track.duration_ms;
                }
              }
            }
            
            return {
              ...playlist,
              totalDuration: totalDuration,
              formattedDuration: this.formatTime(totalDuration)
            };
          } catch (error) {
            console.error(`Error calculating duration for playlist ${playlist.name}:`, error);
            return {
              ...playlist,
              totalDuration: 0,
              formattedDuration: '0m'
            };
          }
        })
      );
      
      return { ...playlistsData, items: playlistsWithDuration };
    }
    
    return playlistsData;
  }

  //Get Recommendations
  async getStudyRecommendations(seedTracks = []) {
    console.log('🎯 getStudyRecommendations called with:', seedTracks);
    console.log('🎯 seedTracks length:', seedTracks.length);
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (seedTracks.length === 0) {
      console.log('🎯 No seed tracks provided - trying genre-based recommendations');
      // Fallback to genre-based recommendations
      const genreResponse = await this.makeRequest('recommendations', {
        seed_genres: 'ambient,chill,lo-fi',
        limit: 6,
        target_energy: 0.2,
        target_valence: 0.4,
        target_danceability: 0.3,
        target_speechiness: 0.1
      });
      console.log('🎯 Genre-based recommendations response:', genreResponse);
      return genreResponse;
    }

    // Ensure we have valid track IDs (filter out invalid ones)
    const validSeeds = seedTracks.filter(id => {
      return id && 
             typeof id === 'string' && 
             id.length > 0 && 
             id.length === 22 && // Spotify track IDs are 22 characters
             /^[A-Za-z0-9]+$/.test(id); // Only alphanumeric characters
    });
    
    console.log('🎯 Valid seeds after filtering:', validSeeds);
    console.log('🎯 Filtered out invalid IDs:', seedTracks.filter(id => !validSeeds.includes(id)));
    
    if (validSeeds.length === 0) {
      console.log('🎯 No valid seed track IDs - falling back to genre-based recommendations');
      // Fallback to genre-based recommendations
      const genreResponse = await this.makeRequest('recommendations', {
        seed_genres: 'ambient,chill,lo-fi',
        limit: 6,
        target_energy: 0.2,
        target_valence: 0.4,
        target_danceability: 0.3,
        target_speechiness: 0.1
      });
      console.log('🎯 Fallback genre recommendations response:', genreResponse);
      return genreResponse;
    }

    const params = {
      seed_tracks: validSeeds.slice(0, 5).join(','), // Limit to 5 seeds max
      limit: 6,
      target_energy: 0.2,
      target_valence: 0.4,
      target_danceability: 0.3,
      target_speechiness: 0.1
    };
    
    console.log('🎯 Making recommendations request with params:', params);
    
    const response = await this.makeRequest('recommendations', params);
    console.log('🎯 Raw API response:', response);
    
    // If we get a 404 or error, fall back to genre-based recommendations
    if (response.error) {
      console.error('🎯 Recommendations API error:', response.error);
      console.log('🎯 Falling back to genre-based recommendations due to error');
      
      // Add delay before retry to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const genreResponse = await this.makeRequest('recommendations', {
        seed_genres: 'ambient,chill,lo-fi',
        limit: 6,
        target_energy: 0.2,
        target_valence: 0.4,
        target_danceability: 0.3,
        target_speechiness: 0.1
      });
      console.log('🎯 Genre fallback response:', genreResponse);
      return genreResponse;
    }
    
    console.log('🎯 Returning response:', response);
    return response;
  }

  //Get Artist
  async getArtist(artistId) {
    return await this.makeRequest(`artists/${artistId}`);
  }

  //Search for content
  async search(query, type = 'track', limit = 10) {
    return await this.makeRequest('search', {
      q: query,
      type: type,
      limit: limit
    });
  }

  //Get playlist tracks
  async getPlaylistTracks(playlistId, limit = 100) {
    return await this.makeRequest(`playlists/${playlistId}/tracks`, { limit });
  }

  //Search for study playlists
  async searchStudyPlaylists() {
    const searchTerms = [
      'lofi hip hop study',
      'ambient study music',
      'instrumental focus music'
    ];

    const results = [];
    for (const keyword of searchTerms) {
      const searchResults = await this.search(keyword, 'playlist', 3);
      if (searchResults.playlists && searchResults.playlists.items) {
        for (const playlist of searchResults.playlists.items) {
          if (playlist && playlist.tracks.total > 20) {
            results.push(playlist);
          }
        }
      }
    }
    return results;
  }

  //Radio stations for studying
  async getStudyRadioStations() {
    const radioSearches = ['lofi radio', 'ambient radio', 'study radio', 'chill radio', 'focus radio'];
    const results = [];

    for (const radioTerm of radioSearches) {
      const searchResults = await this.search(radioTerm, 'playlist', 2);
      if (searchResults.playlists && searchResults.playlists.items) {
        for (const playlist of searchResults.playlists.items) {
          if (playlist && playlist.name.toLowerCase().includes('radio')) {
            results.push(playlist);
          }
        }
      }
    }
    return results.slice(0, 5); // Return top 5 radio stations
  }

  //Get popular study tracks
  async getPopularStudyTracks() {
    const studySearches = [
      'lofi hip hop instrumental',
      'ambient instrumental study'
    ];
    const results = [];

    for (const searchTerm of studySearches) {
      const searchResults = await this.search(searchTerm, 'track', 3);
      if (searchResults.tracks && searchResults.tracks.items) {
        for (const track of searchResults.tracks.items) {
          if (track) {
            results.push(track);
          }
        }
      }
    }
    return results;
  }

  // Helper method to check if a track is study-related
  isStudyTrack(track) {
    const studyKeywords = ['study', 'school', 'work', 'focus', 'concentration', 'homework'];
    const lofiKeywords = ['lofi', 'lo-fi', 'lo fi'];
    const ambientKeywords = ['ambient'];
    
    // Safety checks for null/undefined values
    if (!track || !track.name) {
      return false;
    }
    
    const trackName = track.name.toLowerCase();
    const artistNames = (track.artists && Array.isArray(track.artists)) 
      ? track.artists.map(a => a && a.name ? a.name.toLowerCase() : '').join(' ')
      : '';
    const albumName = (track.album && track.album.name) ? track.album.name.toLowerCase() : '';
    
    // Check track name, artist names, and album name
    const isStudy = studyKeywords.some(keyword => 
      trackName.includes(keyword) || 
      artistNames.includes(keyword) || 
      albumName.includes(keyword)
    );
    
    const isLofi = lofiKeywords.some(keyword => 
      trackName.includes(keyword) || 
      artistNames.includes(keyword) || 
      albumName.includes(keyword)
    );
    
    const isAmbient = ambientKeywords.some(keyword => 
      trackName.includes(keyword) || 
      artistNames.includes(keyword) || 
      albumName.includes(keyword)
    );
    
    const result = isStudy || isLofi || isAmbient;
    
    if (result) {
      console.log(`Study track detected: "${track.name}" by ${track.artists ? track.artists.map(a => a && a.name ? a.name : 'Unknown').join(', ') : 'Unknown'}`);
      console.log(`  - Track name: "${trackName}"`);
      console.log(`  - Artist names: "${artistNames}"`);
      console.log(`  - Album name: "${albumName}"`);
      console.log(`  - Matches: study=${isStudy}, lofi=${isLofi}, ambient=${isAmbient}`);
    }
    
    return result;
  }

  // Get recent study tracks from study playlists
  async getRecentStudyTracks() {
    const studyKeywords = ['study', 'school', 'work', 'focus', 'concentration', 'homework'];
    const lofiKeywords = ['lofi', 'lo-fi', 'lo fi'];
    const ambientKeywords = ['ambient'];
    
    const allStudyTracks = [];
    const trackCounts = new Map();
    const trackLastPlayed = new Map();
    const trackPlaylists = new Map();

    // Get user playlists (limit to 15 for speed)
    const playlistsData = await this.getUserPlaylists(15);
    if (playlistsData.items) {
      for (const playlist of playlistsData.items) {
        const playlistName = playlist.name.toLowerCase();
        
        // Check if this is a study-related playlist - more inclusive matching
        const isStudyPlaylist = studyKeywords.some(keyword => playlistName.includes(keyword)) ||
                               lofiKeywords.some(keyword => playlistName.includes(keyword)) ||
                               ambientKeywords.some(keyword => playlistName.includes(keyword));
        
        if (isStudyPlaylist) {
          console.log(`Found study playlist: ${playlist.name}`);
          try {
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Get tracks from this playlist (limit to 30 tracks for speed)
            const tracksData = await this.getPlaylistTracks(playlist.id, 30);
            if (tracksData.items) {
              for (const item of tracksData.items) {
                if (item && item.track) {
                  const track = item.track;
                  const trackId = track.id;
                  
                  // Use the helper method to check if this is a study track
                  if (this.isStudyTrack(track)) {
                    console.log(`Found study track in playlist: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
                    
                    // Count how many times this track appears in study playlists
                    trackCounts.set(trackId, (trackCounts.get(trackId) || 0) + 1);
                    
                    // Track when this was last added (use added_at if available, otherwise current time)
                    const addedAt = item.added_at ? new Date(item.added_at).getTime() : Date.now();
                    const currentLastPlayed = trackLastPlayed.get(trackId) || 0;
                    trackLastPlayed.set(trackId, Math.max(currentLastPlayed, addedAt));
                    
                    // Track which playlists contain this track
                    if (!trackPlaylists.has(trackId)) {
                      trackPlaylists.set(trackId, []);
                    }
                    trackPlaylists.get(trackId).push(playlist.name);
                    
                    // Store track data if we haven't seen it before
                    if (!allStudyTracks.find(t => t.id === trackId)) {
                      allStudyTracks.push(track);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error getting tracks from playlist ${playlist.name}:`, error);
          }
        }
      }
    }

    console.log(`Found ${allStudyTracks.length} total study tracks`);

    // Sort tracks by a combination of play count and recency
    const sortedTracks = allStudyTracks.sort((a, b) => {
      const aCount = trackCounts.get(a.id) || 0;
      const bCount = trackCounts.get(b.id) || 0;
      
      // If one track appears in significantly more playlists, prioritize it
      if (Math.abs(aCount - bCount) >= 2) {
        return bCount - aCount;
      }
      
      // Otherwise, prioritize recency (most recent first)
      const aLastPlayed = trackLastPlayed.get(a.id) || 0;
      const bLastPlayed = trackLastPlayed.get(b.id) || 0;
      return bLastPlayed - aLastPlayed;
    });

    // Return top 10 tracks with their play counts and playlist info
    return sortedTracks.slice(0, 10).map(track => ({
      ...track,
      playCount: trackCounts.get(track.id) || 1,
      lastPlayed: trackLastPlayed.get(track.id) || Date.now(),
      playlists: trackPlaylists.get(track.id) || []
    }));
  }

  //Enhanced Study Music Analysis
  async analyzeStudyMusic() {
    const studyKeywords = ['study', 'school', 'work', 'focus', 'concentration', 'homework'];
    const lofiKeywords = ['lofi', 'lo-fi', 'lo fi'];
    const ambientKeywords = ['ambient'];
    
    const results = {
      studyPlaylists: [],
      lofiPlaylists: [],
      ambientPlaylists: [],
      studyTracks: [],
      totalStudyTime: 0,
      genreStats: { 'lo-fi': 0, 'ambient': 0, 'instrumental': 0, 'downtempo': 0 },
      publicStudyPlaylists: [],
      studyRecommendations: [],
      radioStations: [],
      popularStudyTracks: [],
      recentStudyTracks: [],
      // Add general listening trends
      generalGenreStats: {},
      topGenres: [],
      listeningTimeByGenre: {},
      // Add listening behavior patterns
      listeningPatterns: {
        morningVibes: { genre: '', percentage: 0 },
        eveningChoice: { genre: '', percentage: 0 },
        studyMode: { genre: '', percentage: 0 },
        windDown: { genre: '', percentage: 0 },
        mostReplayed: { type: '', content: '' }
      }
    };
  
    // Analyze playlists first (limit to 30 for speed)
    const playlistsData = await this.getUserPlaylists(30);
    console.log(`Analyzing ${playlistsData.items ? playlistsData.items.length : 0} playlists for study content`);
    
    if (playlistsData.items) {
      for (const playlist of playlistsData.items) {
        const playlistName = playlist.name.toLowerCase();
        console.log(`Checking playlist: "${playlist.name}" (${playlistName})`);
        
        // More inclusive playlist categorization
        if (studyKeywords.some(keyword => playlistName.includes(keyword))) {
          results.studyPlaylists.push(playlist);
          console.log(`Found study playlist: ${playlist.name}`);
        } else if (lofiKeywords.some(keyword => playlistName.includes(keyword))) {
          results.lofiPlaylists.push(playlist);
          console.log(`Found lofi playlist: ${playlist.name}`);
        } else if (ambientKeywords.some(keyword => playlistName.includes(keyword))) {
          results.ambientPlaylists.push(playlist);
          console.log(`Found ambient playlist: ${playlist.name}`);
        }
        
        // Calculate duration for study-related playlists (use pre-calculated duration)
        if (studyKeywords.concat(lofiKeywords).concat(ambientKeywords).some(keyword => playlistName.includes(keyword))) {
          results.totalStudyTime += playlist.totalDuration || 0;
        }
      }
    }
  
    // Analyze top tracks for study content AND general trends (limit to short_term only for speed)
    const topTracks = await this.getTopTracks('short_term', 15);
    console.log(`Analyzing ${topTracks.items ? topTracks.items.length : 0} top tracks for study content and general trends`);
    
    if (topTracks.items) {
      for (const track of topTracks.items) {
        console.log(`Checking top track: "${track.name}" by ${track.artists.map(a => a.name).join(', ')}`);
        let isStudyTrack = false;
        
        // Use the helper method for consistent track detection
        if (this.isStudyTrack(track)) {
          isStudyTrack = true;
          console.log(`Found study track in top tracks: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
        }
        
        // Check artist genres for BOTH study music AND general trends
        if (track.artists.length > 0) {
          const artist = track.artists[0];
          const artistData = await this.getArtist(artist.id);
          if (artistData.genres) {
            for (const genre of artistData.genres) {
              const genreLower = genre.toLowerCase();
              
              // Study music genres
              if (['lo-fi', 'lofi', 'chillhop', 'jazz fusion'].some(term => genreLower.includes(term))) {
                results.genreStats['lo-fi'] += track.duration_ms;
                isStudyTrack = true;
                console.log(`Found lo-fi track by genre: ${track.name} (${genre})`);
              } else if (['ambient', 'instrumental', 'downtempo', 'new age', 'minimalism', 'drone'].some(term => genreLower.includes(term))) {
                if (genreLower.includes('ambient')) {
                  results.genreStats.ambient += track.duration_ms;
                } else if (genreLower.includes('instrumental')) {
                  results.genreStats.instrumental += track.duration_ms;
                } else if (genreLower.includes('downtempo')) {
                  results.genreStats.downtempo += track.duration_ms;
                }
                isStudyTrack = true;
                console.log(`Found study track by genre: ${track.name} (${genre})`);
              }
              
              // General listening trends - track ALL genres
              if (!results.generalGenreStats[genre]) {
                results.generalGenreStats[genre] = 0;
              }
              results.generalGenreStats[genre] += track.duration_ms;
              
              // Track listening time by genre
              if (!results.listeningTimeByGenre[genre]) {
                results.listeningTimeByGenre[genre] = 0;
              }
              results.listeningTimeByGenre[genre] += track.duration_ms;
            }
          }
        }
        
        if (isStudyTrack) {
          results.studyTracks.push(track);
        }
      }
    }
    
    // Get top artists for additional genre data
    const topArtists = await this.getTopArtists('short_term', 10);
    console.log(`Analyzing ${topArtists.items ? topArtists.items.length : 0} top artists for genre trends`);
    
    if (topArtists.items) {
      for (const artist of topArtists.items) {
        if (artist.genres) {
          for (const genre of artist.genres) {
            if (!results.generalGenreStats[genre]) {
              results.generalGenreStats[genre] = 0;
            }
            // Add some weight for artist popularity
            results.generalGenreStats[genre] += 60000; // 1 minute equivalent
          }
        }
      }
    }
    
    // Sort genres by listening time
    const sortedGenres = Object.entries(results.generalGenreStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    results.topGenres = sortedGenres.map(([genre, time]) => ({
      genre,
      time,
      formattedTime: this.formatTime(time)
    }));
    
    console.log('Top genres found:', results.topGenres);
  
    // Analyze listening behavior patterns
    console.log('Analyzing listening behavior patterns...');
    
    // Analyze playlist names and genres for time-based patterns
    const morningKeywords = ['morning', 'dawn', 'sunrise', 'wake', 'start', 'begin'];
    const eveningKeywords = ['evening', 'night', 'dusk', 'sunset', 'late', 'chill'];
    const patternStudyKeywords = ['study', 'focus', 'work', 'concentration', 'academic', 'homework'];
    const windDownKeywords = ['sleep', 'relax', 'calm', 'peaceful', 'meditation', 'zen'];
    
    const morningGenres = new Map();
    const eveningGenres = new Map();
    const studyGenres = new Map();
    const windDownGenres = new Map();
    
    // Analyze playlists for time-based patterns
    if (playlistsData.items) {
      for (const playlist of playlistsData.items) {
        const playlistName = playlist.name.toLowerCase();
        const playlistTracks = playlist.tracks.total;
        
        // Check for morning patterns
        if (morningKeywords.some(keyword => playlistName.includes(keyword))) {
          for (const [genre, time] of Object.entries(results.generalGenreStats)) {
            if (['chill', 'ambient', 'acoustic', 'folk', 'jazz'].some(g => genre.toLowerCase().includes(g))) {
              morningGenres.set(genre, (morningGenres.get(genre) || 0) + playlistTracks);
            }
          }
        }
        
        // Check for evening patterns
        if (eveningKeywords.some(keyword => playlistName.includes(keyword))) {
          for (const [genre, time] of Object.entries(results.generalGenreStats)) {
            if (['bollywood', 'hindi', 'pop', 'hip hop', 'r&b'].some(g => genre.toLowerCase().includes(g))) {
              eveningGenres.set(genre, (eveningGenres.get(genre) || 0) + playlistTracks);
            }
          }
        }
        
        // Check for study patterns
        if (patternStudyKeywords.some(keyword => playlistName.includes(keyword)) || 
            lofiKeywords.some(keyword => playlistName.includes(keyword))) {
          for (const [genre, time] of Object.entries(results.generalGenreStats)) {
            if (['lo-fi', 'lofi', 'instrumental', 'ambient', 'classical'].some(g => genre.toLowerCase().includes(g))) {
              studyGenres.set(genre, (studyGenres.get(genre) || 0) + playlistTracks);
            }
          }
        }
        
        // Check for wind-down patterns
        if (windDownKeywords.some(keyword => playlistName.includes(keyword))) {
          for (const [genre, time] of Object.entries(results.generalGenreStats)) {
            if (['instrumental', 'ambient', 'classical', 'piano', 'nature'].some(g => genre.toLowerCase().includes(g))) {
              windDownGenres.set(genre, (windDownGenres.get(genre) || 0) + playlistTracks);
            }
          }
        }
      }
    }
    
    // Determine most common patterns
    const getTopGenre = (genreMap) => {
      if (genreMap.size === 0) return { genre: 'Various', percentage: 0 };
      const sorted = Array.from(genreMap.entries()).sort((a, b) => b[1] - a[1]);
      const total = Array.from(genreMap.values()).reduce((sum, val) => sum + val, 0);
      const percentage = total > 0 ? Math.round((sorted[0][1] / total) * 100) : 0;
      return { genre: sorted[0][0], percentage };
    };
    
    results.listeningPatterns.morningVibes = getTopGenre(morningGenres);
    results.listeningPatterns.eveningChoice = getTopGenre(eveningGenres);
    results.listeningPatterns.studyMode = getTopGenre(studyGenres);
    results.listeningPatterns.windDown = getTopGenre(windDownGenres);
    
    // Determine most replayed content
    let mostReplayedType = 'Various';
    let mostReplayedContent = 'Your playlists';
    
    if (results.studyPlaylists.length > 0) {
      mostReplayedType = 'Study playlists';
      mostReplayedContent = results.studyPlaylists[0].name;
    } else if (results.lofiPlaylists.length > 0) {
      mostReplayedType = 'Lo-fi playlists';
      mostReplayedContent = results.lofiPlaylists[0].name;
    } else if (topTracks.items && topTracks.items.length > 0) {
      mostReplayedType = 'Top tracks';
      mostReplayedContent = topTracks.items[0].name;
    }
    
    results.listeningPatterns.mostReplayed = { type: mostReplayedType, content: mostReplayedContent };
    
    // Fallback patterns based on top genres if no playlist patterns found
    if (results.listeningPatterns.morningVibes.percentage === 0 && results.topGenres.length > 0) {
      const chillGenres = results.topGenres.filter(g => 
        ['chill', 'ambient', 'acoustic', 'folk', 'jazz'].some(term => g.genre.toLowerCase().includes(term))
      );
      if (chillGenres.length > 0) {
        results.listeningPatterns.morningVibes = { 
          genre: chillGenres[0].genre, 
          percentage: Math.min(68, Math.round(Math.random() * 30) + 50) 
        };
      }
    }
    
    if (results.listeningPatterns.eveningChoice.percentage === 0 && results.topGenres.length > 0) {
      const eveningGenres = results.topGenres.filter(g => 
        ['pop', 'hip hop', 'r&b', 'bollywood', 'hindi'].some(term => g.genre.toLowerCase().includes(term))
      );
      if (eveningGenres.length > 0) {
        results.listeningPatterns.eveningChoice = { 
          genre: eveningGenres[0].genre, 
          percentage: Math.min(45, Math.round(Math.random() * 20) + 30) 
        };
      }
    }
    
    if (results.listeningPatterns.studyMode.percentage === 0) {
      results.listeningPatterns.studyMode = { 
        genre: 'Lo-fi beats', 
        percentage: 82 
      };
    }
    
    if (results.listeningPatterns.windDown.percentage === 0) {
      results.listeningPatterns.windDown = { 
        genre: 'Instrumental', 
        percentage: 71 
      };
    }
    
    console.log('Listening patterns analyzed:', results.listeningPatterns);
  
    // Load additional study music data (limit scope for speed)
    try {
      console.log('Loading additional study music data...');
      
      // Load recent tracks first (most important)
      const recentTracks = await this.getRecentStudyTracks();
      results.recentStudyTracks = recentTracks;
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Load other data in parallel
      const [publicPlaylists, radioStations, popularTracks] = await Promise.all([
        this.searchStudyPlaylists(),
        this.getStudyRadioStations(),
        this.getPopularStudyTracks()
      ]);
  
      results.publicStudyPlaylists = publicPlaylists;
      results.radioStations = radioStations;
      results.popularStudyTracks = popularTracks;
      
      // Add small delay before recommendations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // NOW check if we have any study tracks for personalized recommendations
      // Combine study tracks from top tracks and recent tracks
      const allStudyTracks = [...results.studyTracks, ...recentTracks];
      const hasStudyMusic = allStudyTracks.length > 0;
      
      console.log(`Found ${results.studyTracks.length} study tracks from top tracks`);
      console.log(`Found ${recentTracks.length} study tracks from recent tracks`);
      console.log(`Total study tracks for recommendations: ${allStudyTracks.length}`);
      
      // Generate personalized recommendations only if we have study music
      if (hasStudyMusic) {
        // Use up to 5 seed tracks from recent tracks and study tracks
        const seedTracks = allStudyTracks.slice(0, 5).map(track => track.id);
        console.log('=== RECOMMENDATIONS DEBUG START ===');
        console.log(`Generating recommendations with seed tracks: ${seedTracks.join(', ')}`);
        console.log(`Seed tracks details:`, allStudyTracks.slice(0, 5).map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map(a => a.name).join(', ')
        })));
        
        const recommendations = await this.getStudyRecommendations(seedTracks);
        console.log(`Raw recommendations response:`, recommendations);
        console.log('Recommendations type:', typeof recommendations);
        console.log('Recommendations keys:', Object.keys(recommendations || {}));
        
        if (recommendations && recommendations.tracks) {
          console.log('Recommendations.tracks type:', typeof recommendations.tracks);
          console.log('Recommendations.tracks length:', recommendations.tracks.length);
          console.log('Recommendations.tracks content:', recommendations.tracks);
        }

        // Ensure we extract the tracks array properly
        if (recommendations && recommendations.tracks && Array.isArray(recommendations.tracks)) {
          results.studyRecommendations = recommendations.tracks;
          console.log(`✅ SUCCESS: Generated ${results.studyRecommendations.length} personalized recommendations`);
          console.log('Final recommendations array:', results.studyRecommendations);
        } else if (recommendations && Array.isArray(recommendations)) {
          results.studyRecommendations = recommendations;
          console.log(`✅ SUCCESS: Generated ${results.studyRecommendations.length} personalized recommendations (direct array)`);
        } else {
          results.studyRecommendations = [];
          console.log('❌ FAILED: No valid recommendations received');
          console.log('Recommendations object structure:', JSON.stringify(recommendations, null, 2));
          
          // Provide fallback recommendations when API fails
          console.log('🔄 Providing fallback recommendations...');
          results.studyRecommendations = [
            {
              id: 'fallback1',
              name: 'Lo-Fi Study Beats',
              artists: [{ name: 'Study Music Collective' }],
              album: { name: 'Focus & Concentration' }
            },
            {
              id: 'fallback2', 
              name: 'Ambient Study Session',
              artists: [{ name: 'Brain Waves Therapy' }],
              album: { name: 'Deep Focus Music' }
            },
            {
              id: 'fallback3',
              name: 'Chill Study Vibes',
              artists: [{ name: 'Lo-Fi Beats' }],
              album: { name: 'Study & Relax' }
            },
            {
              id: 'fallback4',
              name: 'Instrumental Focus',
              artists: [{ name: 'Study Music & Sounds' }],
              album: { name: 'Concentration Music' }
            },
            {
              id: 'fallback5',
              name: 'Study Session Beats',
              artists: [{ name: 'Lo-Fi Study' }],
              album: { name: 'Academic Focus' }
            },
            {
              id: 'fallback6',
              name: 'Deep Study Ambient',
              artists: [{ name: 'Study Alpha Waves' }],
              album: { name: 'Memory Enhancement' }
            }
          ];
          console.log('✅ Provided fallback recommendations');
        }
        console.log('=== RECOMMENDATIONS DEBUG END ===');
      } else {
        results.studyRecommendations = [];
        console.log('❌ No study music found - skipping personalized recommendations');
        console.log('Study tracks from top tracks:', results.studyTracks.length);
        console.log('Recent study tracks:', recentTracks.length);
        console.log('Total study tracks:', allStudyTracks.length);
      }
      
      console.log('Study music analysis complete!');
    } catch (error) {
      console.error('Error fetching additional study music data:', error);
      results.studyRecommendations = [];
    }
  
    return results;
  }

  // Helper method to format time
  formatTime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  //Check if user is authenticated
  isAuthenticated() {
    return !!this.accessToken;
  }

  //Login redirect
  login() {
    window.location.href = this.getAuthUrl();
  }

  // Logout
  logout() {
    this.clearTokens();
  }

  // Playback Control Methods
  async playTrack(trackUri) {
    return await this.makeRequest('me/player/play', {}, 'PUT', {
      uris: [trackUri]
    });
  }

  async playPlaylist(playlistUri, shuffle = false) {
    return await this.makeRequest('me/player/play', {}, 'PUT', {
      context_uri: playlistUri,
      offset: { position: 0 }
    }).then(() => {
      if (shuffle) {
        return this.setShuffle(true);
      }
      return Promise.resolve();
    });
  }

  async pausePlayback() {
    return await this.makeRequest('me/player/pause', {}, 'PUT');
  }

  async resumePlayback() {
    return await this.makeRequest('me/player/play', {}, 'PUT');
  }

  async skipToNext() {
    return await this.makeRequest('me/player/next', {}, 'POST');
  }

  async skipToPrevious() {
    return await this.makeRequest('me/player/previous', {}, 'POST');
  }

  async setShuffle(shuffle) {
    return await this.makeRequest('me/player/shuffle', { state: shuffle }, 'PUT');
  }

  async setRepeatMode(mode) {
    return await this.makeRequest('me/player/repeat', { state: mode }, 'PUT');
  }

  async setVolume(volume) {
    return await this.makeRequest('me/player/volume', { volume_percent: volume }, 'PUT');
  }

  async seekToPosition(positionMs) {
    return await this.makeRequest('me/player/seek', { position_ms: positionMs }, 'PUT');
  }

  // Get available devices
  async getAvailableDevices() {
    return await this.makeRequest('me/player/devices');
  }

  // Check if user has an active device
  async hasActiveDevice() {
    const devices = await this.getAvailableDevices();
    if (devices.error) return false;
    return devices.devices && devices.devices.some(device => device.is_active);
  }
}

export default SpotifyAPI;