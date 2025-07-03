import React, { useState, useEffect, useCallback } from "react";
import SpotifyAPI from "../components/spotifyapi";
import "../glow.css"; // For glow text
import "../orb.css";  // For orb backgrounds

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Loading Spinner Component
const LoadingSpinner = ({ size = "medium", text = "Loading..." }) => {
  const spinnerSizes = {
    small: { width: "20px", height: "20px" },
    medium: { width: "30px", height: "30px" },
    large: { width: "40px", height: "40px" }
  };

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center",
      padding: "20px"
    }}>
      <div
        style={{
          ...spinnerSizes[size],
          border: "3px solid #1e2a45",
          borderTop: "3px solid #1db954",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "12px"
        }}
      />
      <span style={{ 
        color: "#b3b3b3", 
        fontSize: "0.9rem",
        textAlign: "center"
      }}>
        {text}
      </span>
    </div>
  );
};

export default function SpotifyDashboard() {
  const [api] = useState(new SpotifyAPI());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [topTracks, setTopTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [studyMusicData, setStudyMusicData] = useState(null);
  const greeting = getGreeting();

  const checkAuthentication = useCallback(async () => {
    if (api.isAuthenticated()) {
      const profile = await api.getUserProfile();
      if (profile && !profile.error) {
        setIsAuthenticated(true);
        setUserProfile(profile);
        loadDashboardData();
      } else {
        api.clearTokens();
        setIsAuthenticated(false);
      }
    }
    setLoading(false);
  }, [api]);

  const handleAuthCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      setLoading(true);
      const success = await api.handleCallback(code);
      if (success) {
        window.history.replaceState({}, document.title, '/');
        setIsAuthenticated(true);
        const profile = await api.getUserProfile();
        setUserProfile(profile);
        loadDashboardData();
      }
      setLoading(false);
    }
  }, [api]);

  const loadDashboardData = useCallback(async () => {
    try {
      console.log('🚀 Starting to load dashboard data...');
      
      const [currentlyPlaying, tracks, userPlaylists] = await Promise.all([
        api.getCurrentlyPlaying(),
        api.getTopTracks('short_term', 10),
        api.getUserPlaylists(10)
      ]);
  
      console.log('✅ Basic data loaded:', {
        currentlyPlaying: !!currentlyPlaying,
        tracks: tracks.items?.length || 0,
        playlists: userPlaylists.items?.length || 0
      });
  
      setCurrentTrack(currentlyPlaying);
      setTopTracks(tracks.items || []);
      setPlaylists(userPlaylists.items || []);
      
      // Load study music data
      console.log('🎵 About to analyze study music...');
      const studyData = await api.analyzeStudyMusic();
      console.log('🎵 Study music analysis complete:', studyData);
      setStudyMusicData(studyData);
    } catch (error) {
      console.error('❌ Error loading dashboard data:', error);
    }
  }, [api]);

  useEffect(() => {
    checkAuthentication();
    handleAuthCallback();
  }, [checkAuthentication, handleAuthCallback]);

  const formatTime = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (loading) {
    return (
      <div style={{ position: "relative", zIndex: 0 }}>
        {/* Background Orbs */}
        <div className="orb purple" style={{ top: "10%", left: "5%" }}></div>
        <div className="orb blue" style={{ bottom: "10%", right: "10%" }}></div>
        <div className="orb green" style={{ top: "50%", right: "5%" }}></div>
        <div className="orb white" style={{ bottom: "20%", left: "15%" }}></div>

        <div
          style={{
            backgroundColor: "#0b1426",
            color: "white",
            minHeight: "100vh",
            padding: "40px",
            fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h2 className="glow-title" style={{ fontSize: "2rem", marginBottom: "1rem" }}>
              🎵 Loading Spotify Data...
            </h2>
            <LoadingSpinner size="large" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ position: "relative", zIndex: 0 }}>
        {/* Background Orbs */}
        <div className="orb purple" style={{ top: "10%", left: "5%" }}></div>
        <div className="orb blue" style={{ bottom: "10%", right: "10%" }}></div>
        <div className="orb green" style={{ top: "50%", right: "5%" }}></div>
        <div className="orb white" style={{ bottom: "20%", left: "15%" }}></div>

        <div
          style={{
            backgroundColor: "#0b1426",
            color: "white",
            minHeight: "100vh",
            padding: "40px",
            fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div style={{ 
            textAlign: "center",
            background: "rgba(28, 37, 59, 0.8)",
            padding: "3rem",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
          }}>
            <h1 className="glow-title" style={{ fontSize: "3rem", marginBottom: "1rem" }}>
              🎵 Spotify Dashboard
            </h1>
            <p style={{ fontSize: "1.2rem", marginBottom: "2rem", color: "#b3b3b3" }}>
              Connect your Spotify account to get started
            </p>
            <button 
              onClick={() => api.login()}
              style={{
                background: "#1db954",
                color: "white",
                border: "none",
                padding: "1rem 2rem",
                fontSize: "1.2rem",
                borderRadius: "50px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(29, 185, 84, 0.3)"
              }}
              onMouseOver={(e) => {
                e.target.style.background = "#1ed760";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(29, 185, 84, 0.4)";
              }}
              onMouseOut={(e) => {
                e.target.style.background = "#1db954";
                e.target.style.transform = "translateY(0px)";
                e.target.style.boxShadow = "0 4px 15px rgba(29, 185, 84, 0.3)";
              }}
            >
              🔑 Login with Spotify
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", zIndex: 0 }}>
      {/* Background Orbs */}
      <div className="orb purple" style={{ top: "10%", left: "5%" }}></div>
      <div className="orb blue" style={{ bottom: "10%", right: "10%" }}></div>
      <div className="orb green" style={{ top: "50%", right: "5%" }}></div>
      <div className="orb white" style={{ bottom: "20%", left: "15%" }}></div>

      {/* Dashboard UI */}
      <div
        style={{
          backgroundColor: "#0b1426",
          color: "white",
          minHeight: "100vh",
          padding: "40px",
          fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1
            className="glow-title"
            style={{
              fontSize: "2.5rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "16px",
              margin: 0,
            }}
          >
            <img src="/spotify-logo.png" alt="Spotify Logo" style={{ height: "48px" }} />
            Spotify Dashboard
          </h1>
          
          {userProfile && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ color: "#1db954" }}>{greeting}, {userProfile.display_name}! 👋</span>
              <button 
                onClick={() => {
                  api.logout();
                  setIsAuthenticated(false);
                  setUserProfile(null);
                }}
                style={{
                  background: "transparent",
                  color: "#b3b3b3",
                  border: "1px solid #b3b3b3",
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => {
                  e.target.style.color = "white";
                  e.target.style.borderColor = "white";
                }}
                onMouseOut={(e) => {
                  e.target.style.color = "#b3b3b3";
                  e.target.style.borderColor = "#b3b3b3";
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Profile & Now Playing */}
        <div style={{ display: "flex", gap: "32px", marginBottom: "48px" }}>
          <div
            style={{
              flex: 1,
              background: "#1c253b",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>Profile</h3>
            {userProfile ? (
              <>
                <p style={{ marginBottom: "8px" }}><strong>Name:</strong> {userProfile.display_name || 'N/A'}</p>
                <p style={{ marginBottom: "8px" }}><strong>Email:</strong> {userProfile.email || 'N/A'}</p>
                <p style={{ marginBottom: "8px" }}><strong>Country:</strong> {userProfile.country || 'N/A'}</p>
                <p><strong>Followers:</strong> {userProfile.followers?.total?.toLocaleString() || 0}</p>
                <p style={{ marginTop: "8px", color: "#1db954" }}><strong>Subscription:</strong> {userProfile.product || 'N/A'}</p>
              </>
            ) : (
              <LoadingSpinner text="Loading profile..." />
            )}
          </div>

          <div
            style={{
              flex: 2,
              background: "#1c253b",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>Now Playing</h3>
            {currentTrack && currentTrack.item ? (
              <>
                <p style={{ marginBottom: "8px" }}><strong>Track:</strong> {currentTrack.item.name}</p>
                <p style={{ marginBottom: "8px" }}><strong>Artist:</strong> {currentTrack.item.artists.map(a => a.name).join(', ')}</p>
                <p style={{ marginBottom: "8px" }}><strong>Album:</strong> {currentTrack.item.album.name}</p>
                <p style={{ color: "#1db954" }}><strong>Playing:</strong> {currentTrack.is_playing ? '▶️ Yes' : '⏸️ Paused'}</p>
              </>
            ) : (
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center",
                padding: "20px"
              }}>
                <span style={{ fontSize: "2rem", marginBottom: "8px" }}>🎵</span>
                <span style={{ color: "#b3b3b3", fontStyle: "italic" }}>No music currently playing</span>
              </div>
            )}
          </div>
        </div>

        {/* Analytics Section */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "32px",
            marginBottom: "48px"
          }}
        >
          {/* Study Music Stats */}
          <div
            style={{
              background: "#1e2a45",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>📚 Study Music Stats</h3>
            {studyMusicData ? (
              <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                <li style={{ marginBottom: "8px" }}>
                  📚 <strong>{studyMusicData.studyPlaylists.length}</strong> Study/Work playlists
                </li>
                <li style={{ marginBottom: "8px" }}>
                  🎵 <strong>{studyMusicData.lofiPlaylists.length}</strong> Lo-Fi playlists
                </li>
                <li style={{ marginBottom: "8px" }}>
                  🌊 <strong>{studyMusicData.ambientPlaylists.length}</strong> Ambient/Chill playlists
                </li>
                <li style={{ marginBottom: "8px" }}>
                  🎧 <strong>{studyMusicData.studyTracks.length}</strong> Instrumental tracks in your top songs
                </li>
                <li>
                  ⏱️ <strong>{formatTime(studyMusicData.totalStudyTime)}</strong> Total study playlist time
                </li>
              </ul>
            ) : (
              <LoadingSpinner text="Analyzing study music..." />
            )}
          </div>

          {/* Your Playlists */}
          <div
            style={{
              background: "#1e2a45",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>📚 Your Playlists</h3>
            {playlists.length > 0 ? (
              <div style={{ 
                maxHeight: "300px", 
                overflowY: "auto", 
                paddingRight: "8px",
                scrollbarWidth: "thin",
                scrollbarColor: "#1db954 #1e2a45"
              }}>
                <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                  {playlists.slice(0, 10).map((playlist, index) => (
                    <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                          {index + 1}.
                        </span>
                        <strong>{playlist.name}</strong>
                        <br />
                        <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                          🎵 {playlist.tracks.total} tracks • ⏱️ {playlist.formattedDuration || '0m'} • By {playlist.owner.display_name}
                        </span>
                      </div>
                    </li>
                  ))}
                  {playlists.length > 10 && (
                    <li style={{ color: "#1db954", fontStyle: "italic" }}>
                      + {playlists.length - 10} more playlists
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <LoadingSpinner text="Loading playlists..." />
            )}
          </div>

          {/* Listening Trends */}
          <div
            style={{
              background: "#1e2a45",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>📊 Listening Behavior Patterns</h3>
            {studyMusicData ? (
              <div style={{ 
                maxHeight: "300px", 
                overflowY: "auto", 
                paddingRight: "8px",
                scrollbarWidth: "thin",
                scrollbarColor: "#1db954 #1e2a45"
              }}>
                <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                  {/* Show listening behavior patterns */}
                  {studyMusicData.listeningPatterns ? (
                    <>
                      <li style={{ marginBottom: "8px" }}>
                        🌅 <strong>Morning vibes:</strong> {studyMusicData.listeningPatterns.morningVibes.genre} ({studyMusicData.listeningPatterns.morningVibes.percentage}%)
                      </li>
                      <li style={{ marginBottom: "8px" }}>
                        🌆 <strong>Evening choice:</strong> {studyMusicData.listeningPatterns.eveningChoice.genre} ({studyMusicData.listeningPatterns.eveningChoice.percentage}%)
                      </li>
                      <li style={{ marginBottom: "8px" }}>
                        📚 <strong>Study mode:</strong> {studyMusicData.listeningPatterns.studyMode.genre} ({studyMusicData.listeningPatterns.studyMode.percentage}%)
                      </li>
                      <li style={{ marginBottom: "8px" }}>
                        💤 <strong>Wind-down:</strong> {studyMusicData.listeningPatterns.windDown.genre} ({studyMusicData.listeningPatterns.windDown.percentage}%)
                      </li>
                      <li style={{ marginBottom: "8px" }}>
                        🔄 <strong>Most replayed:</strong> {studyMusicData.listeningPatterns.mostReplayed.type}
                      </li>
                    </>
                  ) : (
                    // Fallback to top genres if no patterns found
                    studyMusicData.topGenres && studyMusicData.topGenres.length > 0 ? (
                      studyMusicData.topGenres.slice(0, 5).map((genreData, index) => (
                        <li key={genreData.genre} style={{ marginBottom: "8px" }}>
                          🎭 <strong>{genreData.genre.charAt(0).toUpperCase() + genreData.genre.slice(1)}:</strong> {genreData.formattedTime}
                        </li>
                      ))
                    ) : (
                      // Final fallback to study music stats
                      Object.entries(studyMusicData.genreStats).map(([genre, duration]) => {
                        if (duration > 0) {
                          return (
                            <li key={genre} style={{ marginBottom: "8px" }}>
                              🎭 <strong>{genre.charAt(0).toUpperCase() + genre.slice(1)}:</strong> {formatTime(duration)}
                            </li>
                          );
                        }
                        return null;
                      })
                    )
                  )}
                  
                  {/* Show message if no trends found */}
                  {(!studyMusicData.listeningPatterns || 
                    (studyMusicData.listeningPatterns.morningVibes.percentage === 0 && 
                     studyMusicData.listeningPatterns.eveningChoice.percentage === 0)) &&
                   (!studyMusicData.topGenres || studyMusicData.topGenres.length === 0) && 
                   Object.values(studyMusicData.genreStats).every(duration => duration === 0) && (
                    <li style={{ color: "#b3b3b3", fontStyle: "italic" }}>
                      💡 Listen to more music to see your listening patterns!
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <LoadingSpinner text="Analyzing listening patterns..." />
            )}
          </div>

          {/* Top Tracks */}
          <div
            style={{
              background: "#1e2a45",
              padding: "24px",
              borderRadius: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>🎵 Your Top Tracks</h3>
            {topTracks.length > 0 ? (
              <div style={{ 
                maxHeight: "300px", 
                overflowY: "auto", 
                paddingRight: "8px",
                scrollbarWidth: "thin",
                scrollbarColor: "#1db954 #1e2a45"
              }}>
                <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                  {topTracks.slice(0, 10).map((track, index) => (
                    <li key={track.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                          {index + 1}.
                        </span>
                        <strong>{track.name}</strong>
                        <br />
                        <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                          by {track.artists.map(a => a.name).join(', ')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <LoadingSpinner text="Loading your top tracks..." />
            )}
          </div>
        </div>

        {/* Study Music Recommendations Section */}
        {studyMusicData && (
          <div style={{ marginBottom: "48px" }}>
            <h2 className="glow-title" style={{ fontSize: "2rem", marginBottom: "32px", textAlign: "center" }}>
              🎯 Study Music Recommendations
            </h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "32px" }}>
              
              {/* Personalized Recommendations */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  🎯 Personalized Recommendations
                </h3>
                {studyMusicData.studyRecommendations.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {studyMusicData.studyRecommendations.slice(0, 10).map((track, index) => (
                        <li key={track.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{track.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              by {track.artists.map(a => a.name).join(', ')}
                            </span>
                            <br />
                            <span style={{ color: "#888", fontSize: "0.8rem" }}>
                              💿 {track.album.name}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    justifyContent: "center",
                    padding: "20px"
                  }}>
                    <span style={{ fontSize: "2rem", marginBottom: "8px" }}>🎯</span>
                    <span style={{ color: "#b3b3b3", textAlign: "center" }}>
                      No personalized recommendations yet.<br />
                      Listen to more study music!
                    </span>
                  </div>
                )}
              </div>

              {/* Recent Study Tracks */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  📚 Recent Study Tracks
                </h3>
                {studyMusicData.recentStudyTracks.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {studyMusicData.recentStudyTracks.slice(0, 10).map((track, index) => (
                        <li key={track.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{track.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              by {track.artists.map(a => a.name).join(', ')}
                            </span>
                            <br />
                            <span style={{ color: "#888", fontSize: "0.8rem" }}>
                              📊 In {track.playCount} study playlist{track.playCount > 1 ? 's' : ''} • 💿 {track.album.name}
                            </span>
                            {track.playlists && track.playlists.length > 0 && (
                              <>
                                <br />
                                <span style={{ color: "#666", fontSize: "0.75rem" }}>
                                  📚 From: {track.playlists.slice(0, 2).join(', ')}{track.playlists.length > 2 ? '...' : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    justifyContent: "center",
                    padding: "20px"
                  }}>
                    <span style={{ fontSize: "2rem", marginBottom: "8px" }}>📚</span>
                    <span style={{ color: "#b3b3b3", textAlign: "center" }}>
                      No study tracks found in your playlists.<br />
                      Add some study music to your playlists!
                    </span>
                  </div>
                )}
              </div>

              {/* Popular Study Tracks */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  🔥 Popular Study Tracks
                </h3>
                {studyMusicData.popularStudyTracks.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {studyMusicData.popularStudyTracks.slice(0, 10).map((track, index) => (
                        <li key={track.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{track.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              by {track.artists.map(a => a.name).join(', ')}
                            </span>
                            <br />
                            <span style={{ color: "#888", fontSize: "0.8rem" }}>
                              📈 Popularity: {track.popularity}/100
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <LoadingSpinner text="Loading popular study tracks..." />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Study Playlists & Radio Section */}
        {studyMusicData && (
          <div style={{ marginBottom: "48px" }}>
            <h2 className="glow-title" style={{ fontSize: "2rem", marginBottom: "32px", textAlign: "center" }}>
              📚 Study Playlists & Radio
            </h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "32px" }}>
              
              {/* Your Study Playlists */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  📚 Study Playlists
                </h3>
                {studyMusicData.studyPlaylists.length > 0 || studyMusicData.lofiPlaylists.length > 0 || studyMusicData.ambientPlaylists.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {/* Study/Work playlists */}
                      {studyMusicData.studyPlaylists.slice(0, 10).map((playlist, index) => (
                        <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{playlist.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              🎵 {playlist.tracks.total} tracks • ⏱️ {playlist.formattedDuration || '0m'} • By {playlist.owner.display_name}
                            </span>
                          </div>
                        </li>
                      ))}
                      
                      {/* Lo-Fi playlists */}
                      {studyMusicData.lofiPlaylists.slice(0, 10).map((playlist, index) => (
                        <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {studyMusicData.studyPlaylists.length + index + 1}.
                            </span>
                            <strong>{playlist.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              🎵 {playlist.tracks.total} tracks • ⏱️ {playlist.formattedDuration || '0m'} • By {playlist.owner.display_name}
                            </span>
                          </div>
                        </li>
                      ))}
                      
                      {/* Ambient playlists */}
                      {studyMusicData.ambientPlaylists.slice(0, 10).map((playlist, index) => (
                        <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {studyMusicData.studyPlaylists.length + studyMusicData.lofiPlaylists.length + index + 1}.
                            </span>
                            <strong>{playlist.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              🎵 {playlist.tracks.total} tracks • ⏱️ {playlist.formattedDuration || '0m'} • By {playlist.owner.display_name}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    justifyContent: "center",
                    padding: "20px"
                  }}>
                    <span style={{ fontSize: "2rem", marginBottom: "8px" }}>📚</span>
                    <span style={{ color: "#b3b3b3", textAlign: "center" }}>
                      No study playlists found.<br />
                      Create some study playlists to see them here!
                    </span>
                  </div>
                )}
              </div>

              {/* Public Study Playlists */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  🌍 Popular Study Playlists
                </h3>
                {studyMusicData.publicStudyPlaylists.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {studyMusicData.publicStudyPlaylists.slice(0, 10).map((playlist, index) => (
                        <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{playlist.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              🎵 {playlist.tracks.total} tracks • By {playlist.owner.display_name}
                            </span>
                            {playlist.description && (
                              <>
                                <br />
                                <span style={{ color: "#888", fontSize: "0.8rem" }}>
                                  📝 {playlist.description.length > 80 ? playlist.description.substring(0, 80) + '...' : playlist.description}
                                </span>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <LoadingSpinner text="Loading popular study playlists..." />
                )}
              </div>

              {/* Radio Stations */}
              <div
                style={{
                  background: "#1e2a45",
                  padding: "24px",
                  borderRadius: "20px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "16px" }}>
                  📻 Study Radio Stations
                </h3>
                {studyMusicData.radioStations.length > 0 ? (
                  <div style={{ 
                    maxHeight: "400px", 
                    overflowY: "auto", 
                    paddingRight: "8px",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#1db954 #1e2a45"
                  }}>
                    <ul style={{ lineHeight: 1.75, listStyle: "none", padding: 0 }}>
                      {studyMusicData.radioStations.slice(0, 10).map((playlist, index) => (
                        <li key={playlist.id} style={{ marginBottom: "12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>
                              {index + 1}.
                            </span>
                            <strong>{playlist.name}</strong>
                            <br />
                            <span style={{ color: "#b3b3b3", fontSize: "0.9rem" }}>
                              🎵 {playlist.tracks.total} tracks • By {playlist.owner.display_name}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <LoadingSpinner text="Loading radio stations..." />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}