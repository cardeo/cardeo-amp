import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EQ_GAIN_MIN = -12;
const EQ_GAIN_MAX = 12;
const STORAGE_KEY = 'cardeoAmpSavedPlaylists';
const VISUALIZATION_MODES = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'radial', label: 'Radial' },
];
const EQ_BANDS = [
  { frequency: 60, label: '60 Hz' },
  { frequency: 170, label: '170 Hz' },
  { frequency: 350, label: '350 Hz' },
  { frequency: 1000, label: '1 kHz' },
  { frequency: 3500, label: '3.5 kHz' },
  { frequency: 10000, label: '10 kHz' },
];

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
};

const createTrackSignature = (file) =>
  `${file.name}:${file.size}:${file.lastModified}:${file.type}`;

const createTrackFromFile = (file) => ({
  id: `${createTrackSignature(file)}:${crypto.randomUUID()}`,
  lastModified: file.lastModified,
  name: file.name,
  signature: createTrackSignature(file),
  size: file.size,
  type: file.type,
  url: URL.createObjectURL(file),
});

const toSavedTrack = (track) => ({
  lastModified: track.lastModified,
  name: track.name,
  signature: track.signature,
  size: track.size,
  type: track.type,
});

const loadSavedPlaylists = () => {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    const parsed = storedValue ? JSON.parse(storedValue) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const createAudioEngine = (audio) => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const dryGain = context.createGain();
  const eqGain = context.createGain();
  const analyser = context.createAnalyser();
  const filters = EQ_BANDS.map(({ frequency }) => {
    const filter = context.createBiquadFilter();

    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    filter.gain.value = 0;

    return filter;
  });

  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.86;
  dryGain.gain.value = 1;
  eqGain.gain.value = 0;

  source.connect(analyser);
  source.connect(dryGain);
  dryGain.connect(context.destination);
  source.connect(filters[0]);
  filters.forEach((filter, index) => {
    filter.connect(filters[index + 1] ?? eqGain);
  });
  eqGain.connect(context.destination);

  return {
    analyser,
    context,
    dryGain,
    eqGain,
    filters,
    source,
  };
};

const applyEqSettings = (engine, isEnabled, gains) => {
  if (!engine) {
    return;
  }

  const now = engine.context.currentTime;

  engine.dryGain.gain.setTargetAtTime(isEnabled ? 0 : 1, now, 0.015);
  engine.eqGain.gain.setTargetAtTime(isEnabled ? 1 : 0, now, 0.015);
  engine.filters.forEach((filter, index) => {
    filter.gain.setTargetAtTime(isEnabled ? gains[index] : 0, now, 0.015);
  });
};

