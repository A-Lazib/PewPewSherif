import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import * as tf from "@tensorflow/tfjs"
import * as facemesh from "@tensorflow-models/facemesh"
import Webcam from 'react-webcam';
import './space.js';

function App() {
  const [started, setStarted] = useState(false);
  const webcamRef = useRef(null)
  const controlStateRef = useRef({ lastDir: 'none' });
  const processRef = useRef(false);
  const offscreenCanvasRef = useRef(null);
  const offscreenCtxRef = useRef(null);
  const tiltBufferRef = useRef([]);
  const tiltHoldRef = useRef({ left: 0, right: 0, none: 0, lastCandidate: 'none' });
  const axisEmaRef = useRef(0);
  const stopDetectRef = useRef(false);
  const detDelayRef = useRef(300);

  // Load facemesh function
  const runFacemesh = async () =>{
    // Force CPU backend to avoid WebGL errors and stabilize performance
    await tf.setBackend('cpu');
    await tf.ready();

    const net = await facemesh.load({
      inputResolution:{width:160, height:120}, scale:0.8, maxFaces: 1 
    });
    console.log('Facemesh loaded successfully!');
    
    // Adaptive detection loop using setTimeout to avoid overlap
    const scheduleDetect = () => {
      if (stopDetectRef.current) return;
      setTimeout(() => {
        detect(net).catch(() => {}).finally(() => {
          // Next cycle scheduled inside detect after computing detDelay
        });
      }, detDelayRef.current);
    };
    scheduleDetect();
    
    return () => { stopDetectRef.current = true; };
  };
  
  useEffect(() => {
    if (!started) return;

    stopDetectRef.current = false;
    let cleanup;

    // Load facemesh asynchronously after game starts
    const t = setTimeout(() => {
      runFacemesh()
        .then(cleanupFunc => {
          cleanup = cleanupFunc;
          console.log('✅ Facemesh is running');
        })
        .catch(err => {
          console.error('❌ Facemesh failed to load:', err.message);
          console.log('Game will still work with keyboard controls (Arrow keys + Space)');
        });
    }, 15);

    return () => {
      clearTimeout(t);
      if (cleanup) cleanup();
    };
  }, [started]);

  const handleStart = () => {
    setStarted(true);
    // Delay a tick to ensure the canvas exists in the DOM
    setTimeout(() => {
      if (window.startSpaceGame) window.startSpaceGame();
    }, 0);
  };

  // Detect function (detects head model and generates game controls)
  const detect = async (net) => {
    if(
      webcamRef.current &&
      webcamRef.current.video.readyState === 4
    ) {
      if (processRef.current) return; // avoid overlapping runs
      processRef.current = true;

      const t0 = performance.now();

      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Prepare offscreen canvas for faster fromPixels
      if (!offscreenCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 96;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        offscreenCanvasRef.current = c;
        offscreenCtxRef.current = ctx;
      }
      const ctx = offscreenCtxRef.current;
      // Draw current frame
      ctx.drawImage(video, 0, 0, offscreenCanvasRef.current.width, offscreenCanvasRef.current.height);

      // Estimate faces
      const face = await net.estimateFaces(offscreenCanvasRef.current, false, true);
      
      // If no face, keep keyboard controls working

      if (face.length) {
        const keypoints = face[0].scaledMesh;
        
        // Compute face bounding box to get center and size (robust across cameras)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < keypoints.length; i++) {
          const x = keypoints[i][0];
          const y = keypoints[i][1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const faceWidth = Math.max(1, maxX - minX);
        const faceHeight = Math.max(1, maxY - minY);
        // Use ear tilt (roll) for left/right control, normalized by face height
        const leftEar = keypoints[234];
        const rightEar = keypoints[454];
        // Invert mapping to fix reversed direction and smooth with rolling average
        const tiltInstant = (leftEar[1] - rightEar[1]) / faceHeight; // >0: tilt right, <0: tilt left
        const buf = tiltBufferRef.current;
        buf.push(tiltInstant);
        if (buf.length > 5) buf.shift();
        const tiltNorm = buf.reduce((a, b) => a + b, 0) / buf.length;
        
        // Mouth openness detection (normalized by face height)
        const upperLip = keypoints[13];
        const lowerLip = keypoints[14];
        const mouthDistance = Math.abs(upperLip[1] - lowerLip[1]);
        const mouthNorm = mouthDistance / faceHeight;
        
        // Hysteresis thresholds for tilt
        // Stronger thresholds and multi-frame gating to reduce sensitivity
        const dzActivate = 0.10; // require more tilt to start
        const dzRelease = 0.06;  // release sooner when neutral
        const ACTIVATE_FRAMES = 3; // need consecutive frames to engage
        const RELEASE_FRAMES = 2;  // need consecutive neutral frames to disengage

        // Candidate direction based on tilt
        let candidate = 'none';
        if (tiltNorm < -dzActivate) candidate = 'left';
        else if (tiltNorm > dzActivate) candidate = 'right';

        // Update hold counters
        if (candidate !== tiltHoldRef.current.lastCandidate) {
          tiltHoldRef.current.left = 0;
          tiltHoldRef.current.right = 0;
          tiltHoldRef.current.none = 0;
          tiltHoldRef.current.lastCandidate = candidate;
        }
        tiltHoldRef.current[candidate] += 1;

        // Decide direction with gating + hysteresis
        if (candidate === 'left' && tiltHoldRef.current.left >= ACTIVATE_FRAMES) {
          controlStateRef.current.lastDir = 'left';
        } else if (candidate === 'right' && tiltHoldRef.current.right >= ACTIVATE_FRAMES) {
          controlStateRef.current.lastDir = 'right';
        } else if (candidate === 'none' && Math.abs(tiltNorm) < dzRelease) {
          // Count neutral frames to release
          if (tiltHoldRef.current.none >= RELEASE_FRAMES) {
            controlStateRef.current.lastDir = 'none';
          }
        }

        const left = controlStateRef.current.lastDir === 'left';
        const right = controlStateRef.current.lastDir === 'right';

        // Map tilt to analog axis with deadzone and EMA smoothing
        const dead = 0.10; // no movement within this tilt
        const maxTilt = 0.30; // tilt at which speed caps
        let axisTarget = 0;
        if (Math.abs(tiltNorm) > dead) {
          const sign = Math.sign(tiltNorm);
          const mag = Math.min(1, (Math.abs(tiltNorm) - dead) / (maxTilt - dead));
          axisTarget = sign * mag;
        }
        axisEmaRef.current = axisEmaRef.current * 0.85 + axisTarget * 0.15;

        const controls = {
          left,
          right,
          mouthOpen: mouthNorm > 0.08,
          axisX: axisEmaRef.current,
        };

        // Optional debug snapshot
        // console.log('DEBUG - offsetAdj:', offsetAdj.toFixed(3), 'mouthNorm:', mouthNorm.toFixed(3));

        // Send controls to Space Invaders game
        if (window.updateGameControls) {
          window.updateGameControls(controls);
        }
      }

      // Adaptive delay based on how long detection took
      const elapsed = performance.now() - t0;
      detDelayRef.current = Math.min(500, Math.max(180, elapsed * 3));

      processRef.current = false;
      // Schedule next detection
      if (!stopDetectRef.current) {
        setTimeout(() => {
          detect(net).catch(() => {});
        }, detDelayRef.current);
      }
    }
  };

  return (
    <div className="App">
      {!started ? (
        <div className="StartScreen">
          <div className="StartDecor StartDecor--stars" aria-hidden="true" />
          <div className="StartDecor StartDecor--planet" aria-hidden="true" />
          <div className="StartDecor StartDecor--ufo" aria-hidden="true" />

          <div className="StartCard">
            <div className="StartKicker">Axel Lazib & Darine Abdelmotalib present…</div>
            <div className="StartTitle">PewPew<br/>Sherif</div>
            <div className="StartSubtitle">Tilt to move • Open mouth to shoot</div>

            <button className="StartButton" onClick={handleStart}>
              Start
            </button>
          </div>
        </div>
      ) : (
        <>
          <Webcam
            ref={webcamRef}
            mirrored={false}
            videoConstraints={{ width: 320, height: 240, facingMode: 'user' }}
            className="WebcamPreview"
          />

          <canvas id="board"></canvas>
        </>
      )}
    </div>
  );
}

export default App;
