import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export const useMediaPipeTracking = (videoRef, isTracking, settings) => {
  const [trackingData, setTrackingData] = useState({
    face: {
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      blendShapes: {},
    },
    pose: {
      shoulders: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
      elbows: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
      wrists: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
    },
    hands: {
      left: { landmarks: [], detected: false },
      right: { landmarks: [], detected: false },
    },
  });

  const [detectionStatus, setDetectionStatus] = useState({
    faceDetected: false,
    poseDetected: false,
    handsDetected: { left: false, right: false },
  });

  const faceLandmarkerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(-1);

  // Initialize MediaPipe
  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        // Initialize Face Landmarker
        if (settings.faceTrackingEnabled) {
          faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
        }

        // Initialize Pose Landmarker
        if (settings.bodyTrackingEnabled) {
          poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }

        // Initialize Hand Landmarker
        if (settings.handTrackingEnabled) {
          handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
          });
        }

        console.log('MediaPipe initialized successfully');
      } catch (error) {
        console.error('Failed to initialize MediaPipe:', error);
      }
    };

    initializeMediaPipe();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, [settings.faceTrackingEnabled, settings.bodyTrackingEnabled, settings.handTrackingEnabled]);

  // Tracking loop
  const predict = useCallback(async () => {
    if (!isTracking || !videoRef.current || videoRef.current.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(predict);
      return;
    }

    const now = performance.now();
    const video = videoRef.current;

    try {
      const newTrackingData = { ...trackingData };
      const newDetectionStatus = { faceDetected: false, poseDetected: false, handsDetected: { left: false, right: false } };

      // Face tracking
      if (settings.faceTrackingEnabled && faceLandmarkerRef.current) {
        const faceResults = faceLandmarkerRef.current.detectForVideo(video, now);

        if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
          newDetectionStatus.faceDetected = true;
          const landmarks = faceResults.faceLandmarks[0];

          // Calculate head rotation from landmarks
          const noseTip = landmarks[1];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const chin = landmarks[152];

          // Estimate rotation
          const eyeCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2,
            z: (leftEye.z + rightEye.z) / 2,
          };

          const yaw = (noseTip.x - 0.5) * 60; // Left-right rotation
          const pitch = (noseTip.y - eyeCenter.y) * 60; // Up-down rotation
          const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

          newTrackingData.face.rotation = {
            x: settings.mirrorMode ? -pitch : pitch,
            y: settings.mirrorMode ? -yaw : yaw,
            z: settings.mirrorMode ? -roll : roll,
          };

          // Blend shapes
          if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
            const blendShapes = {};
            faceResults.faceBlendshapes[0].categories.forEach((category) => {
              blendShapes[category.categoryName] = category.score;
            });
            newTrackingData.face.blendShapes = blendShapes;
          }
        }
      }

      // Pose tracking
      if (settings.bodyTrackingEnabled && poseLandmarkerRef.current) {
        const poseResults = poseLandmarkerRef.current.detectForVideo(video, now);

        if (poseResults.landmarks && poseResults.landmarks.length > 0) {
          newDetectionStatus.poseDetected = true;
          const pose = poseResults.landmarks[0];

          // Normalize coordinates (MediaPipe gives normalized values 0-1)
          newTrackingData.pose = {
            shoulders: {
              left: { x: pose[11].x, y: pose[11].y },
              right: { x: pose[12].x, y: pose[12].y },
            },
            elbows: {
              left: { x: pose[13].x, y: pose[13].y },
              right: { x: pose[14].x, y: pose[14].y },
            },
            wrists: {
              left: { x: pose[15].x, y: pose[15].y },
              right: { x: pose[16].x, y: pose[16].y },
            },
          };
        }
      }

      // Hand tracking
      if (settings.handTrackingEnabled && handLandmarkerRef.current) {
        const handResults = handLandmarkerRef.current.detectForVideo(video, now);

        if (handResults.landmarks && handResults.landmarks.length > 0) {
          handResults.handedness.forEach((handedness, index) => {
            const hand = handedness[0].categoryName.toLowerCase();
            newDetectionStatus.handsDetected[hand] = true;
            newTrackingData.hands[hand] = {
              landmarks: handResults.landmarks[index],
              detected: true,
            };
          });
        }
      }

      // Apply smoothing
      if (settings.trackingSmoothing > 0) {
        const smooth = settings.trackingSmoothing;
        newTrackingData.face.rotation.x = lerp(trackingData.face.rotation.x, newTrackingData.face.rotation.x, 1 - smooth);
        newTrackingData.face.rotation.y = lerp(trackingData.face.rotation.y, newTrackingData.face.rotation.y, 1 - smooth);
        newTrackingData.face.rotation.z = lerp(trackingData.face.rotation.z, newTrackingData.face.rotation.z, 1 - smooth);
      }

      setTrackingData(newTrackingData);
      setDetectionStatus(newDetectionStatus);

    } catch (error) {
      console.error('Tracking error:', error);
    }

    lastTimeRef.current = now;
    animationFrameRef.current = requestAnimationFrame(predict);
  }, [isTracking, settings, trackingData, videoRef]);

  // Start/stop tracking
  useEffect(() => {
    if (isTracking) {
      predict();
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTracking, predict]);

  return { trackingData, detectionStatus };
};

// Helper function for linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}
