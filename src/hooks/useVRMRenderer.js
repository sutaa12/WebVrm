import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export const useVRMRenderer = (canvasRef, vrmUrl) => {
  const [vrm, setVrm] = useState(null);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      30,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      20
    );
    camera.position.set(0, 1.3, 3);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, Math.PI);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5 * Math.PI);
    scene.add(ambientLight);

    // Grid helper (optional)
    const gridHelper = new THREE.GridHelper(10, 10);
    gridHelper.visible = false;
    scene.add(gridHelper);

    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current) return;
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();

      if (vrm) {
        vrm.update(delta);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [canvasRef]);

  // Load VRM model
  useEffect(() => {
    if (!vrmUrl || !sceneRef.current) return;

    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    // Remove previous VRM if exists
    if (vrm) {
      sceneRef.current.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      setVrm(null);
    }

    setError(null);

    loader.load(
      vrmUrl,
      (gltf) => {
        const loadedVrm = gltf.userData.vrm;

        if (loadedVrm) {
          // VRM setup
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);

          // Disable frustum culling for VRM
          loadedVrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
          });

          sceneRef.current.add(loadedVrm.scene);
          setVrm(loadedVrm);
          setError(null);

          console.log('VRM loaded successfully:', loadedVrm);
        } else {
          setError('Invalid VRM file');
        }
      },
      (progress) => {
        console.log('Loading VRM:', (progress.loaded / progress.total) * 100, '%');
      },
      (err) => {
        console.error('Error loading VRM:', err);
        setError(err.message || 'Failed to load VRM');
      }
    );
  }, [vrmUrl]);

  return {
    vrm,
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    error,
  };
};
