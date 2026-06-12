import React, { useCallback, useEffect, useRef, useState } from 'react';

const BAR_COUNT = 14;
const MIN_BAR_HEIGHT = 8;
const EQ_GAIN_MIN = -12;
const EQ_GAIN_MAX = 12;
const AUDIO_DEBUG_KEY = 'cardeoAmpAudioDebug';
const EQ_BANDS = [
  { frequency: 60, label: '60 Hz' },
  { frequency: 170, label: '170 Hz' },
  { frequency: 350, label: '350 Hz' },
  { frequency: 1000, label: '1 kHz' },
  { frequency: 3500, label: '3.5 kHz' },
  { frequency: 10000, label: '10 kHz' },
];
const audioGraphs = new WeakMap();
const visualizerGraphs = new WeakMap();

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

const isAudioDebugEnabled = () =>
  typeof window !== 'undefined' &&
  window.localStorage.getItem(AUDIO_DEBUG_KEY) === 'true';

const describeAudio = (audio, track, index) => ({
  currentTime: audio?.currentTime ?? null,
  duration: audio?.duration ?? null,
  ended: audio?.ended ?? null,
  paused: audio?.paused ?? null,
  readyState: audio?.readyState ?? null,
  src: audio?.currentSrc || audio?.src || '',
  trackId: track?.id ?? null,
  trackIndex: index,
  trackName: track?.name ?? null,
  volume: audio?.volume ?? null,
});

const debugAudio = (label, audio, track, index, extra = {}) => {
  if (!isAudioDebugEnabled()) {
    return;
  }

  console.debug('[Cardeo Amp audio]', label, {
    ...describeAudio(audio, track, index),
    ...extra,
  });
};

