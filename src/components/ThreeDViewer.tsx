import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useAnimations, Text } from '@react-three/drei';
import React, { useEffect, useState, Suspense } from 'react';
import { XR, ARButton, VRButton, createXRStore } from '@react-three/xr';
import { TextureLoader } from 'three';

// Sample clothing models and animations
const clothingOptions = [
  { name: 'Jacket', url: '/models/jacket.glb' },
  { name: 'Dress', url: '/models/dress.glb' },
  { name: 'Tee', url: '/models/tee.glb' },
];
const animationOptions = [
  { name: 'Idle', value: 'Idle' },
  { name: 'Walk', value: 'Walk' },
  { name: 'Spin', value: 'Spin' },
];

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown) {
    // Update state so the next render will show the fallback UI.
    // Ensure error is an Error instance or convert it
    const typedError = error instanceof Error ? error : new Error(String(error));
    return { hasError: true, error: typedError };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Caught an error in ThreeDViewer:", error, errorInfo);
    // Example logging: logErrorToMyService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <div>Error loading 3D model.</div>;
    }
    return this.props.children;
  }
}

// Model component - Call hooks unconditionally
function Model({ url, animationName }: { url: string, animationName?: string }) {
  // Always call hooks at the top level!
  // useGLTF will suspend while loading and might throw if url is invalid.
  // This is handled by Suspense and ErrorBoundary.
  const { scene, animations } = useGLTF(url); // Use the direct url prop
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    // Only try to play animation if actions and the specific animation exist
    // No need for inCanvas check here, as Model is inside Canvas
    let didSetup = false;
    let cleanup: (() => void) | undefined;
    if (animationName && actions && actions[animationName]) {
      actions[animationName].reset().play();
      cleanup = () => { actions[animationName]?.stop(); };
      didSetup = true;
    }
    return didSetup ? cleanup : undefined;
  }, [actions, animationName]); // actions dependency is fine here

  // Only render the primitive if the scene is loaded
  if (!scene) return null;

  return <primitive object={scene} />;
}

// Add ClothingBillboard component for 2D overlay
function ClothingBillboard({ imageUrl, position = [0, 1, 0], scale = [1, 1, 1] }: { imageUrl: string, position?: [number, number, number], scale?: [number, number, number] }) {
  const texture = useLoader(TextureLoader, imageUrl);
  return (
    <mesh position={position} scale={scale}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

const xrStore = createXRStore();

export default function ThreeDViewer({ url, clothingImageUrl, clothingPosition = [0, 1, 0], clothingScale = [1, 1, 1] }: { url: string, clothingImageUrl?: string, clothingPosition?: [number, number, number], clothingScale?: [number, number, number] }) {
  // State for clothing and animation selection
  const [selectedClothing, setSelectedClothing] = useState(clothingOptions[0].url);
  const [selectedAnimation, setSelectedAnimation] = useState(animationOptions[0].value);

  // Interactive state for overlay position/scale
  const [overlayPos, setOverlayPos] = useState<[number, number, number]>(clothingPosition);
  const [overlayScale, setOverlayScale] = useState<[number, number, number]>(clothingScale);

  // If a url is passed from parent, use it as the default clothing
  useEffect(() => {
    if (url) {
        setSelectedClothing(url);
    }
  }, [url]);

  // Sync prop changes
  useEffect(() => {
    setOverlayPos(clothingPosition);
  }, [clothingPosition]);
  useEffect(() => {
    setOverlayScale(clothingScale);
  }, [clothingScale]);

  return (
    <div style={{ width: '100%', height: 540, borderRadius: 12, overflow: 'hidden', background: '#f3f3f3' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
        <label className="text-sm font-medium">Clothing:</label>
        <select
          value={selectedClothing}
          onChange={e => setSelectedClothing(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
          aria-label="Select clothing model"
          // disabled={!!url} // Optional: disable if a generated URL is present
        >
          {/* Include the current 'url' prop in the options if it's different from defaults */}
          {url && !clothingOptions.find(opt => opt.url === url) && (
              <option key={url} value={url}>Generated Model</option>
          )}
          {clothingOptions.map(opt => (
            <option key={opt.url} value={opt.url}>{opt.name}</option>
          ))}
        </select>
        <label className="text-sm font-medium ml-4">Animation:</label>
        <select
          value={selectedAnimation}
          onChange={e => setSelectedAnimation(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
          aria-label="Select animation"
        >
          {animationOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.name}</option>
          ))}
        </select>
      </div>
      <XR store={xrStore}>
        <Canvas camera={{ position: [0, 1, 2.5], fov: 45 }} shadows>
          <ambientLight intensity={0.7} />
          {selectedClothing && typeof selectedClothing === 'string' && selectedClothing.trim() !== '' ? (
            <>
              <directionalLight position={[2, 5, 2]} intensity={1.2} castShadow />
              <Environment preset="city" />
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <Model url={selectedClothing} animationName={selectedAnimation} />
                  {/* Overlay clothing image as billboard if provided */}
                  {clothingImageUrl && (
                    <ClothingBillboard imageUrl={clothingImageUrl} position={overlayPos} scale={overlayScale} />
                  )}
                </Suspense>
              </ErrorBoundary>
              <OrbitControls enablePan enableZoom enableRotate />
            </>
          ) : (
             <Text scale={0.1} position={[0, 0, 0]} color="black" anchorX="center" anchorY="middle">
               Upload photo to generate 3D model
             </Text>
          )}
        </Canvas>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <ARButton store={xrStore} />
          <VRButton store={xrStore} />
        </div>
      </XR>
      {/* Interactive controls for overlay position/scale */}
      {clothingImageUrl && (
        <div style={{ marginTop: 16, background: '#fff', borderRadius: 8, padding: 12, boxShadow: '0 1px 4px #0001', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Adjust Clothing Overlay</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {/* Position sliders */}
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div key={axis} style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12 }}>Position {axis}: {overlayPos[i].toFixed(2)}</label>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={overlayPos[i]}
                  onChange={e => {
                    const newPos = [...overlayPos] as [number, number, number];
                    newPos[i] = parseFloat(e.target.value);
                    setOverlayPos(newPos);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
            {/* Scale sliders */}
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div key={axis + 's'} style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12 }}>Scale {axis}: {overlayScale[i].toFixed(2)}</label>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.01}
                  value={overlayScale[i]}
                  onChange={e => {
                    const newScale = [...overlayScale] as [number, number, number];
                    newScale[i] = parseFloat(e.target.value);
                    setOverlayScale(newScale);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

useGLTF.preload = () => {}; 