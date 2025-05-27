import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, useAnimations } from '@react-three/drei';
import { useEffect, useState } from 'react';
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

function Model({ url, animationName }: { url: string, animationName?: string }) {
  // Always call hooks, fallback to a valid .glb if url is invalid
  const fallbackUrl = '/models/jacket.glb';
  const safeUrl = (url && typeof url === 'string' && url.trim() !== '') ? url : fallbackUrl;
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

  // Only render if url is valid, otherwise render nothing
  if (!url || typeof url !== 'string' || url.trim() === '') return null;

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

  if (!url) return null;

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
          <Model url={selectedClothing} animationName={selectedAnimation} />
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