const getAudioGraph = (audio) => {
  const existingGraph = audioGraphs.get(audio);

  if (existingGraph) {
    return existingGraph;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const dryGain = context.createGain();
  const eqOutputGain = context.createGain();
  const analyserTapGain = context.createGain();
  const filters = EQ_BANDS.map(({ frequency }) => {
    const filter = context.createBiquadFilter();

    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    filter.gain.value = 0;

    return filter;
  });
  const analyser = context.createAnalyser();

  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.82;
  dryGain.gain.value = 1;
  eqOutputGain.gain.value = 0;
  analyserTapGain.gain.value = 0;

  source.connect(dryGain);
  dryGain.connect(context.destination);
  source.connect(filters[0]);
  filters.forEach((filter, index) => {
    const nextNode = filters[index + 1] ?? eqOutputGain;
    filter.connect(nextNode);
  });
  eqOutputGain.connect(context.destination);
  source.connect(analyser);
  analyser.connect(analyserTapGain);
  analyserTapGain.connect(context.destination);
  context.onstatechange = () => {
    debugAudio('audio context state changed', audio, null, -1, {
      contextState: context.state,
    });
  };

  const graph = {
    analyser,
    analyserTapGain,
    context,
    dryGain,
    eqOutputGain,
    filters,
    source,
  };
  debugAudio('audio graph created', audio, null, -1, {
    chain:
      'source -> dry gain -> destination; source -> eq filters -> eq gain -> destination; source -> analyser side tap',
    filterCount: filters.length,
  });
  audioGraphs.set(audio, graph);

  return graph;
};

const getVisualizerGraph = (audio) => {
  const existingGraph = visualizerGraphs.get(audio);

  if (existingGraph) {
    return existingGraph;
  }

  const captureStream = audio.captureStream || audio.mozCaptureStream;

  if (!captureStream) {
    return null;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContext();
  const stream = captureStream.call(audio);
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  const analyserTapGain = context.createGain();

  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.82;
  analyserTapGain.gain.value = 0;

  source.connect(analyser);
  analyser.connect(analyserTapGain);
  analyserTapGain.connect(context.destination);

  const graph = { analyser, analyserTapGain, context, source, stream };
  visualizerGraphs.set(audio, graph);
  debugAudio('visualizer graph created', audio, null, -1, {
    chain: 'captureStream -> analyser side tap',
  });

  return graph;
};

const resumeAudioGraph = async (engine) => {
  if (!engine) {
    return;
  }

  const { context } = engine;

  if (context.state === 'suspended') {
    await context.resume();
  }
};

const releaseVisualizerGraph = (audio) => {
  const graph = visualizerGraphs.get(audio);

  if (!graph) {
    return;
  }

  graph.source.disconnect();
  graph.analyser.disconnect();
  graph.analyserTapGain.disconnect();
  graph.context.close();
  visualizerGraphs.delete(audio);
  debugAudio('visualizer graph released', audio, null, -1);
};

const applyEqSettings = (engine, isEnabled, gains) => {
  if (!engine) {
    return;
  }

  engine.dryGain.gain.setTargetAtTime(
    isEnabled ? 0 : 1,
    engine.context.currentTime,
    0.015,
  );
  engine.eqOutputGain.gain.setTargetAtTime(
    isEnabled ? 1 : 0,
    engine.context.currentTime,
    0.015,
  );
  engine.filters.forEach((filter, index) => {
    const gain = gains[index];
    filter.gain.setTargetAtTime(gain, engine.context.currentTime, 0.015);
    debugAudio('eq filter gain write', null, null, -1, {
      band: EQ_BANDS[index].label,
      gain,
      isEnabled,
    });
  });
};

const applyEqBandGain = (engine, index, isEnabled, gain) => {
  if (!engine) {
    return;
  }

  engine.filters[index].gain.setTargetAtTime(
    gain,
    engine.context.currentTime,
    0.015,
  );
  debugAudio('eq band gain write', null, null, -1, {
    band: EQ_BANDS[index].label,
    gain,
    requestedGain: gain,
    isEnabled,
  });
};

const releaseAudioGraph = (audio) => {
  const graph = audioGraphs.get(audio);

  if (!graph) {
    return;
  }

  graph.source.disconnect();
  graph.dryGain.disconnect();
  graph.filters.forEach((filter) => filter.disconnect());
  graph.eqOutputGain.disconnect();
  graph.analyser.disconnect();
  graph.analyserTapGain.disconnect();
  graph.context.close();
  debugAudio('audio graph released', audio, null, -1);
  audioGraphs.delete(audio);
};

const EqualizerDisplay = React.memo(function EqualizerDisplay({
  audioRef,
  getVisualizerEngine,
}) {
  const animationRef = useRef(null);
  const barRefs = useRef([]);
  const levelsRef = useRef(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return undefined;
    }

    let frequencyData = null;

    const animate = () => {
      const engine = getVisualizerEngine();
      const analyser = engine?.analyser;
      const context = engine?.context;

      if (analyser && (!frequencyData || frequencyData.length !== analyser.frequencyBinCount)) {
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
      }

      const isAudioPlaying =
        analyser &&
        context &&
        frequencyData &&
        !audio.paused &&
        !audio.ended &&
        audio.readyState >= audio.HAVE_CURRENT_DATA &&
        context.state === 'running';

      if (isAudioPlaying) {
        analyser.getByteFrequencyData(frequencyData);
      }

      const dataLength = frequencyData?.length ?? 0;
      const binSize = Math.max(1, Math.floor(dataLength / BAR_COUNT));
      const nextLevels = levelsRef.current.map((currentLevel, index) => {
        let total = 0;
        const start = index * binSize;
        const end = Math.min(start + binSize, dataLength);

        for (let bin = start; bin < end; bin += 1) {
          total += isAudioPlaying ? frequencyData[bin] : 0;
        }

        const average = total / Math.max(1, end - start);
        const targetHeight = isAudioPlaying
          ? MIN_BAR_HEIGHT + (average / 255) * (100 - MIN_BAR_HEIGHT)
          : MIN_BAR_HEIGHT;

        return currentLevel * 0.68 + targetHeight * 0.32;
      });

      levelsRef.current = nextLevels;
      nextLevels.forEach((height, index) => {
        if (barRefs.current[index]) {
          barRefs.current[index].style.height = `${height}%`;
        }
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioRef, getVisualizerEngine]);

  return (
    <div className="eq-display" aria-hidden="true">
      <div className="eq-display-bars">
        {levelsRef.current.map((height, index) => (
          <span
            className="eq-display-bar"
            key={`eq-display-bar-${index}`}
            ref={(element) => {
              barRefs.current[index] = element;
            }}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
});

function EqualizerPanel({
  audioRef,
  getVisualizerEngine,
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
    const nextGain = Math.round(rawGain);

    onEqGainChange(index, nextGain);
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
    <section className="eq-panel" aria-labelledby="eq-title">
      <EqualizerDisplay audioRef={audioRef} getVisualizerEngine={getVisualizerEngine} />

      <div className="eq-controls">
        <div className="eq-heading">
          <h2 id="eq-title">Equalizer</h2>
          <button
            className={`eq-toggle ${isEqEnabled ? 'is-active' : ''}`}
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
      </div>
    </section>
  );
}

function App() {
  const audioRef = useRef(null);
  const audioEngineRef = useRef(null);
  const eqGainsRef = useRef(EQ_BANDS.map(() => 0));
  const isEqEnabledRef = useRef(false);
  const lastTimeUpdateLogRef = useRef(-1);
  const lastKnownPlaybackTimeRef = useRef(0);
  const lastStablePlaybackTimeRef = useRef(0);
  const lastStableUpdateAtRef = useRef(0);
  const isRecoveringFromJumpRef = useRef(false);
  const isUserSeekingRef = useRef(false);
  const playlistRef = useRef([]);
  const currentIndexRef = useRef(-1);
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
    return () => {
      playlistRef.current.forEach((track) => URL.revokeObjectURL(track.url));
      playlistRef.current.forEach((track) => {
        debugAudio('object url revoked', audioRef.current, track, currentIndexRef.current, {
          revokedUrl: track.url,
          reason: 'app cleanup',
        });
      });

      if (audioRef.current) {
        releaseAudioGraph(audioRef.current);
      }
    };
  }, []);

  const ensureAudioEngine = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return null;
    }

    if (!audioEngineRef.current) {
      audioEngineRef.current = getAudioGraph(audio);
      applyEqSettings(
        audioEngineRef.current,
        isEqEnabledRef.current,
        eqGainsRef.current,
      );
    }

    return audioEngineRef.current;
  }, []);

  const getAudioEngine = useCallback(() => audioEngineRef.current, []);

  const getVisualizerEngine = useCallback(() => audioEngineRef.current, []);

  const loadTrack = async (index, shouldPlay = false) => {
    const track = playlistRef.current[index];

    if (!track) {
      return;
    }

    const audio = audioRef.current;
    debugAudio('audio.pause() before track load', audio, currentTrack, currentIndex, {
      nextTrackId: track.id,
      nextTrackIndex: index,
    });
    audio.pause();
    debugAudio('audio.src write', audio, track, index, {
      nextSrc: track.url,
    });
    audio.src = track.url;
    debugAudio('audio.load() after src write', audio, track, index);
    audio.load();
    debugAudio('audio.volume write during track load', audio, track, index, {
      nextVolume: volume,
    });
    audio.volume = volume;

    debugAudio('current track index write', audio, track, index);
    setCurrentIndex(index);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    lastKnownPlaybackTimeRef.current = 0;
    lastStablePlaybackTimeRef.current = 0;
    lastStableUpdateAtRef.current = performance.now();
    isRecoveringFromJumpRef.current = false;
    isUserSeekingRef.current = false;

    if (shouldPlay) {
      try {
        if (isEqEnabledRef.current) {
          await resumeAudioGraph(ensureAudioEngine());
        }
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const appendFiles = (fileList) => {
    const audioFiles = Array.from(fileList).filter(
      (file) => file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3'),
    );

    if (audioFiles.length === 0) {
      return;
    }

    const newTracks = audioFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    newTracks.forEach((track) => {
      debugAudio('object url created', audioRef.current, track, currentIndexRef.current, {
        createdUrl: track.url,
        size: track.size,
        source: 'file object url',
      });
    });

    const shouldLoadFirstTrack = playlistRef.current.length === 0;

    setPlaylist((existingTracks) => [...existingTracks, ...newTracks]);

    if (shouldLoadFirstTrack) {
      playlistRef.current = newTracks;
      loadTrack(0, false);
    }
  };

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

    if (!hasTrack) {
      return;
    }

    if (audio.paused) {
      try {
        if (isEqEnabledRef.current) {
          await resumeAudioGraph(ensureAudioEngine());
        }
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const playTrack = (index) => {
    loadTrack(index, true);
  };

  const getNextTrackIndex = () => {
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
    const hasSeekableDuration = Number.isFinite(audio.duration) && audio.duration > 0;

    if (!Number.isFinite(requestedTime) || !hasSeekableDuration) {
      debugAudio('audio.currentTime write blocked', audio, currentTrack, currentIndex, {
        reason: 'invalid seek request',
        requestedTime,
      });
      return;
    }

    const nextTime = Math.min(Math.max(requestedTime, 0), audio.duration);

    debugAudio('audio.currentTime write', audio, currentTrack, currentIndex, {
      nextTime,
      reason: 'user seek',
    });
    isUserSeekingRef.current = true;
    audio.currentTime = nextTime;
    lastKnownPlaybackTimeRef.current = nextTime;
    lastStablePlaybackTimeRef.current = nextTime;
    lastStableUpdateAtRef.current = performance.now();
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (event) => {
    const nextVolume = Number(event.target.value);

    debugAudio('audio.volume write', audioRef.current, currentTrack, currentIndex, {
      nextVolume,
      reason: 'user volume',
    });
    audioRef.current.volume = nextVolume;
    setVolume(nextVolume);
  };

  const logAudioLifecycleEvent = (eventName, event) => {
    const audio = event.currentTarget;

    if (eventName === 'timeupdate') {
      const wholeSecond = Math.floor(audio.currentTime);

      if (wholeSecond === lastTimeUpdateLogRef.current) {
        return;
      }

      lastTimeUpdateLogRef.current = wholeSecond;
    }

    debugAudio(eventName, audio, currentTrack, currentIndex, {
      error: audio.error
        ? {
            code: audio.error.code,
            message: audio.error.message,
          }
        : null,
    });
  };

  const handlePlaybackTimeUpdate = (event) => {
    logAudioLifecycleEvent('timeupdate', event);

    const audio = event.currentTarget;
    const nextCurrentTime = audio.currentTime;

    if (!Number.isFinite(nextCurrentTime)) {
      return;
    }

    const now = performance.now();
    const lastStableTime = lastStablePlaybackTimeRef.current;
    const elapsedSeconds = Math.max(0, (now - lastStableUpdateAtRef.current) / 1000);
    const allowedForwardProgress = Math.max(3, elapsedSeconds * 1.75 + 1);
    const forwardJump = nextCurrentTime - lastStableTime;
    const reportedDuration = audio.duration;
    const isNearReportedEnd =
      Number.isFinite(reportedDuration) &&
      reportedDuration > 0 &&
      nextCurrentTime >= reportedDuration - 1;
    const looksLikeUnexpectedJump =
      !isUserSeekingRef.current &&
      !isRecoveringFromJumpRef.current &&
      forwardJump > allowedForwardProgress &&
      (forwardJump > 8 || isNearReportedEnd);

    if (looksLikeUnexpectedJump) {
      debugAudio('unexpected currentTime jump blocked', audio, currentTrack, currentIndex, {
        allowedForwardProgress,
        forwardJump,
        lastStableTime,
        nextCurrentTime,
        reportedDuration,
      });
      isRecoveringFromJumpRef.current = true;
      audio.currentTime = lastStableTime;
      setCurrentTime(lastStableTime);

      if (!audio.paused) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }

      return;
    }

    lastKnownPlaybackTimeRef.current = nextCurrentTime;
    lastStablePlaybackTimeRef.current = nextCurrentTime;
    lastStableUpdateAtRef.current = now;
    setCurrentTime(nextCurrentTime);
  };

  const handlePlaybackSeeked = (event) => {
    logAudioLifecycleEvent('seeked', event);

    const audio = event.currentTarget;

    if (isRecoveringFromJumpRef.current) {
      isRecoveringFromJumpRef.current = false;
      return;
    }

    if (isUserSeekingRef.current && Number.isFinite(audio.currentTime)) {
      lastKnownPlaybackTimeRef.current = audio.currentTime;
      lastStablePlaybackTimeRef.current = audio.currentTime;
      lastStableUpdateAtRef.current = performance.now();
      setCurrentTime(audio.currentTime);
    }

    isUserSeekingRef.current = false;
  };

  const handlePlaybackEnded = (event) => {
    logAudioLifecycleEvent('ended', event);

    const audio = event.currentTarget;
    const lastStablePlaybackTime = lastStablePlaybackTimeRef.current;
    const reportedDuration = audio.duration;
    const looksLikeEarlyEnd =
      Number.isFinite(reportedDuration) &&
      reportedDuration > 0 &&
      lastStablePlaybackTime < reportedDuration - 2;

    if (looksLikeEarlyEnd) {
      debugAudio('early ended ignored', audio, currentTrack, currentIndex, {
        lastStablePlaybackTime,
        reportedDuration,
      });
      isRecoveringFromJumpRef.current = true;
      audio.currentTime = lastStablePlaybackTime;
      setCurrentTime(lastStablePlaybackTime);
      audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    const nextIndex = getNextTrackIndex();

    if (nextIndex >= 0 && nextIndex !== currentIndexRef.current) {
      loadTrack(nextIndex, true);
    } else {
      setIsPlaying(false);
    }
  };

  return (
    <main
      className={`app-shell ${isDragging ? 'is-dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <section className="player-panel" aria-labelledby="app-title">
        <div className="masthead">
          <p className="eyebrow">Local-first music player</p>
          <h1 id="app-title">Cardeo Amp</h1>
        </div>

        <label className="file-picker">
          <span>Choose MP3 or audio files</span>
          <input
            type="file"
            accept=".mp3,audio/*"
            multiple
            onChange={handleFileChange}
          />
        </label>

        <div className="drop-zone">
          Drop local audio files here
        </div>

        <div className="track-display">
          <span className="track-label">Current track</span>
          <strong>{currentTrack?.name || 'No file selected'}</strong>
        </div>

        <EqualizerPanel
          audioRef={audioRef}
          getVisualizerEngine={getVisualizerEngine}
          eqGains={eqGains}
          isEqEnabled={isEqEnabled}
          onEqGainChange={(index, nextGain) => {
            debugAudio('eq slider changed', audioRef.current, currentTrack, currentIndex, {
              band: EQ_BANDS[index].label,
              nextGain,
            });
            applyEqBandGain(
              audioEngineRef.current,
              index,
              isEqEnabledRef.current,
              nextGain,
            );
            setEqGains((currentGains) => {
              const nextGains = currentGains.map((gain, gainIndex) =>
                gainIndex === index ? nextGain : gain,
              );
              eqGainsRef.current = nextGains;
              return nextGains;
            });
          }}
          onToggleEq={() =>
            setIsEqEnabled((isEnabled) => {
              const nextIsEnabled = !isEnabled;
              isEqEnabledRef.current = nextIsEnabled;
              debugAudio('eq toggle changed', audioRef.current, currentTrack, currentIndex, {
                isEqEnabled: nextIsEnabled,
              });
              if (nextIsEnabled) {
                ensureAudioEngine();
              }
              applyEqSettings(
                audioEngineRef.current,
                nextIsEnabled,
                eqGainsRef.current,
              );
              return nextIsEnabled;
            })
          }
        />

        <div className="transport-row">
          <button
            className="transport-button"
            type="button"
            onClick={playPreviousTrack}
            disabled={currentIndex <= 0}
          >
            Previous
          </button>
          <button
            className="play-button"
            type="button"
            onClick={togglePlayback}
            disabled={!hasTrack}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            className="transport-button"
            type="button"
            onClick={playNextTrack}
            disabled={
              currentIndex < 0 ||
              (!isShuffleEnabled && currentIndex >= playlist.length - 1)
            }
          >
            Next
          </button>
        </div>

        <button
          className={`shuffle-button ${isShuffleEnabled ? 'is-active' : ''}`}
          type="button"
          onClick={() => setIsShuffleEnabled((enabled) => !enabled)}
          aria-pressed={isShuffleEnabled}
        >
          Shuffle {isShuffleEnabled ? 'On' : 'Off'}
        </button>

        <div className="control-group">
          <input
            aria-label="Track progress"
            className="progress-slider"
            type="range"
            min="0"
            max={Number.isFinite(duration) ? duration : 0}
            step="0.01"
            value={Number.isFinite(currentTime) ? currentTime : 0}
            onChange={handleSeek}
            disabled={!hasTrack}
          />
          <div className="time-row">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
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

        <section className="playlist-section" aria-labelledby="playlist-title">
          <div className="playlist-heading">
            <h2 id="playlist-title">Playlist</h2>
            <span>{playlist.length} tracks</span>
          </div>

          {playlist.length === 0 ? (
            <p className="empty-playlist">
              No tracks yet. Choose files or drag local audio onto the app.
            </p>
          ) : (
            <ol className="playlist">
              {playlist.map((track, index) => (
                <li key={track.id}>
                  <button
                    className={`playlist-track ${
                      index === currentIndex ? 'is-current' : ''
                    }`}
                    type="button"
                    onClick={() => playTrack(index)}
                    aria-current={index === currentIndex ? 'true' : undefined}
                  >
                    <span className="track-number">{index + 1}</span>
                    <span>{track.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="privacy-note">
          Your music stays local. Files are never uploaded.
        </p>

        <audio
          ref={audioRef}
          onAbort={(event) => logAudioLifecycleEvent('abort', event)}
          onDurationChange={(event) => {
            logAudioLifecycleEvent('durationchange', event);
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          }}
          onEmptied={(event) => logAudioLifecycleEvent('emptied', event)}
          onEnded={handlePlaybackEnded}
          onError={(event) => logAudioLifecycleEvent('error', event)}
          onLoadedMetadata={(event) => logAudioLifecycleEvent('loadedmetadata', event)}
          onPause={(event) => {
            logAudioLifecycleEvent('pause', event);
            setIsPlaying(false);
          }}
          onPlay={(event) => {
            logAudioLifecycleEvent('play', event);
            setIsPlaying(true);
          }}
          onSeeked={handlePlaybackSeeked}
          onSeeking={(event) => logAudioLifecycleEvent('seeking', event)}
          onStalled={(event) => logAudioLifecycleEvent('stalled', event)}
          onSuspend={(event) => logAudioLifecycleEvent('suspend', event)}
          onTimeUpdate={handlePlaybackTimeUpdate}
          onWaiting={(event) => logAudioLifecycleEvent('waiting', event)}
        />
      </section>
    </main>
  );
}

export default App;
