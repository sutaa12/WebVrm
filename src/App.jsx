import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVRMRenderer } from './hooks/useVRMRenderer';
import { useMediaPipeTracking } from './hooks/useMediaPipeTracking';
import { useVRMAnimation } from './hooks/useVRMAnimation';

// VTuber Streaming Application
// Features: VRM loading, webcam tracking, background, browser overlay, settings, debug

const VTuberApp = () => {
  // State management
  const [vrmModel, setVrmModel] = useState(null);
  const [vrmUrl, setVrmUrl] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  
  // Transform states
  const [modelPosition, setModelPosition] = useState({ x: 0, y: -0.5, z: 0 });
  const [modelScale, setModelScale] = useState(1);
  const [modelRotation, setModelRotation] = useState(0);
  
  // Background
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState('#1a1a2e');
  
  // Browser overlay
  const [browserUrl, setBrowserUrl] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPosition, setBrowserPosition] = useState({ x: 50, y: 50 });
  const [browserSize, setBrowserSize] = useState({ width: 400, height: 300 });
  
  // Settings
  const [settings, setSettings] = useState({
    trackingSmoothing: 0.5,
    trackingSpeed: 1.0,
    faceTrackingEnabled: true,
    bodyTrackingEnabled: true,
    handTrackingEnabled: true,
    lipSyncEnabled: true,
    lipSyncSensitivity: 0.7,
    blinkEnabled: true,
    blinkInterval: 4,
    idleAnimationEnabled: true,
    mirrorMode: true,
    debugMode: false,
    showFPS: true,
    showTrackingData: false,
    gestureControl: true,
    keyboardShortcuts: true,
  });
  
  // Debug data
  const [debugData, setDebugData] = useState({
    fps: 0,
    trackingStatus: 'idle',
    faceDetected: false,
    handsDetected: { left: false, right: false },
    poseDetected: false,
    lastError: null,
    frameCount: 0,
  });
  
  // UI states
  const [activePanel, setActivePanel] = useState('model');
  const [showSettings, setShowSettings] = useState(true);
  const [logs, setLogs] = useState([]);
  
  // Refs
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const animationRef = useRef(null);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  // Add log entry
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), { timestamp, message, type }]);
  }, []);

  // VRM Renderer Hook
  const { vrm, error: vrmError } = useVRMRenderer(canvasRef, vrmUrl);

  // MediaPipe Tracking Hook
  const { trackingData, detectionStatus } = useMediaPipeTracking(videoRef, isTracking, settings);

  // VRM Animation Hook
  useVRMAnimation(vrm, trackingData, { modelPosition, modelScale, modelRotation }, settings, micLevel);

  // Update debug data with detection status
  useEffect(() => {
    if (detectionStatus) {
      setDebugData(prev => ({
        ...prev,
        faceDetected: detectionStatus.faceDetected,
        poseDetected: detectionStatus.poseDetected,
        handsDetected: detectionStatus.handsDetected,
      }));
    }
  }, [detectionStatus]);

  // Update debug data with VRM error
  useEffect(() => {
    if (vrmError) {
      setDebugData(prev => ({ ...prev, lastError: vrmError }));
      addLog(`VRMエラー: ${vrmError}`, 'error');
    }
  }, [vrmError, addLog]);
  
  // Handle VRM file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0] || e.target?.files?.[0];
    
    if (file) {
      if (file.name.endsWith('.vrm')) {
        const url = URL.createObjectURL(file);
        setVrmUrl(url);
        setVrmModel(file.name);
        addLog(`VRMモデル読み込み: ${file.name}`, 'success');
        setDebugData(prev => ({ ...prev, lastError: null }));
      } else {
        addLog('エラー: .vrmファイルのみ対応しています', 'error');
        setDebugData(prev => ({ ...prev, lastError: 'Invalid file format' }));
      }
    }
  }, [addLog]);
  
  // Handle background image
  const handleBackgroundUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setBackgroundImage(url);
      addLog(`背景画像設定: ${file.name}`, 'success');
    }
  }, [addLog]);
  
  // Start/Stop tracking
  const toggleTracking = useCallback(async () => {
    if (isTracking) {
      setIsTracking(false);
      setDebugData(prev => ({ ...prev, trackingStatus: 'stopped' }));
      addLog('トラッキング停止', 'info');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsTracking(true);
        setDebugData(prev => ({ ...prev, trackingStatus: 'running' }));
        addLog('トラッキング開始', 'success');
      } catch (err) {
        addLog(`カメラエラー: ${err.message}`, 'error');
        setDebugData(prev => ({ ...prev, lastError: err.message }));
      }
    }
  }, [isTracking, addLog]);
  
  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    if (isMicEnabled) {
      setIsMicEnabled(false);
      addLog('マイク無効化', 'info');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!isMicEnabled) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMicLevel(avg / 255);
          requestAnimationFrame(updateLevel);
        };
        updateLevel();
        
        setIsMicEnabled(true);
        addLog('マイク有効化', 'success');
      } catch (err) {
        addLog(`マイクエラー: ${err.message}`, 'error');
      }
    }
  }, [isMicEnabled, addLog]);
  
  // Keyboard controls
  useEffect(() => {
    if (!settings.keyboardShortcuts) return;
    
    const handleKeyDown = (e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      const scaleStep = e.shiftKey ? 0.2 : 0.05;
      
      switch (e.key) {
        case 'ArrowUp':
          setModelPosition(p => ({ ...p, y: p.y + step }));
          break;
        case 'ArrowDown':
          setModelPosition(p => ({ ...p, y: p.y - step }));
          break;
        case 'ArrowLeft':
          setModelPosition(p => ({ ...p, x: p.x - step }));
          break;
        case 'ArrowRight':
          setModelPosition(p => ({ ...p, x: p.x + step }));
          break;
        case '+':
        case '=':
          setModelScale(s => Math.min(s + scaleStep, 3));
          break;
        case '-':
        case '_':
          setModelScale(s => Math.max(s - scaleStep, 0.1));
          break;
        case 'r':
        case 'R':
          setModelRotation(r => r + (e.shiftKey ? -10 : 10));
          break;
        case 't':
        case 'T':
          toggleTracking();
          break;
        case 'm':
        case 'M':
          toggleMicrophone();
          break;
        case 'd':
        case 'D':
          setSettings(s => ({ ...s, debugMode: !s.debugMode }));
          break;
        case 'Escape':
          setShowSettings(s => !s);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.keyboardShortcuts, toggleTracking, toggleMicrophone]);
  
  // FPS counter
  useEffect(() => {
    if (!settings.showFPS) return;
    
    const updateFPS = () => {
      fpsRef.current.frames++;
      const now = performance.now();
      if (now - fpsRef.current.lastTime >= 1000) {
        setDebugData(prev => ({ 
          ...prev, 
          fps: fpsRef.current.frames,
          frameCount: prev.frameCount + fpsRef.current.frames
        }));
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }
      animationRef.current = requestAnimationFrame(updateFPS);
    };
    
    animationRef.current = requestAnimationFrame(updateFPS);
    return () => cancelAnimationFrame(animationRef.current);
  }, [settings.showFPS]);

  // Apply microphone level to blend shapes for lip sync
  useEffect(() => {
    if (settings.lipSyncEnabled && isMicEnabled && trackingData) {
      setDebugData(prev => ({
        ...prev,
        trackingStatus: isTracking ? 'running' : 'idle',
      }));
    }
  }, [micLevel, isMicEnabled, settings.lipSyncEnabled, isTracking, trackingData]);

  // Render settings panel based on active tab
  const renderSettingsPanel = () => {
    switch (activePanel) {
      case 'model':
        return (
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed border-cyan-500/50 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-500/10 transition-all"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".vrm" 
                className="hidden" 
                onChange={handleDrop}
              />
              <div className="text-4xl mb-2">📁</div>
              <p className="text-cyan-300">VRMファイルをドロップ</p>
              <p className="text-xs text-gray-500 mt-1">またはクリックして選択</p>
            </div>
            
            {vrmModel && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3">
                <p className="text-green-400 text-sm">✓ {vrmModel}</p>
              </div>
            )}
            
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-cyan-300">位置調整</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-400">X</label>
                  <input 
                    type="range" 
                    min="-2" max="2" step="0.1"
                    value={modelPosition.x}
                    onChange={(e) => setModelPosition(p => ({ ...p, x: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                  <span className="text-xs text-cyan-400">{modelPosition.x.toFixed(1)}</span>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Y</label>
                  <input 
                    type="range" 
                    min="-2" max="2" step="0.1"
                    value={modelPosition.y}
                    onChange={(e) => setModelPosition(p => ({ ...p, y: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                  <span className="text-xs text-cyan-400">{modelPosition.y.toFixed(1)}</span>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Z</label>
                  <input 
                    type="range" 
                    min="-5" max="5" step="0.1"
                    value={modelPosition.z}
                    onChange={(e) => setModelPosition(p => ({ ...p, z: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                  <span className="text-xs text-cyan-400">{modelPosition.z.toFixed(1)}</span>
                </div>
              </div>
              
              <div>
                <label className="text-xs text-gray-400">スケール</label>
                <input 
                  type="range" 
                  min="0.1" max="3" step="0.1"
                  value={modelScale}
                  onChange={(e) => setModelScale(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-xs text-cyan-400">{modelScale.toFixed(1)}x</span>
              </div>
              
              <div>
                <label className="text-xs text-gray-400">回転</label>
                <input 
                  type="range" 
                  min="-180" max="180" step="1"
                  value={modelRotation}
                  onChange={(e) => setModelRotation(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-xs text-cyan-400">{modelRotation}°</span>
              </div>
              
              <button 
                onClick={() => {
                  setModelPosition({ x: 0, y: -0.5, z: 0 });
                  setModelScale(1);
                  setModelRotation(0);
                }}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              >
                リセット
              </button>
            </div>
          </div>
        );
        
      case 'tracking':
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={toggleTracking}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  isTracking 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-cyan-500 hover:bg-cyan-400 text-black'
                }`}
              >
                {isTracking ? '⏹ 停止' : '▶ 開始'}
              </button>
              <button 
                onClick={toggleMicrophone}
                className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                  isMicEnabled
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              >
                🎤
              </button>
            </div>
            
            {isMicEnabled && (
              <div className="bg-gray-800 rounded-lg p-2">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-cyan-500 transition-all duration-75"
                    style={{ width: `${micLevel * 100}%` }}
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-cyan-300">トラッキング設定</h4>
              
              {[
                { key: 'faceTrackingEnabled', label: '顔トラッキング', icon: '😀' },
                { key: 'bodyTrackingEnabled', label: '上半身トラッキング', icon: '🧍' },
                { key: 'handTrackingEnabled', label: '手・指トラッキング', icon: '✋' },
                { key: 'lipSyncEnabled', label: 'リップシンク', icon: '👄' },
                { key: 'blinkEnabled', label: '自動まばたき', icon: '👁' },
                { key: 'mirrorMode', label: 'ミラーモード', icon: '🪞' },
              ].map(({ key, label, icon }) => (
                <label key={key} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800">
                  <span className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-sm">{label}</span>
                  </span>
                  <input 
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                    className="w-5 h-5 accent-cyan-500"
                  />
                </label>
              ))}
              
              <div className="space-y-2">
                <label className="text-xs text-gray-400">スムージング</label>
                <input 
                  type="range" 
                  min="0" max="1" step="0.1"
                  value={settings.trackingSmoothing}
                  onChange={(e) => setSettings(s => ({ ...s, trackingSmoothing: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-xs text-cyan-400">{settings.trackingSmoothing.toFixed(1)}</span>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-gray-400">リップシンク感度</label>
                <input 
                  type="range" 
                  min="0" max="1" step="0.1"
                  value={settings.lipSyncSensitivity}
                  onChange={(e) => setSettings(s => ({ ...s, lipSyncSensitivity: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
                <span className="text-xs text-cyan-400">{settings.lipSyncSensitivity.toFixed(1)}</span>
              </div>
            </div>
          </div>
        );
        
      case 'background':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">背景色</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <input 
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 mb-2 block">背景画像</label>
              <div 
                className="border-2 border-dashed border-purple-500/50 rounded-lg p-4 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-500/10 transition-all"
                onClick={() => bgInputRef.current?.click()}
              >
                <input 
                  ref={bgInputRef}
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleBackgroundUpload}
                />
                <div className="text-2xl mb-1">🖼</div>
                <p className="text-purple-300 text-sm">画像を選択</p>
              </div>
            </div>
            
            {backgroundImage && (
              <div className="relative">
                <img 
                  src={backgroundImage} 
                  alt="Background preview" 
                  className="w-full h-24 object-cover rounded-lg"
                />
                <button 
                  onClick={() => setBackgroundImage(null)}
                  className="absolute top-1 right-1 bg-red-500 rounded-full w-6 h-6 text-xs hover:bg-red-400"
                >
                  ✕
                </button>
              </div>
            )}
            
            <div className="grid grid-cols-4 gap-2">
              {['#1a1a2e', '#0f0f23', '#16213e', '#1a1a1a', '#2d132c', '#1e3a5f', '#0d1117', '#000000'].map(color => (
                <button 
                  key={color}
                  onClick={() => setBackgroundColor(color)}
                  className="w-full aspect-square rounded-lg border-2 transition-all hover:scale-105"
                  style={{ 
                    backgroundColor: color,
                    borderColor: backgroundColor === color ? '#00ffff' : 'transparent'
                  }}
                />
              ))}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setBackgroundColor('#00ff00')}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded text-sm"
              >
                グリーンバック
              </button>
              <button 
                onClick={() => setBackgroundColor('#0000ff')}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
              >
                ブルーバック
              </button>
            </div>
          </div>
        );
        
      case 'browser':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">URL</label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
                <button 
                  onClick={() => setShowBrowser(!showBrowser)}
                  className={`px-4 rounded transition-colors ${
                    showBrowser ? 'bg-cyan-500 text-black' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {showBrowser ? '非表示' : '表示'}
                </button>
              </div>
            </div>
            
            {showBrowser && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">X位置</label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={browserPosition.x}
                      onChange={(e) => setBrowserPosition(p => ({ ...p, x: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Y位置</label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={browserPosition.y}
                      onChange={(e) => setBrowserPosition(p => ({ ...p, y: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">幅</label>
                    <input 
                      type="range" 
                      min="100" max="800" 
                      value={browserSize.width}
                      onChange={(e) => setBrowserSize(s => ({ ...s, width: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">高さ</label>
                    <input 
                      type="range" 
                      min="100" max="600" 
                      value={browserSize.height}
                      onChange={(e) => setBrowserSize(s => ({ ...s, height: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-gray-500">
                  💡 iframeの制限により一部のサイトは表示できません
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-cyan-300">プリセット</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'YouTube', url: 'https://www.youtube.com/embed/' },
                  { name: 'Twitch Chat', url: 'https://www.twitch.tv/embed/' },
                  { name: 'Timer', url: 'https://www.timeanddate.com/timer/' },
                  { name: 'Clock', url: 'https://www.timeanddate.com/worldclock/' },
                ].map(preset => (
                  <button 
                    key={preset.name}
                    onClick={() => setBrowserUrl(preset.url)}
                    className="py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 'settings':
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-cyan-300">システム設定</h4>
            
            {[
              { key: 'idleAnimationEnabled', label: 'アイドルアニメーション', icon: '💫' },
              { key: 'gestureControl', label: 'ジェスチャー操作', icon: '👆' },
              { key: 'keyboardShortcuts', label: 'キーボードショートカット', icon: '⌨️' },
              { key: 'debugMode', label: 'デバッグモード', icon: '🐛' },
              { key: 'showFPS', label: 'FPS表示', icon: '📊' },
              { key: 'showTrackingData', label: 'トラッキングデータ表示', icon: '📈' },
            ].map(({ key, label, icon }) => (
              <label key={key} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800">
                <span className="flex items-center gap-2">
                  <span>{icon}</span>
                  <span className="text-sm">{label}</span>
                </span>
                <input 
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                  className="w-5 h-5 accent-cyan-500"
                />
              </label>
            ))}
            
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-cyan-300 mb-3">キーボードショートカット</h4>
              <div className="space-y-1 text-xs text-gray-400">
                <p><kbd className="bg-gray-700 px-1 rounded">↑↓←→</kbd> モデル移動</p>
                <p><kbd className="bg-gray-700 px-1 rounded">+/-</kbd> 拡大/縮小</p>
                <p><kbd className="bg-gray-700 px-1 rounded">R</kbd> 回転</p>
                <p><kbd className="bg-gray-700 px-1 rounded">T</kbd> トラッキング切替</p>
                <p><kbd className="bg-gray-700 px-1 rounded">M</kbd> マイク切替</p>
                <p><kbd className="bg-gray-700 px-1 rounded">D</kbd> デバッグ切替</p>
                <p><kbd className="bg-gray-700 px-1 rounded">Esc</kbd> パネル表示切替</p>
                <p className="mt-2 text-gray-500">Shift押しながらで大きく移動</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setSettings({
                  trackingSmoothing: 0.5,
                  trackingSpeed: 1.0,
                  faceTrackingEnabled: true,
                  bodyTrackingEnabled: true,
                  handTrackingEnabled: true,
                  lipSyncEnabled: true,
                  lipSyncSensitivity: 0.7,
                  blinkEnabled: true,
                  blinkInterval: 4,
                  idleAnimationEnabled: true,
                  mirrorMode: true,
                  debugMode: false,
                  showFPS: true,
                  showTrackingData: false,
                  gestureControl: true,
                  keyboardShortcuts: true,
                });
                addLog('設定をリセットしました', 'info');
              }}
              className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm transition-colors"
            >
              設定をリセット
            </button>
          </div>
        );
        
      case 'debug':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-400">FPS</div>
                <div className="text-2xl font-mono text-cyan-400">{debugData.fps}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-400">フレーム</div>
                <div className="text-2xl font-mono text-cyan-400">{debugData.frameCount}</div>
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-3 space-y-2">
              <h4 className="text-sm font-semibold text-cyan-300">トラッキング状態</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${debugData.faceDetected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>顔検出</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${debugData.poseDetected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>ポーズ検出</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${debugData.handsDetected.left ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>左手検出</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${debugData.handsDetected.right ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>右手検出</span>
                </div>
              </div>
            </div>
            
            {settings.showTrackingData && (
              <div className="bg-gray-800 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-cyan-300 mb-2">トラッキングデータ</h4>
                <pre className="text-xs font-mono text-gray-400 overflow-auto max-h-40">
                  {JSON.stringify(trackingData.face.rotation, null, 2)}
                </pre>
              </div>
            )}
            
            {debugData.lastError && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3">
                <div className="text-xs text-red-400">最後のエラー</div>
                <div className="text-sm text-red-300">{debugData.lastError}</div>
              </div>
            )}
            
            <div className="bg-gray-800 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-cyan-300 mb-2">ログ</h4>
              <div className="h-40 overflow-auto space-y-1">
                {logs.slice().reverse().map((log, i) => (
                  <div key={i} className={`text-xs font-mono ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    <span className="text-gray-500">{log.timestamp}</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
            
            <button 
              onClick={() => setLogs([])}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              ログをクリア
            </button>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="h-screen w-full bg-gray-900 text-white overflow-hidden flex">
      {/* Main Canvas Area */}
      <div 
        className="flex-1 relative"
        style={{ 
          backgroundColor: backgroundImage ? undefined : backgroundColor,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Video feed (hidden, for tracking) */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          className="hidden"
        />
        
        {/* Three.js Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />

        {/* No Model Placeholder */}
        {!vrmModel && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-8 bg-black/30 backdrop-blur rounded-2xl border border-white/10">
              <div className="text-6xl mb-4">🎭</div>
              <p className="text-xl text-white/80 mb-2">VRMモデルをドロップ</p>
              <p className="text-sm text-white/50">または設定パネルから選択</p>
            </div>
          </div>
        )}
        
        {/* Browser Overlay */}
        {showBrowser && browserUrl && (
          <div 
            className="absolute bg-gray-900 border border-cyan-500/50 rounded-lg overflow-hidden shadow-2xl"
            style={{
              left: `${browserPosition.x}%`,
              top: `${browserPosition.y}%`,
              width: browserSize.width,
              height: browserSize.height,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="bg-gray-800 px-3 py-1 flex items-center gap-2 text-xs">
              <div className="flex gap-1">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
              </div>
              <span className="text-gray-400 truncate flex-1">{browserUrl}</span>
            </div>
            <iframe 
              src={browserUrl}
              className="w-full h-full border-0"
              style={{ height: browserSize.height - 28 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        )}
        
        {/* Debug Overlay */}
        {settings.debugMode && (
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur rounded-lg p-4 font-mono text-xs space-y-1">
            <div className="text-cyan-400">FPS: {debugData.fps}</div>
            <div className="text-green-400">Status: {debugData.trackingStatus}</div>
            <div>Face: {debugData.faceDetected ? '✓' : '✗'}</div>
            <div>Pose: {debugData.poseDetected ? '✓' : '✗'}</div>
            <div>Hands: L:{debugData.handsDetected.left ? '✓' : '✗'} R:{debugData.handsDetected.right ? '✓' : '✗'}</div>
            <div className="text-gray-400">Pos: ({modelPosition.x.toFixed(2)}, {modelPosition.y.toFixed(2)}, {modelPosition.z.toFixed(2)})</div>
            <div className="text-gray-400">Scale: {modelScale.toFixed(2)}</div>
            <div className="text-gray-400">Rot: {modelRotation}°</div>
          </div>
        )}
        
        {/* FPS Counter */}
        {settings.showFPS && !settings.debugMode && (
          <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs font-mono text-cyan-400">
            {debugData.fps} FPS
          </div>
        )}
        
        {/* Status indicators */}
        <div className="absolute bottom-4 left-4 flex gap-2">
          {isTracking && (
            <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/50 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-green-400">トラッキング中</span>
            </div>
          )}
          {isMicEnabled && (
            <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/50 rounded-full px-3 py-1">
              <span className="text-xs">🎤</span>
              <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-75"
                  style={{ width: `${micLevel * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Toggle Settings Button */}
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="absolute top-4 right-4 bg-gray-800/80 hover:bg-gray-700 backdrop-blur p-2 rounded-lg transition-colors"
        >
          {showSettings ? '✕' : '☰'}
        </button>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="w-80 bg-gray-900/95 backdrop-blur border-l border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-700">
            <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              VTuber Studio
            </h1>
            <p className="text-xs text-gray-500 mt-1">配信アプリケーション</p>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-gray-700 overflow-x-auto">
            {[
              { id: 'model', icon: '🎭', label: 'モデル' },
              { id: 'tracking', icon: '📷', label: 'トラッキング' },
              { id: 'background', icon: '🖼', label: '背景' },
              { id: 'browser', icon: '🌐', label: 'ブラウザ' },
              { id: 'settings', icon: '⚙️', label: '設定' },
              { id: 'debug', icon: '🐛', label: 'デバッグ' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={`flex-shrink-0 px-3 py-2 text-sm transition-colors ${
                  activePanel === tab.id 
                    ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          
          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {renderSettingsPanel()}
          </div>
          
          {/* Footer */}
          <div className="p-3 border-t border-gray-700 text-xs text-gray-500 text-center">
            VTuber Studio v1.0 | Made with ❤️
          </div>
        </div>
      )}
    </div>
  );
};

export default VTuberApp;
