// Intall dependencies
  // npm install @tensorflow/tfjs @tensorflow-models/facemesh react-webcam
  // npm run start
// Import dependencies
  // Import react, useRef to avoid avoid rerenders whenever there are changes, and our dependencies
// Setup webcam and canvas
// Define references to those
// Load facemesh
// Detect function
// Drawing utilities
// Load triangulation
// Setup triangulation path
// Setup point drawing
// Add drawMesh to detect function

import React, {useRef, useEffect, useState} from 'react';
//import logo from './logo.svg';
import './App.css';
import * as tf from "@tensorflow/tfjs"
import * as facemesh from "@tensorflow-models/facemesh"
import Webcam from 'react-webcam';
import { drawMesh, estimateHeadDirection, estimateMouthOpenness, generateGameControls, CONTROL_THRESHOLDS} from './utilities';

function App() {
  // Set up references
  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const [directionText, setDirectionText] = useState('');
  const [gameControls, setGameControls] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    mouthOpen: false,
  });
  const prevSmoothedRef = useRef({});  // For smoothing state across frames


  // Load facemesh function
  const runFacemesh = async () =>{
    const net = await facemesh.load({
      // inputres = size of photo passed to facemesh
      // scale = the amount of pixels facemesh actually processes
      inputResolution:{width:640, height:480}, scale:0.8 
    });
    // setInterval(()=>{
    //   detect(net)
    // }, 100)
    let rafId;
    const loop = () => {
      detect(net);
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => rafId && cancelAnimationFrame(rafId);
  };
  
  useEffect(() => {
    let cleanup;
    (async () => {
      cleanup = await runFacemesh();
    })();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);
  // Detect function (detects head model and generates game controls)
  const detect = async (net) => {
    if(
      webcamRef.current &&
      webcamRef.current.video.readyState === 4
    ) {
      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      video.width = videoWidth;
      video.height = videoHeight;
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;

      // Estimate faces with mirroring enabled (3rd param = true)
      const face = await net.estimateFaces(video, false, true);

      // Draw mesh overlay
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, videoWidth, videoHeight);
      drawMesh(face, ctx);

      if (face.length) {
        // Extract head direction and mouth openness
        const headDir = estimateHeadDirection(face[0]);
        const mouth = estimateMouthOpenness(face[0]);

        // Generate game controls with smoothing
        const controls = generateGameControls(headDir, mouth, prevSmoothedRef.current);
        
        // Update smoothing state for next frame
        prevSmoothedRef.current = {
          rawYaw: controls.rawYaw,
          rawPitch: controls.rawPitch,
          rawMouthGap: controls.rawMouthGap,
        };

        // Update game controls state
        setGameControls(controls);

        // Display debug info
        const dirStr = `L/R: ${controls.left ? '←' : controls.right ? '→' : '·'} | U/D: ${controls.up ? '↑' : controls.down ? '↓' : '·'} | Click: ${controls.mouthOpen ? '✓' : '✗'}`;
        const rawStr = `Raw: yaw=${headDir.yaw.toFixed(3)} pitch=${headDir.pitch.toFixed(3)} mouth=${mouth.mouthGap.toFixed(3)}`;
        setDirectionText(`${dirStr}\n${rawStr}`);
      } else {
        setDirectionText('no face detected');
        setGameControls({
          left: false,
          right: false,
          up: false,
          down: false,
          mouthOpen: false,
        });
      }
    }
  };
  return (
    <div className="App">

      /* Styling */
      <Webcam ref={webcamRef} style={
        {
          position:"absolute",
          marginLeft:"auto",
          marginRight:"auto",
          left:0,
          right:0,
          textAlign:'center',
          zIndex:9,
          width:640,
          height:480,
          transform: "scaleX(-1)" // added to flip video visually for user
        }
      } />

      <canvas ref={canvasRef} style={
        {
          position:"absolute",
          marginLeft:"auto",
          marginRight:"auto",
          left:0,
          right:0,
          textAlign:'center',
          zIndex:9,
          width:640,
          height:480
        }
      } />

      <div style={{
        position:"absolute",
        bottom:10,
        left:0,
        right:0,
        textAlign:'center',
        zIndex:11,
        color:"#fff",
        fontWeight:"bold",
        textShadow:"0 1px 2px #000"
      }}>
        {directionText}
      </div>
    </div>
  );
}

export default App;
