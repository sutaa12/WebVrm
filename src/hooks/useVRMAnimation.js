import { useEffect } from 'react';
import * as THREE from 'three';

export const useVRMAnimation = (vrm, trackingData, modelTransform, settings, micLevel = 0) => {
  useEffect(() => {
    if (!vrm) return;

    const { modelPosition, modelScale, modelRotation } = modelTransform;

    // Apply model transform
    vrm.scene.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
    vrm.scene.scale.setScalar(modelScale);
    vrm.scene.rotation.y = THREE.MathUtils.degToRad(modelRotation);

    // Apply face tracking
    if (settings.faceTrackingEnabled && trackingData.face) {
      const humanoid = vrm.humanoid;

      // Head rotation
      if (humanoid && humanoid.getNormalizedBoneNode('head')) {
        const head = humanoid.getNormalizedBoneNode('head');
        head.rotation.x = THREE.MathUtils.degToRad(trackingData.face.rotation.x * settings.trackingSpeed);
        head.rotation.y = THREE.MathUtils.degToRad(trackingData.face.rotation.y * settings.trackingSpeed);
        head.rotation.z = THREE.MathUtils.degToRad(trackingData.face.rotation.z * settings.trackingSpeed);
      }

      // Apply blend shapes (expressions)
      if (vrm.expressionManager && trackingData.face.blendShapes) {
        const blendShapes = trackingData.face.blendShapes;

        // Eye blink
        if (settings.blinkEnabled) {
          const blinkLeft = blendShapes.eyeBlinkLeft || 0;
          const blinkRight = blendShapes.eyeBlinkRight || 0;
          vrm.expressionManager.setValue('blinkLeft', blinkLeft);
          vrm.expressionManager.setValue('blinkRight', blinkRight);
          vrm.expressionManager.setValue('blink', (blinkLeft + blinkRight) / 2);
        }

        // Mouth (lip sync) - combine tracking and microphone
        if (settings.lipSyncEnabled) {
          const trackingMouth = (blendShapes.jawOpen || 0);
          const micMouth = micLevel || 0;
          const mouthOpen = Math.max(trackingMouth, micMouth) * settings.lipSyncSensitivity;
          const mouthSmile = (blendShapes.mouthSmileLeft || 0) + (blendShapes.mouthSmileRight || 0);
          vrm.expressionManager.setValue('aa', mouthOpen);
          vrm.expressionManager.setValue('happy', mouthSmile);
        }

        // Eyebrows
        const browUp = (blendShapes.browInnerUp || 0);
        const browDown = (blendShapes.browDownLeft || 0) + (blendShapes.browDownRight || 0);
        vrm.expressionManager.setValue('surprised', browUp);
        vrm.expressionManager.setValue('angry', browDown);

        // Eye look
        const eyeLookLeft = blendShapes.eyeLookInLeft || 0;
        const eyeLookRight = blendShapes.eyeLookInRight || 0;
        const eyeLookUp = blendShapes.eyeLookUpLeft || 0;
        const eyeLookDown = blendShapes.eyeLookDownLeft || 0;

        if (vrm.lookAt) {
          vrm.lookAt.target.x = (eyeLookRight - eyeLookLeft) * 2;
          vrm.lookAt.target.y = (eyeLookUp - eyeLookDown) * 2;
        }
      }
    }

    // Apply pose tracking (upper body)
    if (settings.bodyTrackingEnabled && trackingData.pose && vrm.humanoid) {
      const humanoid = vrm.humanoid;
      const pose = trackingData.pose;

      // Shoulder rotation based on shoulder position
      if (humanoid.getNormalizedBoneNode('leftUpperArm')) {
        const leftShoulder = humanoid.getNormalizedBoneNode('leftUpperArm');
        const shoulderAngle = Math.atan2(
          pose.elbows.left.y - pose.shoulders.left.y,
          pose.elbows.left.x - pose.shoulders.left.x
        );
        leftShoulder.rotation.z = shoulderAngle - Math.PI / 2;
      }

      if (humanoid.getNormalizedBoneNode('rightUpperArm')) {
        const rightShoulder = humanoid.getNormalizedBoneNode('rightUpperArm');
        const shoulderAngle = Math.atan2(
          pose.elbows.right.y - pose.shoulders.right.y,
          pose.elbows.right.x - pose.shoulders.right.x
        );
        rightShoulder.rotation.z = shoulderAngle - Math.PI / 2;
      }

      // Elbow rotation
      if (humanoid.getNormalizedBoneNode('leftLowerArm')) {
        const leftElbow = humanoid.getNormalizedBoneNode('leftLowerArm');
        const elbowAngle = Math.atan2(
          pose.wrists.left.y - pose.elbows.left.y,
          pose.wrists.left.x - pose.elbows.left.x
        );
        leftElbow.rotation.z = elbowAngle;
      }

      if (humanoid.getNormalizedBoneNode('rightLowerArm')) {
        const rightElbow = humanoid.getNormalizedBoneNode('rightLowerArm');
        const elbowAngle = Math.atan2(
          pose.wrists.right.y - pose.elbows.right.y,
          pose.wrists.right.x - pose.elbows.right.x
        );
        rightElbow.rotation.z = elbowAngle;
      }
    }

    // Apply hand tracking
    if (settings.handTrackingEnabled && trackingData.hands && vrm.humanoid) {
      const humanoid = vrm.humanoid;

      // Left hand
      if (trackingData.hands.left.detected && trackingData.hands.left.landmarks.length > 0) {
        const leftHand = humanoid.getNormalizedBoneNode('leftHand');
        if (leftHand) {
          const landmarks = trackingData.hands.left.landmarks;
          const wrist = landmarks[0];
          const middleFinger = landmarks[9];

          const handAngle = Math.atan2(
            middleFinger.y - wrist.y,
            middleFinger.x - wrist.x
          );
          leftHand.rotation.z = handAngle;
        }
      }

      // Right hand
      if (trackingData.hands.right.detected && trackingData.hands.right.landmarks.length > 0) {
        const rightHand = humanoid.getNormalizedBoneNode('rightHand');
        if (rightHand) {
          const landmarks = trackingData.hands.right.landmarks;
          const wrist = landmarks[0];
          const middleFinger = landmarks[9];

          const handAngle = Math.atan2(
            middleFinger.y - wrist.y,
            middleFinger.x - wrist.x
          );
          rightHand.rotation.z = handAngle;
        }
      }
    }

    // Auto blink
    if (settings.blinkEnabled && !trackingData.face.blendShapes.eyeBlinkLeft) {
      const time = Date.now() / 1000;
      const blinkInterval = settings.blinkInterval || 4;
      if (Math.floor(time) % blinkInterval === 0 && time % 1 < 0.15) {
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('blink', 1);
        }
      }
    }

    // Idle animation (breathing)
    if (settings.idleAnimationEnabled && vrm.humanoid) {
      const time = Date.now() / 1000;
      const chest = vrm.humanoid.getNormalizedBoneNode('chest');
      if (chest) {
        const breathe = Math.sin(time * 2) * 0.02;
        chest.rotation.x = breathe;
      }
    }

  }, [vrm, trackingData, modelTransform, settings, micLevel]);
};
