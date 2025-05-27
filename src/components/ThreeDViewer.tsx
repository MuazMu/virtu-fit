import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useAnimations } from '@react-three/drei';
import React, { useEffect, useState, Suspense } from 'react';
import { XR, ARButton, VRButton, createXRStore } from '@react-three/xr';

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
class ErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // You can log the error to an error reporting service
    console.error("Caught an error in ThreeDViewer:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <div>Error loading 3D model.</div>;
    }
    return this.props.children;
  }
}

function Model({ url, animationName }: { url: string, animationName?: string }) {
  // Always call hooks, fallback to a valid .glb if url is invalid
  const fallbackUrl = '/models/jacket.glb';
  const safeUrl = (url && typeof url === 'string' && url.trim() !== '') ? url : fallbackUrl;

  // Context check: only render if inside Canvas
  let inCanvas = true;
  try {
    useThree();
  } catch {
    inCanvas = false;
  }

  const { scene, animations } = useGLTF(safeUrl);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    let didSetup = false;
    let cleanup: (() => void) | undefined;
    if (animationName && actions && actions[animationName]) {
      actions[animationName].reset().play();
      cleanup = () => { actions[animationName]!.stop(); };
      didSetup = true;
    }
    return didSetup ? cleanup : undefined;
  }, [actions, animationName]);

  // Only render if url is valid and inCanvas is true
  if (!url || typeof url !== 'string' || url.trim() === '' || !inCanvas) return null;

  return <primitive object={scene} />;
}

const xrStore = createXRStore();

export default function ThreeDViewer({ url }: { url: string }) {
  // State for clothing and animation selection
  const [selectedClothing, setSelectedClothing] = useState(clothingOptions[0].url);
  const [selectedAnimation, setSelectedAnimation] = useState(animationOptions[0].value);

  // If a url is passed from parent, use it as the default clothing
  useEffect(() => {
    if (url) setSelectedClothing(url);
  }, [url]);

  // This check is already here and correctly placed after hooks.
  if (!url) return null; // Keep this existing check

  // Add another explicit check before rendering the main structure
  if (!url || typeof url !== 'string' || url.trim() === '') {
      console.error("ThreeDViewer received invalid URL:", url);
      return null; // Do not render anything if URL is still invalid at this point
  }

  return (
    <div style={{ width: '100%', height: 440, borderRadius: 12, overflow: 'hidden', background: '#f3f3f3' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
        <label className="text-sm font-medium">Clothing:</label>
        <select
          value={selectedClothing}
          onChange={e => setSelectedClothing(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
          aria-label="Select clothing model"
        >
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
          <directionalLight position={[2, 5, 2]} intensity={1.2} castShadow />
          <Environment preset="city" />
          <ErrorBoundary>
            <Suspense fallback={null}>
              <Model url={selectedClothing} animationName={selectedAnimation} />
            </Suspense>
          </ErrorBoundary>
          <OrbitControls enablePan enableZoom enableRotate />
        </Canvas>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <ARButton store={xrStore} />
          <VRButton store={xrStore} />
        </div>
      </XR>
    </div>
  );
}

useGLTF.preload = () => {}; 