function VisualizationCanvas({ analyserRef, isPlaying, mode }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const smoothedSpectrumRef = useRef([]);
  const smoothedRadialRef = useRef(0);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return undefined;
    }

    let width = 0;
    let height = 0;
    let frequencyData = new Uint8Array(0);
    let waveformData = new Uint8Array(0);

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawBackground = () => {
      context.fillStyle = '#050505';
      context.fillRect(0, 0, width, height);

      const gradient = context.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.74,
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const drawSpectrum = (analyser, hasLiveAudio) => {
      const barCount = Math.max(36, Math.min(96, Math.floor(width / 18)));
      const binStep = Math.max(1, Math.floor(frequencyData.length / barCount));
      const gap = Math.max(3, width * 0.0025);
      const barWidth = Math.max(3, (width - gap * (barCount - 1)) / barCount);
      const baseline = height * 0.72;
      const maxHeight = height * 0.52;

      if (hasLiveAudio) {
        analyser.getByteFrequencyData(frequencyData);
      }

      if (smoothedSpectrumRef.current.length !== barCount) {
        smoothedSpectrumRef.current = Array(barCount).fill(0);
      }

      context.fillStyle = 'rgba(245, 245, 245, 0.82)';
      for (let index = 0; index < barCount; index += 1) {
        const start = index * binStep;
        const end = Math.min(start + binStep, frequencyData.length);
        let total = 0;

        for (let bin = start; bin < end; bin += 1) {
          total += hasLiveAudio ? frequencyData[bin] : 0;
        }

        const average = total / Math.max(1, end - start);
        const shaped = Math.pow(average / 255, 1.35);
        const target = hasLiveAudio ? Math.max(5, shaped * maxHeight) : 3;
        const smoothed = smoothedSpectrumRef.current[index] * 0.76 + target * 0.24;
        const x = index * (barWidth + gap);
        const y = baseline - smoothed;

        smoothedSpectrumRef.current[index] = smoothed;
        context.globalAlpha = 0.32 + shaped * 0.58;
        context.beginPath();
        context.roundRect(x, y, barWidth, smoothed, barWidth / 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const drawWaveform = (analyser, hasLiveAudio) => {
      if (hasLiveAudio) {
        analyser.getByteTimeDomainData(waveformData);
      } else {
        waveformData.fill(128);
      }

      const centerY = height * 0.5;
      const amplitude = height * 0.32;
      const sliceWidth = width / Math.max(1, waveformData.length - 1);

      context.lineWidth = Math.max(1.5, width * 0.0018);
      context.strokeStyle = 'rgba(246, 246, 246, 0.82)';
      context.beginPath();

      waveformData.forEach((value, index) => {
        const x = index * sliceWidth;
        const normalized = (value - 128) / 128;
        const y = centerY + normalized * amplitude;

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });

      context.stroke();

      context.strokeStyle = 'rgba(246, 246, 246, 0.08)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, centerY);
      context.lineTo(width, centerY);
      context.stroke();
    };

    const drawRadial = (analyser, hasLiveAudio) => {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.18;
      const points = 160;

      if (hasLiveAudio) {
        analyser.getByteFrequencyData(frequencyData);
      }

      const bassBins = Math.max(4, Math.floor(frequencyData.length * 0.08));
      let bassTotal = 0;

      for (let index = 0; index < bassBins; index += 1) {
        bassTotal += hasLiveAudio ? frequencyData[index] : 0;
      }

      const bassEnergy = bassTotal / Math.max(1, bassBins) / 255;
      smoothedRadialRef.current = smoothedRadialRef.current * 0.82 + bassEnergy * 0.18;

      context.strokeStyle = 'rgba(246, 246, 246, 0.74)';
      context.lineWidth = Math.max(1.4, Math.min(width, height) * 0.002);
      context.beginPath();

      for (let point = 0; point <= points; point += 1) {
        const angle = (point / points) * Math.PI * 2;
        const binIndex = Math.floor((point / points) * frequencyData.length);
        const frequencyEnergy = hasLiveAudio ? frequencyData[binIndex] / 255 : 0;
        const pulse =
          smoothedRadialRef.current * radius * 0.72 +
          Math.pow(frequencyEnergy, 1.4) * radius * 0.42;
        const currentRadius = radius + pulse;
        const x = centerX + Math.cos(angle) * currentRadius;
        const y = centerY + Math.sin(angle) * currentRadius;

        if (point === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.closePath();
      context.stroke();

      context.fillStyle = `rgba(246, 246, 246, ${0.025 + smoothedRadialRef.current * 0.06})`;
      context.beginPath();
      context.arc(centerX, centerY, radius * (1 + smoothedRadialRef.current * 0.28), 0, Math.PI * 2);
      context.fill();
    };

    const draw = () => {
      const analyser = analyserRef.current;
      const hasAnalyser = Boolean(analyser);
      const hasLiveAudio = hasAnalyser && isPlayingRef.current;

      if (hasAnalyser && frequencyData.length !== analyser.frequencyBinCount) {
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        waveformData = new Uint8Array(analyser.fftSize);
      }

      drawBackground();

      if (modeRef.current === 'waveform') {
        drawWaveform(analyser, hasLiveAudio);
      } else if (modeRef.current === 'radial') {
        drawRadial(analyser, hasLiveAudio);
      } else {
        drawSpectrum(analyser, hasLiveAudio);
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    resizeCanvas();
    draw();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [analyserRef]);

  return <canvas className="visualization-canvas" ref={canvasRef} aria-hidden="true" />;
}

function EqualizerPanel({
  eqGains,
  isEqEnabled,
  onEqGainChange,
  onToggleEq,
}) {
  const updateGainFromPointer = (event, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    const ratio = 1 - position / rect.height;
    const rawGain = EQ_GAIN_MIN + ratio * (EQ_GAIN_MAX - EQ_GAIN_MIN);

    onEqGainChange(index, Math.round(rawGain));
  };

  const handleSliderKeyDown = (event, index) => {
    const currentGain = eqGains[index];
    let nextGain = currentGain;

    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      nextGain = currentGain + 1;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      nextGain = currentGain - 1;
    } else if (event.key === 'Home') {
      nextGain = EQ_GAIN_MIN;
    } else if (event.key === 'End') {
      nextGain = EQ_GAIN_MAX;
    } else {
      return;
    }

    event.preventDefault();
    onEqGainChange(index, Math.min(Math.max(nextGain, EQ_GAIN_MIN), EQ_GAIN_MAX));
  };

  return (
    <section className="drawer-section" aria-labelledby="eq-title">
      <div className="section-heading">
        <h2 id="eq-title">Equalizer</h2>
        <button
          className={`pill-button ${isEqEnabled ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleEq}
          aria-pressed={isEqEnabled}
        >
          EQ {isEqEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="eq-sliders">
        {EQ_BANDS.map((band, index) => (
          <div className="eq-band" key={band.frequency}>
            <span className="eq-gain">{eqGains[index]} dB</span>
            <span
              aria-label={`${band.label} equalizer gain`}
              aria-valuemax={EQ_GAIN_MAX}
              aria-valuemin={EQ_GAIN_MIN}
              aria-valuenow={eqGains[index]}
              aria-valuetext={`${eqGains[index]} dB`}
              className="eq-slider"
              onKeyDown={(event) => handleSliderKeyDown(event, index)}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updateGainFromPointer(event, index);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) {
                  updateGainFromPointer(event, index);
                }
              }}
              role="slider"
              tabIndex="0"
            >
              <span
                className="eq-slider-fill"
                style={{
                  height: `${((eqGains[index] - EQ_GAIN_MIN) /
                    (EQ_GAIN_MAX - EQ_GAIN_MIN)) *
                    100}%`,
                }}
              />
              <span
                className="eq-slider-thumb"
                style={{
                  bottom: `${((eqGains[index] - EQ_GAIN_MIN) /
                    (EQ_GAIN_MAX - EQ_GAIN_MIN)) *
                    100}%`,
                }}
              />
            </span>
            <span className="eq-label">{band.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const audioRef = useRef(null);
  const audioEngineRef = useRef(null);
  const analyserRef = useRef(null);
  const playlistRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const eqGainsRef = useRef(EQ_BANDS.map(() => 0));
  const isEqEnabledRef = useRef(false);
  const isUserSeekingRef = useRef(false);
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [isEqEnabled, setIsEqEnabled] = useState(false);
  const [eqGains, setEqGains] = useState(() => EQ_BANDS.map(() => 0));
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [visualizationMode, setVisualizationMode] = useState('spectrum');
  const [savedPlaylists, setSavedPlaylists] = useState(loadSavedPlaylists);
  const [playlistName, setPlaylistName] = useState('My local playlist');
  const [playlistNotice, setPlaylistNotice] = useState('');

  const currentTrack = playlist[currentIndex];
  const hasTrack = Boolean(currentTrack);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    eqGainsRef.current = eqGains;
  }, [eqGains]);

  useEffect(() => {
    isEqEnabledRef.current = isEqEnabled;
  }, [isEqEnabled]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlaylists));
  }, [savedPlaylists]);

  useEffect(() => {
    return () => {
      playlistRef.current.forEach((track) => URL.revokeObjectURL(track.url));
      if (audioEngineRef.current) {
        audioEngineRef.current.source.disconnect();
        audioEngineRef.current.analyser.disconnect();
        audioEngineRef.current.dryGain.disconnect();
        audioEngineRef.current.eqGain.disconnect();
        audioEngineRef.current.filters.forEach((filter) => filter.disconnect());
        audioEngineRef.current.context.close();
      }
    };
  }, []);

  const ensureAudioEngine = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      return null;
    }

    if (!audioEngineRef.current) {
      audioEngineRef.current = createAudioEngine(audio);
      analyserRef.current = audioEngineRef.current.analyser;
      applyEqSettings(audioEngineRef.current, isEqEnabledRef.current, eqGainsRef.current);
    }

    if (audioEngineRef.current.context.state === 'suspended') {
      await audioEngineRef.current.context.resume();
    }

    return audioEngineRef.current;
  }, []);

  const loadTrack = useCallback(
    async (index, shouldPlay = false) => {
      const track = playlistRef.current[index];
      const audio = audioRef.current;

      if (!track || !audio) {
        return;
      }

      audio.pause();
      audio.src = track.url;
      audio.load();
      audio.volume = volume;
      setCurrentIndex(index);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);

      if (shouldPlay) {
        try {
          await ensureAudioEngine();
          await audio.play();
        } catch {
          setIsPlaying(false);
        }
      }
    },
    [ensureAudioEngine, volume],
  );

  const appendFiles = useCallback(
    (fileList) => {
      const audioFiles = Array.from(fileList).filter(
        (file) => file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3'),
      );

      if (audioFiles.length === 0) {
        return;
      }

      const newTracks = audioFiles.map(createTrackFromFile);
      const shouldLoadFirstTrack = playlistRef.current.length === 0;

      setPlaylist((existingTracks) => [...existingTracks, ...newTracks]);
      setPlaylistNotice('');

      if (shouldLoadFirstTrack) {
        playlistRef.current = newTracks;
        loadTrack(0, false);
      }
    },
    [loadTrack],
  );

  const handleFileChange = (event) => {
    appendFiles(event.target.files ?? []);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    appendFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!hasTrack || !audio) {
      setActiveDrawer('playlist');
      return;
    }

    if (audio.paused) {
      try {
        await ensureAudioEngine();
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const getNextTrackIndex = useCallback(() => {
    const tracks = playlistRef.current;
    const current = currentIndexRef.current;

    if (tracks.length === 0 || current < 0) {
      return -1;
    }

    if (!isShuffleEnabled) {
      const nextIndex = current + 1;
      return nextIndex < tracks.length ? nextIndex : -1;
    }

    if (tracks.length === 1) {
      return current;
    }

    let randomIndex = current;

    while (randomIndex === current) {
      randomIndex = Math.floor(Math.random() * tracks.length);
    }

    return randomIndex;
  }, [isShuffleEnabled]);

  const playTrack = (index) => {
    loadTrack(index, true);
  };

  const playNextTrack = () => {
    const nextIndex = getNextTrackIndex();

    if (nextIndex >= 0) {
      loadTrack(nextIndex, true);
    }
  };

  const playPreviousTrack = () => {
    const previousIndex = currentIndexRef.current - 1;

    if (previousIndex >= 0) {
      loadTrack(previousIndex, true);
    }
  };

  const handleSeek = (event) => {
    const audio = audioRef.current;
    const requestedTime = Number(event.target.value);

    if (!audio || !Number.isFinite(requestedTime) || !Number.isFinite(audio.duration)) {
      return;
    }

    isUserSeekingRef.current = true;
    audio.currentTime = Math.min(Math.max(requestedTime, 0), audio.duration);
    setCurrentTime(audio.currentTime);
  };

  const handleVolumeChange = (event) => {
    const nextVolume = Number(event.target.value);

    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
    }
    setVolume(nextVolume);
  };

  const updateEqGain = (index, nextGain) => {
    const boundedGain = Math.min(Math.max(nextGain, EQ_GAIN_MIN), EQ_GAIN_MAX);
    const engine = audioEngineRef.current;

    setEqGains((currentGains) => {
      const nextGains = currentGains.map((gain, gainIndex) =>
        gainIndex === index ? boundedGain : gain,
      );
      eqGainsRef.current = nextGains;
      return nextGains;
    });

    if (engine) {
      engine.filters[index].gain.setTargetAtTime(
        isEqEnabledRef.current ? boundedGain : 0,
        engine.context.currentTime,
        0.015,
      );
    }
  };

  const toggleEq = async () => {
    const nextIsEnabled = !isEqEnabledRef.current;
    const engine = await ensureAudioEngine();

    isEqEnabledRef.current = nextIsEnabled;
    setIsEqEnabled(nextIsEnabled);
    applyEqSettings(engine, nextIsEnabled, eqGainsRef.current);
  };

  const savePlaylist = () => {
    const trimmedName = playlistName.trim();

    if (!trimmedName || playlist.length === 0) {
      setPlaylistNotice('Add local files and name the playlist before saving.');
      return;
    }

    const savedPlaylist = {
      id: crypto.randomUUID(),
      name: trimmedName,
      savedAt: new Date().toISOString(),
      tracks: playlist.map(toSavedTrack),
    };

    setSavedPlaylists((existingPlaylists) => [
      savedPlaylist,
      ...existingPlaylists.filter((item) => item.name !== trimmedName),
    ]);
    setPlaylistNotice(`Saved "${trimmedName}" locally.`);
  };

  const loadSavedPlaylist = (savedPlaylist) => {
    const tracksBySignature = new Map(
      playlistRef.current.map((track) => [track.signature, track]),
    );
    const matchedTracks = savedPlaylist.tracks
      .map((track) => tracksBySignature.get(track.signature))
      .filter(Boolean);

    setPlaylistName(savedPlaylist.name);

    if (matchedTracks.length === 0) {
      setPlaylistNotice(
        `Loaded "${savedPlaylist.name}" metadata. Re-add those local files to make it playable.`,
      );
      return;
    }

    setPlaylist(matchedTracks);
    playlistRef.current = matchedTracks;
    setPlaylistNotice(`Loaded "${savedPlaylist.name}" from currently available local files.`);
    loadTrack(0, false);
  };

  const deleteSavedPlaylist = (playlistId) => {
    setSavedPlaylists((existingPlaylists) =>
      existingPlaylists.filter((savedPlaylist) => savedPlaylist.id !== playlistId),
    );
    setPlaylistNotice('Saved playlist deleted.');
  };

  const progressMax = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const currentModeLabel = useMemo(
    () =>
      VISUALIZATION_MODES.find((visualization) => visualization.id === visualizationMode)
        ?.label ?? 'Spectrum',
    [visualizationMode],
  );

  return (
    <main
      className={`visual-app ${isDragging ? 'is-dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <VisualizationCanvas
        analyserRef={analyserRef}
        isPlaying={isPlaying}
        mode={visualizationMode}
      />

      <div className="brand-mark" aria-label="Cardeo Amp">
        <span>Cardeo Amp</span>
        <small>{currentModeLabel}</small>
      </div>

      <div className="floating-controls" aria-label="Playback controls">
        <div className="track-meta">
          <span className="track-kicker">Now playing</span>
          <strong>{currentTrack?.name || 'Choose local audio'}</strong>
        </div>

        <div className="transport-cluster">
          <button type="button" onClick={playPreviousTrack} disabled={currentIndex <= 0}>
            Previous
          </button>
          <button className="primary-control" type="button" onClick={togglePlayback}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={playNextTrack}
            disabled={currentIndex < 0 || (!isShuffleEnabled && currentIndex >= playlist.length - 1)}
          >
            Next
          </button>
        </div>

        <div className="drawer-launchers" aria-label="Player panels">
          <button type="button" onClick={() => setActiveDrawer('playlist')}>
            Playlist
          </button>
          <button type="button" onClick={() => setActiveDrawer('visualization')}>
            Visual
          </button>
          <button type="button" onClick={() => setActiveDrawer('eq')}>
            EQ
          </button>
        </div>
      </div>

      <div className="timeline-strip">
        <span>{formatTime(currentTime)}</span>
        <input
          aria-label="Track progress"
          type="range"
          min="0"
          max={progressMax}
          step="0.01"
          value={Math.min(currentTime, progressMax)}
          onChange={handleSeek}
          disabled={!hasTrack || progressMax === 0}
        />
        <span>{formatTime(duration)}</span>
      </div>

      {activeDrawer && (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="Close drawer"
            onClick={() => setActiveDrawer(null)}
          />
          <aside className="drawer" aria-label={`${activeDrawer} drawer`}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Local-first</p>
                <h1>
                  {activeDrawer === 'playlist' && 'Playlist'}
                  {activeDrawer === 'visualization' && 'Visualization'}
                  {activeDrawer === 'eq' && 'Equalizer'}
                </h1>
              </div>
              <button type="button" onClick={() => setActiveDrawer(null)}>
                Close
              </button>
            </div>

            {activeDrawer === 'playlist' && (
              <div className="drawer-content">
                <label className="file-picker">
                  <span>Choose MP3 or audio files</span>
                  <input type="file" accept=".mp3,audio/*" multiple onChange={handleFileChange} />
                </label>

                <div className="drop-zone">Drop local audio files anywhere on the app</div>

                <div className="section-heading">
                  <h2>Loaded tracks</h2>
                  <span>{playlist.length} tracks</span>
                </div>

                {playlist.length === 0 ? (
                  <p className="empty-state">
                    No tracks loaded. Select multiple local audio files or drag a folder of songs
                    onto the window.
                  </p>
                ) : (
                  <ol className="playlist">
                    {playlist.map((track, index) => (
                      <li key={track.id}>
                        <button
                          className={`playlist-track ${index === currentIndex ? 'is-current' : ''}`}
                          type="button"
                          onClick={() => playTrack(index)}
                          aria-current={index === currentIndex ? 'true' : undefined}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <span>{track.name}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}

                <section className="drawer-section" aria-labelledby="saved-playlists-title">
                  <div className="section-heading">
                    <h2 id="saved-playlists-title">Saved playlists</h2>
                    <button type="button" className="pill-button" onClick={savePlaylist}>
                      Save
                    </button>
                  </div>
                  <input
                    className="text-input"
                    type="text"
                    value={playlistName}
                    onChange={(event) => setPlaylistName(event.target.value)}
                    aria-label="Playlist name"
                  />
                  {playlistNotice && <p className="notice">{playlistNotice}</p>}
                  {savedPlaylists.length === 0 ? (
                    <p className="empty-state">
                      Saved playlists live in this browser. File access still requires you to
                      choose local files.
                    </p>
                  ) : (
                    <ul className="saved-playlists">
                      {savedPlaylists.map((savedPlaylist) => (
                        <li key={savedPlaylist.id}>
                          <button type="button" onClick={() => loadSavedPlaylist(savedPlaylist)}>
                            <strong>{savedPlaylist.name}</strong>
                            <span>{savedPlaylist.tracks.length} tracks</span>
                          </button>
                          <button
                            className="delete-button"
                            type="button"
                            onClick={() => deleteSavedPlaylist(savedPlaylist.id)}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <p className="privacy-note">
                  Your music stays local. Files are never uploaded.
                </p>
              </div>
            )}

            {activeDrawer === 'visualization' && (
              <div className="drawer-content">
                <section className="drawer-section">
                  <div className="section-heading">
                    <h2>Mode</h2>
                    <span>{currentModeLabel}</span>
                  </div>
                  <div className="mode-grid">
                    {VISUALIZATION_MODES.map((visualization) => (
                      <button
                        className={visualization.id === visualizationMode ? 'is-active' : ''}
                        type="button"
                        key={visualization.id}
                        onClick={() => setVisualizationMode(visualization.id)}
                        aria-pressed={visualization.id === visualizationMode}
                      >
                        {visualization.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="drawer-section">
                  <div className="section-heading">
                    <h2>Playback</h2>
                    <button
                      className={`pill-button ${isShuffleEnabled ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => setIsShuffleEnabled((enabled) => !enabled)}
                      aria-pressed={isShuffleEnabled}
                    >
                      Shuffle {isShuffleEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  <label className="volume-control">
                    <span>Volume</span>
                    <input
                      aria-label="Volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={handleVolumeChange}
                    />
                  </label>
                </section>
              </div>
            )}

            {activeDrawer === 'eq' && (
              <div className="drawer-content">
                <EqualizerPanel
                  eqGains={eqGains}
                  isEqEnabled={isEqEnabled}
                  onEqGainChange={updateEqGain}
                  onToggleEq={toggleEq}
                />
              </div>
            )}
          </aside>
        </>
      )}

      <audio
        ref={audioRef}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onEnded={() => {
          const nextIndex = getNextTrackIndex();

          if (nextIndex >= 0 && nextIndex !== currentIndexRef.current) {
            loadTrack(nextIndex, true);
          } else {
            setIsPlaying(false);
          }
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onSeeked={() => {
          isUserSeekingRef.current = false;
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onTimeUpdate={(event) => {
          if (!isUserSeekingRef.current) {
            setCurrentTime(event.currentTarget.currentTime);
          }
        }}
      />
    </main>
  );
}

export default App;
